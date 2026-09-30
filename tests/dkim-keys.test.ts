/**
 * DKIM key candidates: an email must verify when its signing key is only in the archive, even if
 * DNS now serves a different key under the same selector, or the archive holds several keys for
 * that selector. Synthetic email + ephemeral keys; DNS and archive answered by
 * tests/fixtures/doh-stub.mjs (no network).
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyDKIMSignature } from "@zk-email/helpers/dist/dkim";
import { verifyDkimWithKeyCandidates } from "../src/utils/dkimKeys";
// @ts-expect-error - plain JS module without types
import { verifyDkimWithKeyCandidates as cliVerify } from "../skills/redacted-email-proof/scripts/redacted.mjs";
// @ts-expect-error - plain JS module without types
import { installStub, restoreFetch, archiveCalls } from "./fixtures/doh-stub.mjs";

const ROOT = join(import.meta.dirname, "..");
const NAME = "sel._domainkey.example.test";

const newKey = () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { privateKey, record: `v=DKIM1; k=rsa; p=${publicKey.export({ format: "der", type: "spki" }).toString("base64")}` };
};

// Minimal relaxed/relaxed DKIM signer (RFC 6376 §3.4.2/§3.4.4) for simple one-line headers.
function signedEmail(privateKey: ReturnType<typeof newKey>["privateKey"]) {
  const headers = [["From", "Alice <alice@example.test>"], ["To", "bob@example.test"], ["Subject", "Key rotation test"]];
  const body = "Hello from a synthetic email.\r\n";
  const bh = createHash("sha256").update(body).digest("base64");
  const dkimValue = `v=1; a=rsa-sha256; c=relaxed/relaxed; d=example.test; s=sel; h=from:to:subject; bh=${bh}; b=`;
  const canon = (n: string, v: string) => `${n.toLowerCase()}:${v.replace(/\s+/g, " ").trim()}`;
  const signingInput = headers.map(([n, v]) => canon(n, v) + "\r\n").join("") + canon("DKIM-Signature", dkimValue);
  const b = sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64");
  return `DKIM-Signature: ${dkimValue}${b}\r\n` + headers.map(([n, v]) => `${n}: ${v}\r\n`).join("") + "\r\n" + body;
}

const archiveRows = (...records: string[]) =>
  records.map((value, i) => ({ domain: "example.test", selector: "sel", value, lastSeenAt: `2026-0${9 - i}-01T00:00:00Z` }));

function cliInspect(eml: string, dns: Record<string, string>, archive: Record<string, unknown>) {
  const file = join(mkdtempSync(join(tmpdir(), "redacted-keys-")), "mail.eml");
  writeFileSync(file, eml);
  try {
    const out = execFileSync(
      "node",
      ["--import", join(ROOT, "tests/fixtures/doh-stub.mjs"), join(ROOT, "skills/redacted-email-proof/scripts/redacted.mjs"), "inspect", file, "--json"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, DOH_STUB_RECORDS: JSON.stringify(dns), ARCHIVE_STUB_RECORDS: JSON.stringify(archive) },
      }
    );
    return { code: 0, json: JSON.parse(out.slice(out.indexOf("{"))) };
  } catch (e) {
    const err = e as { status: number; stderr: string };
    return { code: err.status, stderr: err.stderr };
  }
}

afterEach(() => restoreFetch());

test("REGRESSION: key rotated under the same selector — old helper fails, site + CLI verify via the archive", async () => {
  const old = newKey();
  const current = newKey();
  const eml = signedEmail(old.privateKey);
  const dns = { [NAME]: current.record };
  const archive = { "example.test": archiveRows(current.record, old.record) };
  installStub(dns, archive);

  // before: DNS answers (with the new key), so the helper never consults the archive
  await assert.rejects(verifyDKIMSignature(eml, "", true, true), /bad signature/);

  // after
  const site = await verifyDkimWithKeyCandidates(eml);
  assert.equal(site.keySource, "archive");
  const cli = await cliVerify(Buffer.from(eml));
  assert.equal(cli.keySource, "archive");
  assert.equal(cli.publicKey, site.publicKey);
  assert.equal(cli.signature, site.signature);
  assert.equal(Buffer.from(cli.headers).toString("latin1"), Buffer.from(site.headers).toString("latin1"));
  const expectedModulus = BigInt("0x" + Buffer.from(old.privateKey.export({ format: "jwk" }).n!, "base64url").toString("hex"));
  assert.equal(site.publicKey, expectedModulus);

  restoreFetch();
  const r = cliInspect(eml, dns, archive);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.keySource, "archive");
});

test("REGRESSION: selector gone from DNS and the signing key is not the archive's first record", async () => {
  const [a, b, signer] = [newKey(), newKey(), newKey()];
  const eml = signedEmail(signer.privateKey);
  const archive = { "example.test": archiveRows(a.record, b.record, signer.record) };
  installStub({}, archive);

  await assert.rejects(verifyDKIMSignature(eml, "", true, true), /bad signature/);
  const site = await verifyDkimWithKeyCandidates(eml);
  assert.equal(site.keySource, "archive");
});

test("current DNS key verifies first and the archive is not queried (10 req/min limit)", async () => {
  const k = newKey();
  const eml = signedEmail(k.privateKey);
  installStub({ [NAME]: k.record }, { "example.test": archiveRows(newKey().record) });
  const site = await verifyDkimWithKeyCandidates(eml);
  assert.equal(site.keySource, "dns:google");
  const cli = await cliVerify(Buffer.from(eml));
  assert.equal(cli.keySource, "dns:google");
  assert.equal(archiveCalls.count, 0);
});

test("body hash mismatch: no key can fix it, so the archive is not queried", async () => {
  const k = newKey();
  const eml = signedEmail(k.privateKey).replace("Hello from", "Hullo from");
  installStub({ [NAME]: k.record }, { "example.test": archiveRows(newKey().record) });
  await assert.rejects(verifyDkimWithKeyCandidates(eml), /body hash did not verify/);
  await assert.rejects(cliVerify(Buffer.from(eml)), /body hash did not verify/);
  assert.equal(archiveCalls.count, 0);
});

test("archive 429 is retried once after retryAfterSeconds (site and CLI)", async () => {
  const old = newKey();
  const eml = signedEmail(old.privateKey);
  const dns = { [NAME]: newKey().record };
  const archive = { "example.test": archiveRows(old.record) };
  installStub(dns, archive, { rateLimitFirst: true });
  assert.equal((await verifyDkimWithKeyCandidates(eml)).keySource, "archive");
  assert.equal(archiveCalls.count, 2);
  installStub(dns, archive, { rateLimitFirst: true });
  assert.equal((await cliVerify(Buffer.from(eml))).keySource, "archive");
  assert.equal(archiveCalls.count, 2);
});

test("no candidate verifies: same error as before; revoked (empty p=) records are ignored", async () => {
  const eml = signedEmail(newKey().privateKey);
  installStub({ [NAME]: newKey().record }, { "example.test": archiveRows("v=DKIM1; k=rsa; p=", newKey().record) });
  await assert.rejects(verifyDkimWithKeyCandidates(eml), /DKIM signature verification failed for domain example\.test\. Reason: bad signature/);
  await assert.rejects(cliVerify(Buffer.from(eml)), /DKIM signature verification failed for domain example\.test\. Reason: bad signature/);
});
