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

/** Should the verify page decode this (masked) body? Only if its revealed bytes say it's QP. */
export const looksQuotedPrintable = (maskedBody: Uint8Array) =>
  /content-transfer-encoding:\s*quoted-printable/i.test(new TextDecoder("latin1").decode(maskedBody));
