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

// Trim the circuit's zero padding and the SHA-256 padding (0x80, zeros, 8-byte length) that
// the DKIM hashing carries along, leaving only the email content.
function trimSha256Padding(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  for (let i = end - 1; i >= 0 && i >= end - 72; i--) {
    if (bytes[i] === 0x80) {
      let looksLikePadding = true;
      for (let j = i + 1; j < end; j++) {
        if (bytes[j] !== 0 && j < end - 8) {
          looksLikePadding = false;
          break;
        }
      }
      if (looksLikePadding) {
        end = i;
        break;
      }
    }
  }
  return bytes.slice(0, end);
}

/** Raw masked header/body bytes (0x00 = masked) exactly as the proof commits to them. */
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
  return { header: trimSha256Padding(headerBytes), body: trimSha256Padding(bodyBytes) };
}
