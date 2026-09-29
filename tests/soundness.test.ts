/**
 * Soundness + decoding tests for the Redacted circuit (src/circuit) and both output decoders
 * (the verify page's src/utils/proofOutputs.ts and the agent CLI's outputsOf).
 *
 * Synthetic data only: an ephemeral RSA key signs a synthetic DKIM header. No real email, no DNS.
 * Run: yarn test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Noir, type CompiledCircuit } from "@noir-lang/noir_js";
import { bnToLimbStrArray } from "@mach-34/noir-bignum-paramgen";
import { Barretenberg, UltraHonkBackend, UltraHonkVerifierBackend } from "@aztec/bb.js";
import { sha256Pad } from "@zk-email/helpers/dist/sha-utils";
import { decodeMaskedBytes } from "../src/utils/proofOutputs";
// @ts-expect-error - plain JS module without types
import { outputsOf } from "../skills/redacted-email-proof/scripts/redacted.mjs";

const ROOT = join(import.meta.dirname, "..");
const CIRCUIT = "email_mask_2048_small";
const H = 2048;
const B = 4096;
const circuit = JSON.parse(readFileSync(join(ROOT, "src/circuit/target", `${CIRCUIT}.json`), "utf8")) as CompiledCircuit;

// Lengths ≡ 16 (mod 32) on purpose: the SHA-256 length field then ends in byte 0x80, which is
// exactly what the old "find the 0x80 padding marker" decoder heuristic mistook for the marker.
function syntheticEmail() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const modulus = BigInt("0x" + Buffer.from(publicKey.export({ format: "jwk" }).n!, "base64url").toString("hex"));
  let bodyText = "Hello from a synthetic signed body. Ünïcödé ok.\r\n";
  while (Buffer.byteLength(bodyText) % 32 !== 16) bodyText = "x" + bodyText;
  const body = Buffer.from(bodyText);
  const bh = createHash("sha256").update(body).digest("base64");
  const build = (pad: string) =>
    Buffer.from(
      `from:fixture@example.test\r\nsubject:Synthetic ${pad}\r\n` +
        `dkim-signature:v=1; a=rsa-sha256; d=example.test; s=test; bh=${bh}; b=`
    );
  let pad = "";
  while (build(pad).length % 32 !== 16) pad += "p";
  const header = build(pad);
  const signature = BigInt("0x" + sign("RSA-SHA256", header, privateKey).toString("hex"));
  const dkimAt = header.indexOf("dkim-signature:");
  // Same layout the real input generator (@zk-email/zkemail-nr → helpers' sha256Pad) produces:
  // content, then SHA-256 padding (0x80, zeros, 64-bit bit length), then zeros up to the max.
  const storage = (bytes: Buffer, size: number) => [...sha256Pad(new Uint8Array(bytes), size)[0]].map(String);
  const inputs = {
    header: { storage: storage(header, H), len: String(header.length) },
    body: { storage: storage(body, B), len: String(body.length) },
    pubkey: {
      modulus: bnToLimbStrArray(modulus, 2048),
      redc: bnToLimbStrArray((1n << (2n * 2048n + 6n)) / modulus),
    },
    signature: bnToLimbStrArray(signature, 2048),
    body_hash_index: String(header.indexOf(bh)),
    dkim_header_sequence: { index: String(dkimAt), length: String(header.length - dkimAt) },
    header_mask: Array(H).fill(true),
    body_mask: Array(B).fill(true),
  };
  return { header, body, inputs };
}

type ReturnValue = [string[], string[], string[]];
const execute = async (inputs: object) =>
  (await new Noir(circuit).execute(inputs as never)).returnValue as unknown as ReturnValue;
const bytesOf = (fields: string[]) => fields.map((x) => Number(BigInt(x)));
const toPublicInputs = (rv: ReturnValue) =>
  [...rv[0], ...rv[1], ...rv[2]].map((x) => "0x" + BigInt(x).toString(16).padStart(64, "0"));

// Writes `text` into BoundedVec storage starting exactly at len (the unsigned tail).
function injectAfterLen(vec: { storage: string[]; len: string }, text: string) {
  [...Buffer.from(text)].forEach((b, i) => (vec.storage[Number(vec.len) + i] = String(b)));
}

test("circuit publicly commits to the signed header and body lengths", async () => {
  const { header, body, inputs } = syntheticEmail();
  const [standard] = await execute(inputs);
  assert.equal(standard.length, 5, "expected [modulus hash, redc hash, nullifier, header_len, body_len]");
  assert.equal(BigInt(standard[3]), BigInt(header.length));
  assert.equal(BigInt(standard[4]), BigInt(body.length));
});

for (const part of ["header", "body"] as const) {
  test(`bytes a prover writes after the signed ${part} length are not published`, async () => {
    const { header, body, inputs } = syntheticEmail();
    const signedLen = (part === "header" ? header : body).length;
    injectAfterLen(inputs[part], part === "header" ? "\r\nsubject:FORGED SUBJECT" : "\r\nFORGED: I owe you $1,000,000");
    let rv: ReturnValue;
    try {
      rv = await execute(inputs);
    } catch {
      return; // rejecting the witness outright is also sound
    }
    const out = bytesOf(part === "header" ? rv[1] : rv[2]);
    const leaked = out.slice(signedLen).filter((b) => b !== 0).length;
    assert.equal(leaked, 0, `${leaked} unsigned bytes after the ${part} would be displayed as signed content`);
  });
}

test("masked bytes are still hidden", async () => {
  const { header, inputs } = syntheticEmail();
  const at = header.indexOf("Synthetic");
  for (let i = at; i < at + 9; i++) inputs.header_mask[i] = false;
  const rv = await execute(inputs);
  assert.deepEqual(bytesOf(rv[1]).slice(at, at + 9), Array(9).fill(0));
  assert.equal(bytesOf(rv[1])[at + 9], " ".charCodeAt(0));
});

test("verify-page decoder returns exactly the signed header and body", async () => {
  const { header, body, inputs } = syntheticEmail();
  const rv = await execute(inputs);
  const decoded = decodeMaskedBytes(toPublicInputs(rv), { prefix: rv[0].length, maxHeaderLength: H, maxBodyLength: B });
  assert.equal(Buffer.from(decoded.header).toString("latin1"), header.toString("latin1"));
  assert.equal(Buffer.from(decoded.body).toString("latin1"), body.toString("latin1"));
});

test("CLI decoder returns exactly the signed header and body", async () => {
  const { header, body, inputs } = syntheticEmail();
  const rv = await execute(inputs);
  const decoded = outputsOf(toPublicInputs(rv), rv[0].length, H);
  assert.equal(decoded.header, header.toString("latin1"));
  assert.equal(decoded.body, body.toString("latin1"));
});

test("committed verification key verifies an honest proof of the committed circuit", { timeout: 300_000 }, async () => {
  const { inputs } = syntheticEmail();
  const { witness } = await new Noir(circuit).execute(inputs as never);
  const api = await Barretenberg.new({ threads: 4 });
  try {
    const proof = await new UltraHonkBackend(circuit.bytecode, api).generateProof(witness);
    const vk = new Uint8Array(readFileSync(join(ROOT, "src/circuit/target/vk", `${CIRCUIT}.vk`)));
    assert.equal(await new UltraHonkVerifierBackend(api).verifyProof({ ...proof, verificationKey: vk }), true);
  } finally {
    await api.destroy();
  }
});

test("legacy v1 decoding is exact, including lengths ≡ 16 (mod 32)", () => {
  // v1 circuits published [key hash, nullifier, ...storage] where storage = sha256Pad(content).
  const H1 = 2048, B1 = 4096;
  for (const n of [15, 16, 48, 49, 80, 176, 200]) {
    const header = Buffer.from("h".repeat(n - 1) + ":");
    const body = Buffer.from("b".repeat(n + 32 - 1) + "\n");
    const fields = (bytes: Buffer, max: number) =>
      [...sha256Pad(new Uint8Array(bytes), max)[0]].map((b) => "0x" + b.toString(16).padStart(64, "0"));
    const publicInputs = ["0x01", "0x02", ...fields(header, H1), ...fields(body, B1)];
    const site = decodeMaskedBytes(publicInputs, { prefix: 2, maxHeaderLength: H1, maxBodyLength: B1 });
    assert.equal(Buffer.from(site.header).toString("latin1"), header.toString("latin1"), `site header n=${n}`);
    assert.equal(Buffer.from(site.body).toString("latin1"), body.toString("latin1"), `site body n=${n}`);
    const cli = outputsOf(publicInputs, 2, H1);
    assert.equal(cli.header, header.toString("latin1"), `cli header n=${n}`);
    assert.equal(cli.body, body.toString("latin1"), `cli body n=${n}`);
  }
});
