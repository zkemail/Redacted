/**
 * Quoted-printable handling (display layer): decoding, mask mapping from decoded text to raw
 * signed bytes, and display decoding of a proof's masked output. Site (src/utils/qp.ts) and CLI
 * copies must agree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyViewFor, displayDecodeMasked, qpDecode, quotedPrintableEvidence, viewMaskToRawMask } from "../src/utils/qp";
// @ts-expect-error - plain JS module without types
import { qpDecode as cliQpDecode, displayDecodeMasked as cliDisplayDecodeMasked, quotedPrintableEvidence as cliQpEvidence } from "../skills/redacted-email-proof/scripts/redacted.mjs";

const RAW = Buffer.from(
  "Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n" +
    "<p style=3D\"color:red\">Your payment of =E2=82=AC50 to Caf=C3=A9 was sent.=\r\n Thanks!</p>\r\n",
  "latin1"
);

// What the UI does: find the highlighted text in the text it displays; 0 = hidden.
function uiCharMask(text: string, hide: string[]) {
  const mask = new Array(text.length).fill(1);
  for (const h of hide) for (let i = text.indexOf(h); i >= 0; i = text.indexOf(h, i + 1)) mask.fill(0, i, i + h.length);
  return mask;
}
const shown = (raw: Buffer, rawMask: number[]) =>
  Buffer.from(displayDecodeMasked(Uint8Array.from(raw.map((b, i) => (rawMask[i] ? b : 0))))).toString("utf8").replace(/\0/g, "█");

test("site and CLI decoders agree; =XX and soft breaks decode", () => {
  const site = Buffer.from(qpDecode(RAW)).toString("utf8");
  assert.equal(Buffer.from(cliQpDecode(RAW)).toString("utf8"), site);
  assert.ok(site.includes('<p style="color:red">Your payment of €50 to Café was sent. Thanks!</p>'), site);
  assert.equal(Buffer.from(qpDecode(Buffer.from("a=ZZb=3dc=4"))).toString("latin1"), "a=ZZb=c=4");
});

test("hiding decoded text masks exactly its raw encoded bytes (incl. across a soft break)", () => {
  const view = bodyViewFor(RAW);
  assert.equal(view.qp, true);
  const rawMask = viewMaskToRawMask(view, uiCharMask(view.text, ["Café", "sent. Thanks"]));
  const rawText = RAW.toString("latin1");
  for (const encoded of ["Caf=C3=A9", "sent.=\r\n Thanks"]) {
    const at = rawText.indexOf(encoded);
    assert.deepEqual(rawMask.slice(at, at + encoded.length), Array(encoded.length).fill(0), `raw "${encoded}" not fully hidden`);
  }
  const display = shown(RAW, rawMask);
  assert.ok(!display.includes("Caf") && !display.includes("Thanks"), display);
  // hidden spans show one █ per hidden RAW byte (what the proof actually contains)
  assert.ok(display.includes("€50 to █████████ was ███████████████!"), display);
});

test("REGRESSION: the old search-based mapping leaked highlighted QP text", () => {
  // Old site: searched the displayed text inside the raw (encoded) body and used the hits as the
  // raw mask. "Café" never occurs in "Caf=C3=A9", so nothing was hidden.
  const rawText = RAW.toString("utf8");
  const oldMask = uiCharMask(rawText, ["Café"]);
  assert.equal(oldMask.every((b) => b === 1), true, "old mapping hid nothing");
  assert.ok(shown(RAW, oldMask).includes("Café"), "…so Café was published");
  // new mapping hides it
  const view = bodyViewFor(RAW);
  assert.ok(!shown(RAW, viewMaskToRawMask(view, uiCharMask(view.text, ["Café"]))).includes("Café"));
});

test("display decoding of masked output: partly hidden escapes show as one hidden char", () => {
  const masked = Buffer.from("x=E2=82=AC y =\0\0 z =4\0!", "latin1");
  const site = Buffer.from(displayDecodeMasked(masked)).toString("latin1");
  assert.equal(Buffer.from(cliDisplayDecodeMasked(masked)).toString("latin1"), site);
  assert.equal(site, "xâ\u0082¬ y \0 z \0!");
});

// A proof that hides the part's Content-Transfer-Encoding header (e.g. --hide-body with a few
// sentences revealed) must still display decoded text, not "samples=E2=80=94whether iden=".
test("QP detected from the text when the Content-Transfer-Encoding header is hidden", () => {
  const raw = Buffer.from(
    "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n" +
      "we never sell data derived from our customers' samples=E2=80=94whether iden=\r\ntifiable or not=\r\n, ever=E2=80=\r\n=94really.\r\n",
    "latin1"
  );
  const masked = Buffer.from(raw);
  masked.fill(0, 0, raw.indexOf("\r\n\r\n") + 4); // MIME part headers hidden
  for (const [name, evidence] of [["site", quotedPrintableEvidence], ["cli", cliQpEvidence]] as const) {
    assert.equal(evidence(raw), "header", name);
    assert.equal(evidence(masked), "content", name);
  }
  const shownText = Buffer.from(displayDecodeMasked(masked)).toString("utf8");
  assert.ok(shownText.includes("samples—whether identifiable or not, ever—really."), shownText);
});

test("QP content detection does not fire on base64, plain text, or another declared encoding", () => {
  const cases: [string, string][] = [
    ["base64 padding at line ends", "SGVsbG8gd29ybGQ=\r\nSGk==\r\nQUJD==\r\n"],
    ["plain text with = signs", "x = 1\r\nif (a == b) total = 3D printer\r\n"],
    ["one lone soft-break-like line", "price =\r\nsee below\r\n"],
    ["escapes that aren't UTF-8", "bytes =FF=FE=FD here\r\n"],
    ["declared base64 part", "Content-Transfer-Encoding: base64\r\n\r\nc2Ftc=\r\nGxl=E2=80=94=\r\n"],
  ];
  for (const [label, text] of cases) {
    const b = Buffer.from(text, "latin1");
    assert.equal(quotedPrintableEvidence(b), null, `site: ${label}`);
    assert.equal(cliQpEvidence(b), null, `cli: ${label}`);
  }
});
