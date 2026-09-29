/**
 * The CLI must prove emails signed by a domain other than From: (ESPs, subdomains).
 * Synthetic email + ephemeral key; DNS answered by tests/fixtures/doh-stub.mjs (no network).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(import.meta.dirname, "..");

// Minimal relaxed/relaxed DKIM signer (RFC 6376 §3.4.2/§3.4.4) for simple one-line headers.
function signedEmail(signer: string) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const headers = [["From", "Alice <alice@example.test>"], ["To", "bob@example.test"], ["Subject", "Signer domain test"]];
  const body = "Hello from a synthetic email.\r\n";
  const bh = createHash("sha256").update(body).digest("base64");
  const dkimValue = `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${signer}; s=sel; h=from:to:subject; bh=${bh}; b=`;
  const canon = (n: string, v: string) => `${n.toLowerCase()}:${v.replace(/\s+/g, " ").trim()}`;
  const signingInput = headers.map(([n, v]) => canon(n, v) + "\r\n").join("") + canon("DKIM-Signature", dkimValue);
  const b = sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64");
  const eml = `DKIM-Signature: ${dkimValue}${b}\r\n` + headers.map(([n, v]) => `${n}: ${v}\r\n`).join("") + "\r\n" + body;
  const p = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return { eml, records: { [`sel._domainkey.${signer}`]: `v=DKIM1; k=rsa; p=${p}` } };
}

function inspect(eml: string, records: Record<string, string>) {
  const file = join(mkdtempSync(join(tmpdir(), "redacted-signer-")), "mail.eml");
  writeFileSync(file, eml);
  try {
    const out = execFileSync(
      "node",
      ["--import", join(ROOT, "tests/fixtures/doh-stub.mjs"), join(ROOT, "skills/redacted-email-proof/scripts/redacted.mjs"), "inspect", file, "--json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, DOH_STUB_RECORDS: JSON.stringify(records) } }
    );
    return { code: 0, json: JSON.parse(out.slice(out.indexOf("{"))) };
  } catch (e) {
    const err = e as { status: number; stderr: string };
    return { code: err.status, stderr: err.stderr };
  }
}

test("control: email signed by its From: domain verifies (fixture sanity)", () => {
  const { eml, records } = signedEmail("example.test");
  const r = inspect(eml, records);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.signingDomain, "example.test");
});

test("email signed only by another domain (ESP) verifies via its d= signer", () => {
  const { eml, records } = signedEmail("esp.example");
  const r = inspect(eml, records);
  assert.equal(r.code, 0, `inspect failed: ${r.stderr?.split("\n").find((l) => /error/.test(l))}`);
  assert.equal(r.json.signingDomain, "esp.example");
});
