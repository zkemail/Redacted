/**
 * Pure decoding of a Redacted proof's public outputs. It has no wasm or bb.js imports, so both
 * the site (src/lib.ts) and Node tests can use it.
 *
 * Layout: [prefix fields, ...maxHeaderLength header bytes, ...maxBodyLength body bytes].
 * Each byte is one 32-byte hex field, e.g. "0x…61" = 'a'. Masked characters are 0x00.
 * Every input is canonicalized first (canonicalPublicInputs); anything else throws.
 */
export interface OutputLayout {
  prefix: number;
  maxHeaderLength: number;
  maxBodyLength: number;
}

// Input is a canonical field element (canonicalPublicInputs). REASON: the whole value is read, not
// its last two hex digits; a byte output above 0xff isn't a byte this circuit can produce.
const fieldToByte = (field: string): number => {
  const v = BigInt(field);
  if (v > 0xffn) throw new Error("byte output out of range");
  return Number(v);
};

/** BN254 scalar field modulus: every public input is an element of this field. */
export const BN254_FIELD_MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;

/**
 * Every public input as "0x" + 64 lowercase hex digits, or throw.
 *
 * REASON (review finding 2): bb.js parses public inputs with BigInt(), which also accepts decimal
 * ("65"), whitespace ("0x41 ") and other forms, while the decoders read the last two characters
 * as hex. A proof over "ABCD" verified with inputs ["65","66","67","68"] and displayed "efgh".
 * Only a 0x-prefixed hex string below the field modulus is accepted; callers verify AND decode
 * the returned array, so the verified values and the displayed bytes can't differ.
 */
export function canonicalPublicInputs(inputs: readonly unknown[]): string[] {
  if (!Array.isArray(inputs)) throw new Error("public inputs are not an array");
  return inputs.map((x, i) => {
    if (typeof x !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(x)) {
      throw new Error(`public input ${i} is not a 0x-prefixed hex field element`);
    }
    const v = BigInt(x);
    if (v >= BN254_FIELD_MODULUS) throw new Error(`public input ${i} is not below the field modulus`);
    return "0x" + v.toString(16).padStart(64, "0");
  });
}

/** Number of leading public fields in a v2 proof: modulus hash, redc hash, nullifier, lengths. */
export const V2_PREFIX = 5;

const fieldToNumber = (field: string): number => {
  const n = BigInt(field);
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
  // NOTE: a new binding, not a reassignment: the parameter stays `unknown[]` to TypeScript, and
  // `tsc -b` (the production Docker build) rejected passing its elements on as strings.
  const inputs = canonicalPublicInputs(publicInputs);
  if (inputs.length !== prefix + maxHeaderLength + maxBodyLength) throw new Error("public input count does not match the circuit");
  const headerBytes = new Uint8Array(maxHeaderLength);
  for (let i = 0; i < maxHeaderLength; i++) headerBytes[i] = fieldToByte(inputs[prefix + i]);
  const bodyStart = prefix + maxHeaderLength;
  const bodyBytes = new Uint8Array(maxBodyLength);
  for (let i = 0; i < maxBodyLength; i++) bodyBytes[i] = fieldToByte(inputs[bodyStart + i]);
  if (prefix === V2_PREFIX) {
    const headerLen = fieldToNumber(inputs[3]);
    const bodyLen = fieldToNumber(inputs[4]);
    if (headerLen > maxHeaderLength || bodyLen > maxBodyLength) throw new Error("committed length exceeds circuit maximum");
    return { header: headerBytes.slice(0, headerLen), body: bodyBytes.slice(0, bodyLen) };
  }
  return {
    header: headerBytes.slice(0, legacyContentLength(headerBytes)),
    body: bodyBytes.slice(0, legacyContentLength(bodyBytes)),
  };
}
