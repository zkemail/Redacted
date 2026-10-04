/** Verify page: long redacted stretches collapse to one row (src/utils/maskedRuns.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { maskedSegments } from "../src/utils/maskedRuns";

const H = (n: number) => "\0".repeat(n);

test("one long hidden run (hidden newlines) collapses with an estimated line count", () => {
  const segs = maskedSegments(`Hi${H(27430)}omissions.${H(10)}`);
  assert.deepEqual(segs.map((s) => s.type), ["text", "collapsed", "text", "masked"]);
  const c = segs[1] as Extract<(typeof segs)[number], { type: "collapsed" }>;
  assert.equal(c.hidden, 27430);
  assert.equal(c.lines, Math.ceil(27430 / 80));
});

test("many fully hidden lines with revealed line breaks merge into one stretch with the exact line count", () => {
  const lines = Array.from({ length: 111 }, () => H(70)).join("\r\n");
  const segs = maskedSegments(`Dear X,\r\n${lines}\r\nThanks`);
  assert.deepEqual(segs.map((s) => s.type), ["text", "collapsed", "text"]);
  const c = segs[1] as Extract<(typeof segs)[number], { type: "collapsed" }>;
  assert.equal(c.hidden, 111 * 70);
  assert.equal(c.lines, 111);
  // nothing is lost: the collapsed stretch keeps the original bytes for "show"
  assert.equal(segs.map((s) => s.content).join(""), `Dear X,\r\n${lines}\r\nThanks`);
});

test("short redactions and stretches broken by revealed words stay inline", () => {
  assert.deepEqual(maskedSegments(`To: ${H(30)}\r\n`).map((s) => s.type), ["text", "masked", "text"]);
  const segs = maskedSegments(`${H(200)} word ${H(200)}`);
  assert.deepEqual(segs.map((s) => s.type), ["masked", "text", "masked"]);
});

test("CLI compact: long runs become █×N and 3+ fully redacted lines merge into one", async () => {
  // @ts-expect-error - plain JS module without types
  const { compact } = await import("../skills/redacted-email-proof/scripts/redacted.mjs");
  const B = "█";
  const lines = [...Array.from({ length: 110 }, () => B.repeat(70)), B.repeat(5)].join("\n");
  assert.equal(compact(`Dear X,\n${lines}\nThanks ${B.repeat(5)}\n`), `Dear X,\n${B} ⋯ 7,705 redacted characters (111 lines) ⋯\nThanks ${B.repeat(5)}\n`);
  assert.equal(compact(`a\n${B.repeat(20)}\n${B.repeat(20)}\nb`), `a\n${B}×20\n${B}×20\nb`, "two lines stay as they are");
});

test("CLI --reveal: text in both the plain and HTML parts is revealed only in the plain-text part", async () => {
  // @ts-expect-error - plain JS module without types
  const { buildMasks, htmlPartRanges } = await import("../skills/redacted-email-proof/scripts/redacted.mjs");
  const body =
    "--b1\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nWe can share the lab agreement.\r\n" +
    "--b1\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<div>We can share the lab agreement.</div><p>Only in html</p>\r\n--b1--\r\n";
  const dkim = { headers: Buffer.from("from:a@b.example\r\n"), body: Buffer.from(body) };
  const shown = (mask: number[]) => [...body].map((c, i) => (mask[i] ? c : "\0")).join("").replace(/\0+/g, "█");
  assert.equal(htmlPartRanges(body).length, 1);

  const m = buildMasks(dkim, { "hide-body": true, reveal: ["We can share the lab agreement.", "Only in html"] });
  assert.equal(shown(m.bodyMask).match(/We can share/g)?.length, 1, "revealed once");
  assert.ok(body.indexOf("We can share") === shown(m.bodyMask).indexOf("We can share") || shown(m.bodyMask).startsWith("█We can share"), "the plain-text copy");
  assert.match(shown(m.bodyMask), /Only in html/, "HTML-only text is still revealed");
  assert.ok(m.warnings.some((w: string) => /HTML part left hidden/.test(w)));

  const all = buildMasks(dkim, { "hide-body": true, reveal: ["We can share the lab agreement."], "reveal-all-parts": true });
  assert.equal(shown(all.bodyMask).match(/We can share/g)?.length, 2, "--reveal-all-parts keeps both");
});

test("CLI --reveal dedupe is per match: a regex still reveals HTML-only passages", async () => {
  // @ts-expect-error - plain JS module without types
  const { buildMasks } = await import("../skills/redacted-email-proof/scripts/redacted.mjs");
  const body =
    "--b1\r\nContent-Type: text/plain\r\n\r\nPublic agreement\r\n" +
    "--b1\r\nContent-Type: text/html\r\n\r\n<p>Public agreement</p><p>Private agreement</p>\r\n--b1--\r\n";
  const dkim = { headers: Buffer.from("from:a@b.example\r\n"), body: Buffer.from(body) };
  const m = buildMasks(dkim, { "hide-body": true, "reveal-regex": ["(Public|Private) agreement"] });
  const shown = [...body].map((c, i) => (m.bodyMask[i] ? c : "\0")).join("");
  assert.equal(shown.match(/Public agreement/g)?.length, 1, "duplicated passage revealed once");
  assert.match(shown, /Private agreement/, "HTML-only match still revealed");
});

test("CLI --reveal: MIME headers/attachments are not a 'plain-text copy' (HTML-only message keeps its reveal)", async () => {
  // @ts-expect-error - plain JS module without types
  const { buildMasks } = await import("../skills/redacted-email-proof/scripts/redacted.mjs");
  const body =
    "--m\r\nContent-Type: text/html\r\n\r\n<p>See agreement.pdf attached</p>\r\n" +
    '--m\r\nContent-Type: application/pdf; name="agreement.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0=\r\n--m--\r\n';
  const dkim = { headers: Buffer.from("from:a@b.example\r\n"), body: Buffer.from(body) };
  const m = buildMasks(dkim, { "hide-body": true, reveal: ["agreement.pdf"] });
  const at = body.indexOf("See agreement.pdf") + 4;
  assert.ok(m.bodyMask.slice(at, at + "agreement.pdf".length).every((x: number) => x === 1), "the readable HTML occurrence is revealed");
  assert.ok(!m.warnings.some((w: string) => /HTML part left hidden/.test(w)));
});
