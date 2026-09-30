/**
 * Quoted-printable handling (display layer): decoding, mask mapping from decoded text to raw
 * signed bytes, and display decoding of a proof's masked output. Site (src/utils/qp.ts) and CLI
 * copies must agree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyViewFor, displayDecodeMasked, qpDecode, viewMaskToRawMask } from "../src/utils/qp";
// @ts-expect-error - plain JS module without types
import { qpDecode as cliQpDecode, displayDecodeMasked as cliDisplayDecodeMasked } from "../skills/redacted-email-proof/scripts/redacted.mjs";

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
