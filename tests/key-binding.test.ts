/**
 * Verifier-side checks from the security review of PR #25 (findings 1, 2, 4, 6), for BOTH the
 * verify page (src/utils/keyBinding.ts, src/utils/proofOutputs.ts) and the agent CLI
 * (skills/redacted-email-proof/scripts/redacted.mjs), which keep mirrored copies.
 *
 * Synthetic keys and headers only; DNS and the archive are stubbed. Run: yarn test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Noir } from "@noir-lang/noir_js";
import { Barretenberg, UltraHonkBackend, UltraHonkVerifierBackend } from "@aztec/bb.js";
import * as site from "../src/utils/keyBinding";
import { decodeMaskedBytes } from "../src/utils/proofOutputs";
// @ts-expect-error - plain JS module without types
import * as cli from "../skills/redacted-email-proof/scripts/redacted.mjs";
import { ROOT, rsaKey, signedHeader, circuitInputs, toPublicInputs, loadCircuit, loadVk, type RsaKey } from "./fixtures/synthetic-dkim";
import type { KeyCandidates } from "../src/utils/dkimKeys";

const P = site.BN254_FIELD_MODULUS;
const both = [
  ["site", site],
  ["cli", cli],
] as const;

// ---------------------------------------------------------------------------------------------
// finding 2: one canonical encoding for public inputs

test("canonicalPublicInputs: site and CLI accept only 0x hex below the field modulus", () => {
  for (const [name, m] of both) {
    assert.deepEqual(m.canonicalPublicInputs(["0x41", "0x" + "0".repeat(63) + "1"]), ["0x" + "0".repeat(62) + "41", "0x" + "0".repeat(63) + "1"], name);
    for (const bad of ["65", "0x41 ", " 0x41", "0x", "0X41", "0x41zz", "0b1000001", 65, "0x" + (P + 0x41n).toString(16), "0x" + P.toString(16)]) {
      assert.throws(() => m.canonicalPublicInputs([bad]), undefined, `${name} accepted ${JSON.stringify(bad)}`);
    }
  }
});

test("decoders refuse non-canonical inputs instead of showing other bytes", () => {
  const H = 4, B = 4;
  const good = ["0x01", "0x02", "0x03", "0x04", "0x04", ..."ABCD".split("").map((c) => "0x" + c.charCodeAt(0).toString(16)), ..."wxyz".split("").map((c) => "0x" + c.charCodeAt(0).toString(16))];
  const header = Buffer.from(decodeMaskedBytes(good, { prefix: 5, maxHeaderLength: H, maxBodyLength: B }).header).toString("latin1");
  assert.equal(header, "ABCD");
  assert.equal(cli.outputsOf(good, 5, H).header, "ABCD");
  // bb.js reads "65" as 65 ('A'); the old decoders read its last two chars as hex 0x65 ('e').
  const decimal = [...good.slice(0, 5), "65", "66", "67", "68", ...good.slice(9)];
  assert.throws(() => decodeMaskedBytes(decimal, { prefix: 5, maxHeaderLength: H, maxBodyLength: B }));
  assert.throws(() => cli.outputsOf(decimal, 5, H));
  // a byte slot holding a value > 0xff isn't a byte the circuit produces
  const wide = [...good.slice(0, 5), "0x141", ...good.slice(6)];
  assert.throws(() => decodeMaskedBytes(wide, { prefix: 5, maxHeaderLength: H, maxBodyLength: B }));
  assert.throws(() => cli.outputsOf(wide, 5, H));
});

// ---------------------------------------------------------------------------------------------
// findings 4 and 6: header parsing

test("dkimSignatureDomains reads every signature, folded (c=simple) or not, and skips masked tags", () => {
  const header =
    "From: Alice <alice@bank.example>\r\n" +
    "DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=esp.example; s=s1; bh=x; b=\r\n" +
    "To: bob@example.test\r\n" +
    "DKIM-Signature: v=1; a=rsa-sha256; c=simple/simple;\r\n\td=Bank.Example; s=sel;\r\n\th=From:To; bh=y; b=";
  const masked = "dkim-signature:v=1; d=\u0000\u0000\u0000.example; s=s1; bh=z; b=\r\ndkim-signature:v=1; d=ok.example; s=█; b=";
  for (const [name, m] of both) {
    assert.deepEqual(m.dkimSignatureDomains(header), [
      { domain: "esp.example", selector: "s1" },
      { domain: "bank.example", selector: "sel" },
    ], name);
    assert.deepEqual(m.dkimSignatureDomains(masked), [], `${name}: masked d=/s= must not be looked up`);
  }
});

test("fromAddress parses the real address (display names, comments, hidden, duplicates)", () => {
  const cases: [string, string | null, boolean][] = [
    ["from:Alice <alice@bank.example>", "bank.example", false],
    ['From: "ceo@esp.example" <ceo@bank.example>', "bank.example", false],
    ["From: ceo@esp.example (<ceo@bank.example>)", "esp.example", false],
    ['From: "a <x@evil.example>" <b@bank.example>', "bank.example", false],
    ["From: plain@bank.example", "bank.example", false],
    ["From: Alice\r\n <alice@folded.example>", "folded.example", false],
    ["From: Alice <\u0000\u0000\u0000@bank.example>", null, true],
    ["From: a@one.example\r\nFrom: b@two.example", null, false],
    ["Subject: no from here", null, false],
  ];
  for (const [name, m] of both) {
    for (const [h, domain, hidden] of cases) {
      const got = m.fromAddress(h);
      assert.equal(got.domain, domain, `${name}: ${JSON.stringify(h)}`);
      assert.equal(got.hidden, hidden, `${name}: ${JSON.stringify(h)} hidden`);
    }
  }
});

test("domainsAligned: same domain, From subdomain, or signing subdomain", () => {
  for (const [name, m] of both) {
    assert.equal(m.domainsAligned("bank.example", "bank.example"), true, name);
    assert.equal(m.domainsAligned("mail.bank.example", "bank.example"), true, name);
    assert.equal(m.domainsAligned("airbnb.example", "email.airbnb.example"), true, name);
    assert.equal(m.domainsAligned("bank.example", "esp.example"), false, name);
    assert.equal(m.domainsAligned("notbank.example", "bank.example"), false, name);
  }
});

test("rsaModulusFromDer reads SPKI and PKCS#1 DKIM keys", () => {
  const key = rsaKey(1024);
  assert.equal(site.modulusFromDkimRecord(key.record), key.modulus);
  assert.equal(site.modulusFromDkimRecord(key.pkcs1Record), key.modulus);
  assert.equal(site.modulusFromDkimRecord("v=DKIM1; p="), null);
  assert.equal(site.modulusFromDkimRecord("v=DKIM1; p=AAAA"), null);
});

// ---------------------------------------------------------------------------------------------
// finding 1: the key hashes must be a published key's, computed exactly as the circuit does

const stubKeys =
  (records: Record<string, string[]>, archive: Record<string, string[]> = {}) =>
  async (name: string, withArchive: boolean): Promise<KeyCandidates> =>
    [
      ...(records[name] ?? []).map((record) => ({ source: "dns:google", record })),
      ...(withArchive ? (archive[name] ?? []).map((record) => ({ source: "archive", record })) : []),
    ];

async function publicOutputs(key: RsaKey, keyBits: number, lines: string, domain: string, selector = "sel") {
  const circuitName = `email_mask_${keyBits}_small`;
  const s = signedHeader(key, lines, (bh) => `dkim-signature:v=1; a=rsa-sha256; d=${domain}; s=${selector}; bh=${bh}; b=`, Buffer.from("Body.\r\n"));
  const rv = (await new Noir(loadCircuit(circuitName)).execute(circuitInputs(s, key, keyBits, 2048, 4096) as never)).returnValue;
  const pi = toPublicInputs(rv as never);
  const header = Buffer.from(decodeMaskedBytes(pi, { prefix: 5, maxHeaderLength: 2048, maxBodyLength: 4096 }).header).toString("latin1");
  return { pi, header };
}

for (const keyBits of [1024, 2048]) {
  test(`${keyBits}-bit: site and CLI key hashes equal the circuit's public outputs`, async () => {
    const key = rsaKey(keyBits);
    const { pi } = await publicOutputs(key, keyBits, "from:alice@bank.example\r\n", "bank.example");
    const [m, r] = await site.expectedKeyHashes(key.modulus, keyBits);
    assert.equal(m, BigInt(pi[0]), "modulus hash");
    assert.equal(r, BigInt(pi[1]), "redc hash");
    assert.deepEqual(await cli.pubkeyHash(key.modulus, keyBits, 2), [m, r]);
  });
}

test("key binding: published key matches; a self-made key for the same d=/s= does not", async () => {
  const real = rsaKey(2048);
  const forger = rsaKey(2048);
  const name = "sel._domainkey.bank.example";
  const circuit = { keyBits: 2048, set: { version: 2 } };
  const genuine = await publicOutputs(real, 2048, "from:Alice <alice@bank.example>\r\n", "bank.example");
  const forged = await publicOutputs(forger, 2048, "from:CEO <ceo@bank.example>\r\n", "bank.example");
  const dns = stubKeys({ [name]: [real.record] });

  const ok = await site.bindDkimKey(genuine.pi, genuine.header, 2048, dns);
  assert.equal(ok.matched, true);
  assert.equal(ok.domain, "bank.example");
  assert.equal(ok.fromAligned, true);
  assert.equal(site.keyBindingStatus(ok).verified, true);

  const bad = await site.bindDkimKey(forged.pi, forged.header, 2048, dns);
  assert.equal(bad.matched, false);
  const status = site.keyBindingStatus(bad);
  assert.equal(status.verified, false);
  assert.equal(status.warning, undefined, "an unmatched key is a failure, not a warning");
  assert.match(status.message, /NOT proven/);

  assert.ok((await cli.checkKeyBinding(genuine.pi, genuine.header, circuit, dns)).matched);
  assert.equal((await cli.checkKeyBinding(forged.pi, forged.header, circuit, dns)).matched, null);
});

test("key binding: a rotated key is found in the archive, and only after DNS fails", async () => {
  const old = rsaKey(2048);
  const current = rsaKey(2048);
  const name = "sel._domainkey.bank.example";
  const { pi, header } = await publicOutputs(old, 2048, "from:alice@bank.example\r\n", "bank.example");
  const calls: boolean[] = [];
  const resolve = async (n: string, withArchive: boolean) => {
    calls.push(withArchive);
    return stubKeys({ [name]: [current.record] }, { [name]: [old.record] })(n, withArchive);
  };
  const b = await site.bindDkimKey(pi, header, 2048, resolve);
  assert.equal(b.matched, true);
  assert.equal(b.keySource, "archive");
  assert.deepEqual(calls, [false, true]);
  assert.match(site.keyBindingStatus(b).message, /archive/);
});

test("key binding: ESP-signed mail is signed by d=, but a From: on another domain is not proven", async () => {
  const esp = rsaKey(2048);
  const lines = 'from:"ceo@esp.example" <ceo@bank.example>\r\n';
  const { pi, header } = await publicOutputs(esp, 2048, lines, "esp.example");
  const dns = stubKeys({ "sel._domainkey.esp.example": [esp.record] });
  const b = await site.bindDkimKey(pi, header, 2048, dns);
  assert.equal(b.matched, true);
  assert.equal(b.fromAligned, false);
  const status = site.keyBindingStatus(b);
  assert.equal(status.verified, false);
  assert.equal(status.warning, true);
  // names the From domain, the signing domain and the matching key, and the email-service quirk
  assert.match(status.message, /From: domain \(bank\.example\) is not the DKIM signing domain/);
  assert.match(status.message, /signed by esp\.example: the DKIM key at sel\._domainkey\.esp\.example, from DNS matches/);
  assert.match(status.message, /email service/);
  const c = await cli.checkKeyBinding(pi, header, { keyBits: 2048, set: { version: 2 } }, dns);
  assert.ok(c.matched);
  assert.equal(c.fromAligned, false, "the display-name address must not count as aligned");
});

test("key binding: hidden d=/s= can't be checked and is not authentic", async () => {
  const key = rsaKey(2048);
  const { pi, header } = await publicOutputs(key, 2048, "from:alice@bank.example\r\n", "bank.example");
  const masked = header.replace("d=bank.example", "d=" + "\u0000".repeat(12));
  const b = await site.bindDkimKey(pi, masked, 2048, stubKeys({ "sel._domainkey.bank.example": [key.record] }));
  assert.equal(b.matched, false);
  assert.deepEqual(b.candidates, []);
  assert.match(site.keyBindingStatus(b).message, /hidden/);
});

// ---------------------------------------------------------------------------------------------
// End to end with real proofs: bb.js accepts decimal inputs, so the fix must be in our code;
// the CLI's exit codes for each scenario.

test("real proofs: non-canonical inputs, key match, forged key, unaligned From (CLI exit codes)", { timeout: 600_000 }, async () => {
  const CIRCUIT = "email_mask_2048_small";
  const circuit = loadCircuit(CIRCUIT);
  const real = rsaKey(2048);
  const esp = rsaKey(2048);
  const prove = async (key: RsaKey, lines: string, dkim: (bh: string) => string) => {
    const s = signedHeader(key, lines, dkim, Buffer.from("Synthetic body.\r\n"));
    const { witness } = await new Noir(circuit).execute(circuitInputs(s, key, 2048, 2048, 4096) as never);
    return new UltraHonkBackend(circuit.bytecode, api).generateProof(witness);
  };
  const api = await Barretenberg.new({ threads: 4 });
  try {
    // c=simple-style folded signature: d=/s= are on a continuation line (finding 6)
    const aligned = await prove(real, "From: Alice <alice@bank.example>\r\nSubject: Hi\r\n", (bh) =>
      `DKIM-Signature: v=1; a=rsa-sha256; c=simple/simple;\r\n\td=bank.example; s=sel; bh=${bh}; b=`);
    const unaligned = await prove(esp, 'From: "ceo@esp.example" <ceo@bank.example>\r\n', (bh) =>
      `dkim-signature:v=1; a=rsa-sha256; d=esp.example; s=sel; bh=${bh}; b=`);
    const vk = loadVk(CIRCUIT);
    const verifier = new UltraHonkVerifierBackend(api);

    // bb.js itself accepts the decimal form of the same values: the display check must be ours.
    const decimal = aligned.publicInputs.map((x, i) => (i >= 5 && i < 25 ? BigInt(x).toString(10) : x));
    assert.equal(await verifier.verifyProof({ ...aligned, publicInputs: decimal, verificationKey: vk }), true);

    const dir = mkdtempSync(join(tmpdir(), "redacted-kb-"));
    const cache = join(dir, "cache");
    // Pre-seed the CLI's pinned-artifact cache with the committed VK so it never downloads.
    const cliSrc = readFileSync(join(ROOT, "skills/redacted-email-proof/scripts/redacted.mjs"), "utf8");
    const circuitRef = /const CIRCUIT_REF = "([0-9a-f]{40})"/.exec(cliSrc)![1];
    mkdirSync(join(cache, circuitRef.slice(0, 12), "vk"), { recursive: true });
    writeFileSync(join(cache, circuitRef.slice(0, 12), "vk", `${CIRCUIT}.vk`), vk);

    const run = (name: string, proof: { publicInputs: string[]; proof: Uint8Array }, records: Record<string, string>) => {
      const file = join(dir, `${name}.json`);
      writeFileSync(file, JSON.stringify({ publicInputs: proof.publicInputs, proof: Array.from(proof.proof), circuit: CIRCUIT, circuitVersion: 2 }));
      try {
        execFileSync("node", ["--import", join(ROOT, "tests/fixtures/doh-stub.mjs"), join(ROOT, "skills/redacted-email-proof/scripts/redacted.mjs"), "verify", file], {
          cwd: ROOT,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, REDACTED_CACHE: cache, DOH_STUB_RECORDS: JSON.stringify(records) },
        });
        return 0;
      } catch (e) {
        return (e as { status: number }).status;
      }
    };
    const bankKey = { "sel._domainkey.bank.example": real.record };
    assert.equal(run("aligned", aligned, bankKey), 0, "valid, key published, From aligned");
    assert.equal(run("forged", aligned, { "sel._domainkey.bank.example": esp.record }), 3, "DNS publishes a different key");
    assert.equal(run("decimal", { ...aligned, publicInputs: decimal }, bankKey), 2, "non-canonical inputs are INVALID");
    assert.equal(run("unaligned", unaligned, { "sel._domainkey.esp.example": esp.record }), 5, "signed by esp.example, From: bank.example");
  } finally {
    await api.destroy();
  }
});
