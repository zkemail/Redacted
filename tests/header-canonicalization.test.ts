/**
 * c=simple header canonicalization + DKIM-field span checks in the circuit.
 * Synthetic RSA key signs synthetic headers; the circuit hashes header[0..len] directly, so any
 * header layout can be exercised. REDACTED_TEST_TARGET overrides the artifact dir (to run the
 * same tests against an older build).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Noir, type CompiledCircuit } from "@noir-lang/noir_js";
import { bnToLimbStrArray } from "@mach-34/noir-bignum-paramgen";
import { sha256Pad } from "@zk-email/helpers/dist/sha-utils";
import { dkimFieldSequence } from "../src/utils/dkimFields";
// @ts-expect-error - plain JS module without types
import { dkimFieldSequence as cliDkimFieldSequence } from "../skills/redacted-email-proof/scripts/redacted.mjs";

const ROOT = join(import.meta.dirname, "..");
const TARGET = process.env.REDACTED_TEST_TARGET || join(ROOT, "src/circuit/target");
const circuit = JSON.parse(readFileSync(join(TARGET, "email_mask_2048_small.json"), "utf8")) as CompiledCircuit;
const H = 2048, B = 4096;
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const modulus = BigInt("0x" + Buffer.from(publicKey.export({ format: "jwk" }).n!, "base64url").toString("hex"));

function inputsFor(headerText: string, body: Buffer, seq: { index: number; length: number; bodyHashIndex: number }) {
  const header = Buffer.from(headerText, "latin1");
  const signature = BigInt("0x" + sign("RSA-SHA256", header, privateKey).toString("hex"));
  const pad = (b: Buffer, n: number) => [...sha256Pad(new Uint8Array(b), n)[0]].map(String);
  return {
    header: { storage: pad(header, H), len: String(header.length) },
    body: { storage: pad(body, B), len: String(body.length) },
    pubkey: { modulus: bnToLimbStrArray(modulus, 2048), redc: bnToLimbStrArray((1n << 4102n) / modulus) },
    signature: bnToLimbStrArray(signature, 2048),
    body_hash_index: String(seq.bodyHashIndex),
    dkim_header_sequence: { index: String(seq.index), length: String(seq.length) },
    header_mask: Array(H).fill(true),
    body_mask: Array(B).fill(true),
  };
}
const execute = async (inputs: object) => (await new Noir(circuit).execute(inputs as never)).returnValue as unknown as [string[], string[], string[]];
const bh = (b: Buffer) => createHash("sha256").update(b).digest("base64");

test("c=simple header (mixed-case name, folded field, ';\\r\\n\\tbh=') proves", async () => {
  const body = Buffer.from("You received money.\r\n");
  const header =
    "Date: Fri, 1 Dec 2023 11:11:04 -0800\r\nFrom: Bank <alerts@notify.bank.test>\r\nTo: you@example.test\r\n" +
    "Subject: You received money\r\n" +
    `DKIM-Signature: v=1; a=rsa-sha256; c=simple/simple; d=notify.bank.test;\r\n\ts=2011-05-wfb; t=1701457864;\r\n\tbh=${bh(body)};\r\n\th=Date:From:To:Subject;\r\n\tb=`;
  const seq = dkimFieldSequence(header);
  assert.deepEqual(cliDkimFieldSequence(header), seq, "site and CLI locate the same field");
  const [standard] = await execute(inputsFor(header, body, seq));
  assert.equal(BigInt(standard[3]), BigInt(header.length));
  assert.equal(BigInt(standard[4]), BigInt(body.length));
});

// Attack: claim a DKIM "field" that runs across a real header boundary into a line whose bh=
// the prover controls (e.g. a Subject they could influence), with a body matching that bh.
function spanningAttack(padding: number) {
  const fakeBody = Buffer.from("FORGED BODY\r\n");
  const realBody = Buffer.from("real body\r\n");
  const header =
    `dkim-signature:v=1; a=rsa-sha256; d=bank.test; s=sel; h=${"x".repeat(padding)}; bh=${bh(realBody)}; b=\r\n` +
    `subject:hi; bh=${bh(fakeBody)};`;
  const fakeAt = header.lastIndexOf("bh=") + 3;
  return { header, fakeBody, seq: { index: 0, length: header.length, bodyHashIndex: fakeAt } };
}

test("a DKIM field span crossing a header line boundary is rejected", async () => {
  const { header, fakeBody, seq } = spanningAttack(10);
  await assert.rejects(execute(inputsFor(header, fakeBody, seq)));
});

test("…including when the boundary is more than 300 bytes into the claimed field", async () => {
  // The old newline check scanned only the first 300 bytes of the field and never checked the
  // field length, so a boundary further in went unchecked.
  const { header, fakeBody, seq } = spanningAttack(400);
  assert.ok(header.indexOf("\r\n") > 300);
  await assert.rejects(execute(inputsFor(header, fakeBody, seq)));
});
