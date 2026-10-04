/**
 * Quoted-printable (QP) support. Decoding happens in the DISPLAY layer, not the circuit.
 *
 * The circuit proves and publishes the raw signed body bytes (masked). QP decoding is a fixed
 * public function, so the verifier can decode those proven bytes itself; proving the decoding
 * in-circuit adds no soundness. It was tried (branch history, commit b9791be): ~55 gates/byte,
 * the large tier needed 2^23 gates and >20 GB RAM just to compile. That works against proving on
 * people's own devices.
 *
 * What does matter:
 *  - Masking: the user highlights DECODED text ("Café", text across a soft line break). Each
 *    decoded byte must map to the exact raw bytes it came from ("Caf=C3=A9"), or highlighted text
 *    stays unmasked in the proof. The old UI searched for the displayed text inside the encoded
 *    bytes, which silently failed for QP bodies.
 *  - Display: decode the proof's masked raw bytes for readability (displayDecodeMasked).
 *
 * Decoding: "=XX" (hex, either case) -> byte, "=\r\n" (soft break) -> nothing, else unchanged.
 * Keep in sync with the copies in skills/redacted-email-proof/scripts/redacted.mjs.
 */
const hex = (c: number) =>
  c >= 0x30 && c <= 0x39 ? c - 0x30 : c >= 0x41 && c <= 0x46 ? c - 55 : c >= 0x61 && c <= 0x66 ? c - 87 : -1;

/** Decoded bytes plus, for each decoded byte k, its source range [start[k], end[k]) in `bytes`. */
export function qpDecodeWithMap(bytes: Uint8Array): { decoded: Uint8Array; start: number[]; end: number[] } {
  const out: number[] = [];
  const start: number[] = [];
  const end: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x3d && i + 2 < bytes.length) {
      if (bytes[i + 1] === 0x0d && bytes[i + 2] === 0x0a) {
        i += 2;
        continue;
      }
      const h1 = hex(bytes[i + 1]);
      const h2 = hex(bytes[i + 2]);
      if (h1 >= 0 && h2 >= 0) {
        out.push(h1 * 16 + h2);
        start.push(i);
        end.push(i + 3);
        i += 2;
        continue;
      }
    }
    out.push(bytes[i]);
    start.push(i);
    end.push(i + 1);
  }
  return { decoded: Uint8Array.from(out), start, end };
}

export const qpDecode = (bytes: Uint8Array) => qpDecodeWithMap(bytes).decoded;

/** True if any MIME part of the body declares quoted-printable transfer encoding. */
export const hasQuotedPrintablePart = (body: Uint8Array) =>
  /content-transfer-encoding:\s*quoted-printable/i.test(new TextDecoder("latin1").decode(body));

export interface BodyView {
  /** body is shown decoded from quoted-printable */
  qp: boolean;
  /** text shown to the user and masked per character */
  text: string;
  /** bytes of `text` (decoded body if qp, else the raw body) */
  bytes: Uint8Array;
  /** qp only: raw source range of each byte of `bytes` */
  start?: number[];
  end?: number[];
  /** raw signed body length (what the circuit masks) */
  rawLength: number;
}

/**
 * The body as the user sees and masks it: decoded when it has a QP part and decodes to valid
 * UTF-8. Otherwise raw (character positions can't be mapped back to bytes reliably otherwise).
 */
export function bodyViewFor(body: Uint8Array): BodyView {
  if (hasQuotedPrintablePart(body)) {
    const { decoded, start, end } = qpDecodeWithMap(body);
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
      return { qp: true, text, bytes: decoded, start, end, rawLength: body.length };
    } catch {
      // not UTF-8: raw view
    }
  }
  return { qp: false, text: new TextDecoder("utf-8").decode(body), bytes: body, rawLength: body.length };
}

/**
 * Convert a per-character (UTF-16 code unit) mask over `text` into a per-byte mask over its UTF-8
 * encoding. A multi-byte character is hidden if any of its units is. Throws if `text` doesn't
 * re-encode to exactly `expectedBytes` bytes (the source wasn't valid UTF-8).
 * REASON: masks used to be applied 1:1 as if characters were bytes, shifting every mask after
 * the first non-ASCII character.
 */
export function charMaskToByteMask(text: string, charMask: number[], expectedBytes: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    const units = cp > 0xffff ? 2 : 1;
    const bit = charMask[i] === 0 || (units === 2 && charMask[i + 1] === 0) ? 0 : 1;
    const bytes = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    for (let k = 0; k < bytes; k++) out.push(bit);
    i += units;
  }
  if (out.length !== expectedBytes) {
    throw new Error(`Body mask can't be mapped to bytes (${out.length} vs ${expectedBytes}); the body isn't valid UTF-8.`);
  }
  return out;
}

