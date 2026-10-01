/**
 * Security review finding 3: the site's From/To/Date/Subject redactions must land on the signed
 * header bytes for c=simple emails too (names keep their case, values stay folded), and a
 * redaction that can't be placed must be reported, never silently dropped.
 * Synthetic c=simple email; DNS stubbed (tests/fixtures/doh-stub.mjs).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { placeHeaderFieldMask, headerFieldValueRanges } from "../src/utils/headerMask";
import { verifyDkimWithKeyCandidates } from "../src/utils/dkimKeys";
import { rsaKey, simpleSignedEml } from "./fixtures/synthetic-dkim";
// @ts-expect-error - plain JS module without types
import { installStub, restoreFetch } from "./fixtures/doh-stub.mjs";

after(restoreFetch);

const hidden = (header: string, mask: number[]) => [...header].filter((_, i) => mask[i] === 0).join("");
const hideAll = (value: string) => Array(value.length).fill(0);

test("c=simple email: To/Subject redactions are applied to the DKIM-signed header", async () => {
  const key = rsaKey(2048);
  installStub({ "sel._domainkey.bank.example": key.record });
  const eml = simpleSignedEml(key, "bank.example", "sel", [
    "From: Alice <alice@bank.example>",
    "To: Bob Recipient <bob@victim.example>",
    "Subject: Quarterly numbers for the\r\n board meeting",
    "Date: Tue, 29 Sep 2026 10:00:00 +0000",
  ], "Hello Bob.\r\n");
  const dkim = await verifyDkimWithKeyCandidates(eml);
  const header = dkim.headers.toString("utf-8");
  assert.match(header, /\r\nTo: /, "c=simple keeps the header name's case");
  assert.doesNotMatch(header, /(^|\r\n)to:/, "so a lowercase-only lookup can't find it");

  const mask = new Array(header.length).fill(1);
  const to = "bob@victim.example";
  assert.equal(placeHeaderFieldMask(header, "to", to, hideAll(to), mask), true);
  // postal-mime shows the folded subject unfolded; hide "board" only
  const subject = "Quarterly numbers for the board meeting";
  const bits = [...subject].map((_, i) => (i >= subject.indexOf("board") && i < subject.indexOf("board") + 5 ? 0 : 1));
  assert.equal(placeHeaderFieldMask(header, "subject", subject, bits, mask), true);
  assert.equal(hidden(header, mask), "bob@victim.exampleboard");
});

test("relaxed headers still work, every occurrence is covered, and unplaceable redactions are reported", () => {
  const relaxed = "from:Alice <alice@bank.example>\r\nto:bob@victim.example\r\nsubject:=?UTF-8?B?Q2Fmw6k=?=\r\nto:bob@victim.example\r\ndkim-signature:v=1; b=";
  const mask = new Array(relaxed.length).fill(1);
  const to = "bob@victim.example";
  assert.equal(placeHeaderFieldMask(relaxed, "to", to, hideAll(to), mask), true);
  assert.equal(hidden(relaxed, mask), to + to, "both To: fields are hidden");

  // "Café" is RFC 2047-encoded in the signed bytes: hiding all of it hides the whole raw value...
  const m2 = new Array(relaxed.length).fill(1);
  assert.equal(placeHeaderFieldMask(relaxed, "subject", "Café", [0, 0, 0, 0], m2), true);
  assert.equal(hidden(relaxed, m2), "=?UTF-8?B?Q2Fmw6k=?=");
  // ...but a partial redaction of it can't be placed, and says so
  assert.equal(placeHeaderFieldMask(relaxed, "subject", "Café", [1, 1, 0, 0], new Array(relaxed.length).fill(1)), false);
  // a field that isn't signed at all: the proof doesn't publish it, so there's nothing to hide
  const m3 = new Array(relaxed.length).fill(1);
  assert.equal(placeHeaderFieldMask(relaxed, "date", "Tue", [0, 0, 0], m3), true);
  assert.ok(m3.every((b) => b === 1), "and nothing else is hidden");
  // nothing to hide is trivially placed
  assert.equal(placeHeaderFieldMask(relaxed, "date", "Tue", [1, 1, 1], new Array(relaxed.length).fill(1)), true);
});

test("headerFieldValueRanges: names match case-insensitively at line starts only", () => {
  const h = "Reply-To: a@x.example\r\nTO: b@y.example\r\nSubject: hi\r\n\tthere\r\ndkim-signature:v=1";
  assert.deepEqual(headerFieldValueRanges(h, "to").map((r) => h.slice(r.start, r.end)), [" b@y.example"]);
  assert.deepEqual(headerFieldValueRanges(h, "subject").map((r) => h.slice(r.start, r.end)), [" hi\r\n\tthere"]);
});
