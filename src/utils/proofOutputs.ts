/**
 * Pure decoding of a Redacted proof's public outputs. It has no wasm or bb.js imports, so both
 * the site (src/lib.ts) and Node tests can use it.
 *
 * Layout: [prefix fields, ...maxHeaderLength header bytes, ...maxBodyLength body bytes].
 * Each byte is one 32-byte hex field, e.g. "0x…61" = 'a'. Masked characters are 0x00.
 */
export interface OutputLayout {
  prefix: number;
  maxHeaderLength: number;
  maxBodyLength: number;
}

const hexFieldToByte = (hexField: unknown): number => {
  if (typeof hexField === "string") {
    const hex = hexField.startsWith("0x") ? hexField.slice(2) : hexField;
    return parseInt(hex.slice(-2), 16);
  }
  if (typeof hexField === "number") return hexField & 0xff;
  return 0;
};

/** Number of leading public fields in a v2 proof: modulus hash, redc hash, nullifier, lengths. */
export const V2_PREFIX = 5;

const fieldToNumber = (field: unknown): number => {
  const n = BigInt(typeof field === "string" && !field.startsWith("0x") ? "0x" + field : String(field));
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("length field out of range");
  return Number(n);
};

// v1 proofs carry no lengths, so find where the content ends from the SHA-256 padding the input
// generator leaves after it: 0x80 at the content length p, zeros, then the 64-bit bit-length
// (8·p) at the end of that 64-byte block. Checking the length field makes this exact for
// honest v1 outputs.
// REASON: the old heuristic ("last 0x80 followed only by zeros") picked the length field's own
// byte whenever len ≡ 16 (mod 32), because 8·len then ends in 0x80. That showed padding junk.
// It can't detect text a prover appended after the padding; see the legacy warning.
function legacyContentLength(bytes: Uint8Array): number {
  for (let p = 0; p < bytes.length; p++) {
    if (bytes[p] !== 0x80) continue;
    const blockEnd = Math.ceil((p + 9) / 64) * 64;
    if (blockEnd > bytes.length) break;
    let bits = 0n;
    for (let k = blockEnd - 8; k < blockEnd; k++) bits = (bits << 8n) | BigInt(bytes[k]);
    if (bits !== BigInt(p) * 8n) continue;
    let zeros = true;
    for (let k = p + 1; k < blockEnd - 8 && zeros; k++) zeros = bytes[k] === 0;
    if (zeros) return p;
  }
  // No padding found (e.g. it was masked): fall back to trimming trailing zeros.
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return end;
}

/**
 * Raw masked header/body bytes (0x00 = masked) exactly as the proof commits to them.
 *
 * v2 (prefix 5): the circuit publishes the signed header/body lengths and zeroes every byte past
 * them, so decoding is an exact slice. v1: see legacyContentLength.
 */
export function decodeMaskedBytes(
  publicInputs: readonly unknown[],
  layout: OutputLayout
): { header: Uint8Array; body: Uint8Array } {
  const { prefix, maxHeaderLength, maxBodyLength } = layout;
  const headerBytes = new Uint8Array(maxHeaderLength);
  for (let i = 0; i < maxHeaderLength; i++) headerBytes[i] = hexFieldToByte(publicInputs[prefix + i]);
  const bodyStart = prefix + maxHeaderLength;
  const bodyBytes = new Uint8Array(maxBodyLength);
  for (let i = 0; i < maxBodyLength; i++) bodyBytes[i] = hexFieldToByte(publicInputs[bodyStart + i]);
  if (prefix === V2_PREFIX) {
    const headerLen = fieldToNumber(publicInputs[3]);
    const bodyLen = fieldToNumber(publicInputs[4]);
    if (headerLen > maxHeaderLength || bodyLen > maxBodyLength) throw new Error("committed length exceeds circuit maximum");
    return { header: headerBytes.slice(0, headerLen), body: bodyBytes.slice(0, bodyLen) };
  }
  return {
    header: headerBytes.slice(0, legacyContentLength(headerBytes)),
    body: bodyBytes.slice(0, legacyContentLength(bodyBytes)),
  };
}