/**
 * Per-character mask over view.text -> per-byte mask over the RAW signed body (what the circuit
 * masks). Hiding a decoded byte hides every raw byte it came from, and a soft line break between
 * two hidden bytes is hidden too, so the hidden span leaks nothing.
 */
export function viewMaskToRawMask(view: BodyView, charMask: number[]): number[] {
  const byteMask = charMaskToByteMask(view.text, charMask, view.bytes.length);
  if (!view.qp) return byteMask;
  const raw = new Array(view.rawLength).fill(1);
  const { start, end } = view as Required<BodyView>;
  for (let k = 0; k < byteMask.length; k++) {
    if (byteMask[k] !== 0) continue;
    for (let r = start[k]; r < end[k]; r++) raw[r] = 0;
    if (k + 1 < byteMask.length && byteMask[k + 1] === 0) {
      for (let r = end[k]; r < start[k + 1]; r++) raw[r] = 0;
    }
  }
  return raw;
}

/**
 * Decode a proof's masked raw body (0x00 = hidden) for display. An escape with any hidden byte
 * becomes one hidden byte (0x00). A soft break is dropped only when fully revealed.
 */
export function displayDecodeMasked(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x3d && i + 2 < bytes.length) {
      const n1 = bytes[i + 1];
      const n2 = bytes[i + 2];
      if (n1 === 0x0d && n2 === 0x0a) {
        i += 2;
        continue;
      }
      const h1 = hex(n1);
      const h2 = hex(n2);
      if (h1 >= 0 && h2 >= 0) {
        out.push(h1 * 16 + h2);
        i += 2;
        continue;
      }
      if ((n1 === 0 || h1 >= 0) && (n2 === 0 || h2 >= 0) && (n1 === 0 || n2 === 0)) {
        out.push(0);
        i += 2;
        continue;
      }
    }
    out.push(b);
  }
  return Uint8Array.from(out);
}

/**
 * Should the verify page decode this (masked) body, and why: "header" when a revealed
 * Content-Transfer-Encoding header says quoted-printable, "content" when the revealed text itself
 * is clearly QP, else null.
 * REASON: provers often hide the whole body and reveal a few sentences, which hides the part's
 * Content-Transfer-Encoding header. The page then showed raw "samples=E2=80=94whether iden=" text.
 * Decoding is display-only (the proof covers the raw bytes, and "show raw" stays available), so a
 * content heuristic is safe as long as it doesn't fire on ordinary text:
 *  - soft line breaks "=\r\n" not preceded by "=" (base64 padding "==" at a line end is not QP), and
 *  - uppercase "=XX" escapes, where every revealed stretch of the decoded text is valid UTF-8
 *    (checked after decoding, because QP may split one UTF-8 character across a soft break:
 *    "=E2=80=\r\n=94" is an em dash),
 *  - and no revealed Content-Transfer-Encoding header naming another encoding.
 */
export function quotedPrintableEvidence(maskedBody: Uint8Array): "header" | "content" | null {
  const text = new TextDecoder("latin1").decode(maskedBody);
  const ctes = [...text.matchAll(/content-transfer-encoding:\s*([a-z0-9-]+)/gi)].map((m) => m[1].toLowerCase());
  if (ctes.includes("quoted-printable")) return "header";
  if (ctes.length) return null;
  let softBreaks = 0;
  for (const m of text.matchAll(/=\r\n/g)) {
    const prev = text[m.index! - 1];
    if (prev !== "=" && prev !== "\0" && prev !== undefined) softBreaks++;
  }
  const escapes = (text.match(/=[0-9A-F]{2}/g) ?? []).length;
  if (escapes) {
    // Validate between hidden bytes (0x00): a hidden neighbour can cut a character in half.
    const decoded = displayDecodeMasked(maskedBody);
    let start = 0;
    for (let i = 0; i <= decoded.length; i++) {
      if (i < decoded.length && decoded[i] !== 0) continue;
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(decoded.subarray(start, i));
      } catch {
        return null; // escapes that aren't UTF-8 text: probably not QP, don't guess
      }
      start = i + 1;
    }
  }
  return softBreaks >= 2 || (softBreaks >= 1 && escapes >= 1) || escapes >= 3 ? "content" : null;
}

/** Should the verify page decode this (masked) body? See quotedPrintableEvidence. */
export const looksQuotedPrintable = (maskedBody: Uint8Array) => quotedPrintableEvidence(maskedBody) !== null;
