import "./polyfills";
import { Barretenberg, UltraHonkBackend, UltraHonkVerifierBackend, type ProofData } from "@aztec/bb.js";
import { Noir, type CompiledCircuit } from "@noir-lang/noir_js";
import initNoirC from "@noir-lang/noirc_abi";
import initACVM from "@noir-lang/acvm_js";
import acvm from "@noir-lang/acvm_js/web/acvm_js_bg.wasm?url";
import noirc from "@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url";
import {
  generateEmailVerifierInputsFromDKIMResult
} from "@zk-email/zkemail-nr";
import { bnToLimbStrArray } from "@mach-34/noir-bignum-paramgen";
import { get as idbGet } from "idb-keyval";
import type { DKIMResult } from "./utils/emlParser";
import circuitConfigs from "./circuit-configs.json";
import { decodeMaskedBytes, V2_PREFIX } from "./utils/proofOutputs";
import { dkimFieldSequence } from "./utils/dkimFields";
import { bodyViewFor, viewMaskToRawMask, displayDecodeMasked, looksQuotedPrintable } from "./utils/qp";

/**
 * Circuit versions
 *
 * v2 (current): Noir 1.0.0-rc.3 + Barretenberg 5.0.0 + zkemail.nr v2. Public inputs are
 *   [modulus hash, redc hash, nullifier, header len, body len, ...header bytes, ...body bytes],
 *   with every byte past the signed length zeroed. Verified against verification keys generated at
 *   build time (src/circuit/target/vk).
 * v1 (legacy): Noir beta.5 + bb.js 0.84. Public inputs are [key hash, nullifier, ...]. Kept only
 *   so links created before the upgrade still verify. The verify page labels every v1 proof as
 *   legacy, because:
 *   - v1 published bytes past the signed length, so a prover could append unsigned text;
 *   - its 2048-bit key hash doesn't bind redc (zkemail.nr PR #62).
 *
 * The public-input count differs between every v1 and v2 tier, so the version is derived from
 * the proof's shape. It never needs to be trusted from metadata.
 */
export type CircuitVersion = 1 | 2;

interface CircuitConfig {
  name: string;
  version: CircuitVersion;
  maxHeaderLength: number;
  maxBodyLength: number;
  keyBits: number;
  /** false = too large to prove in a browser; prove it with the agent CLI instead */
  browser: boolean;
}

const V2_CIRCUITS: CircuitConfig[] = circuitConfigs.circuits.map((c) => ({
  name: c.name,
  version: 2,
  maxHeaderLength: c.maxHeaderLength,
  maxBodyLength: c.maxBodyLength,
  keyBits: c.keyBits,
  browser: c.browser,
}));
const V1_CIRCUITS: CircuitConfig[] = circuitConfigs.legacy.map((c) => ({
  name: c.name,
  version: 1,
  maxHeaderLength: c.maxHeaderLength,
  maxBodyLength: c.maxBodyLength,
  keyBits: c.keyBits,
  browser: false,
}));

const prefixLength = (version: CircuitVersion) => (version === 2 ? V2_PREFIX : 2);
const publicInputCount = (c: CircuitConfig) =>
  prefixLength(c.version) + c.maxHeaderLength + c.maxBodyLength;

// Browser-provable v2 circuits. Vite code-splits each JSON, so only the selected one downloads.
// NOTE: the large tier is intentionally absent. Proving its 2^22-gate circuit needs ~7 GB,
// beyond a browser's 4 GB WebAssembly memory. Those emails are proved with the CLI
// (skills/redacted-email-proof) and verified here from the VK alone.
const V2_LOADERS: Record<string, () => Promise<unknown>> = {
  email_mask_1024_small: () => import("./circuit/target/email_mask_1024_small.json"),
  email_mask_1024_mid: () => import("./circuit/target/email_mask_1024_mid.json"),
  email_mask_2048_small: () => import("./circuit/target/email_mask_2048_small.json"),
  email_mask_2048_mid: () => import("./circuit/target/email_mask_2048_mid.json"),
};
const V1_LOADERS: Record<string, () => Promise<unknown>> = {
  email_mask_1024_small: () => import("./circuit/legacy-v1/email_mask_1024_small.json"),
  email_mask_1024_mid: () => import("./circuit/legacy-v1/email_mask_1024_mid.json"),
  email_mask_2048_small: () => import("./circuit/legacy-v1/email_mask_2048_small.json"),
  email_mask_2048_mid: () => import("./circuit/legacy-v1/email_mask_2048_mid.json"),
};
// Verification keys are tiny (~4 KB) and cover every v2 tier, including large.
const V2_VK_URLS = import.meta.glob("./circuit/target/vk/*.vk", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

const circuitCache = new Map<string, CompiledCircuit>();

async function loadCircuit(c: CircuitConfig): Promise<CompiledCircuit> {
  const key = `v${c.version}:${c.name}`;
  const cached = circuitCache.get(key);
  if (cached) return cached;
  const loader = (c.version === 2 ? V2_LOADERS : V1_LOADERS)[c.name];
  if (!loader) throw new Error(`Circuit ${c.name} (v${c.version}) cannot be loaded in the browser`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const module: any = await loader();
  const circuit = (module.default ?? module) as CompiledCircuit;
  circuitCache.set(key, circuit);
  return circuit;
}

async function loadVk(c: CircuitConfig): Promise<Uint8Array> {
  const url = V2_VK_URLS[`./circuit/target/vk/${c.name}.vk`];
  if (!url) throw new Error(`No verification key bundled for ${c.name}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load verification key for ${c.name}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Clear the circuit cache to free memory
 */
export function clearCircuitCache(): void {
  circuitCache.clear();
}

// Initialize WASM modules
await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);

// CRS (SRS) points a Barretenberg instance loads. Proving needs at least the circuit's dyadic
// size: 2^20 for small/mid (≈564k / 900k gates) and QP small, 2^21 for QP mid (≈1.4M gates). Verifying from a VK needs
// almost none, but bb.js 5 downloads the compressed CRS in 2^17-point (4 MB) chunks and rejects
// any other size ("compressed points_buf size … must be a positive multiple of 4194304").
const PROVE_SRS_POINTS = 2 ** 21;
const VERIFY_SRS_POINTS = 2 ** 17;

// REASON: bb.js 5 caches the CRS in IndexedDB under "g1Data" and passes the cached buffer
// straight to wasm whenever it holds AT LEAST the requested points. With MORE points cached, wasm
// rejects it ("SrsInitSrs: invalid points_buf size. Expected 32 or 64 bytes per point, got 128")
// and every proof fails verification. The cache can be larger because:
//   - legacy bb.js 0.84 (old site versions, and the legacy-link verifier) writes the same key, or
//   - an earlier bb.js 5 instance loaded a bigger CRS.
// Requesting max(needed, cached) never mismatches and never re-downloads what is already cached.
// Tried: truncating the cache entry. Legacy code rewrites it, so prove/verify kept re-downloading.
async function srsPointsFor(minPoints: number): Promise<number> {
  try {
    const cached = await idbGet("g1Data");
    if (cached instanceof Uint8Array && cached.length % 64 === 0) {
      return Math.max(minPoints, cached.length / 64);
    }
  } catch {
    // IndexedDB unavailable (private mode): bb.js will just download
  }
  return minPoints;
}

// Barretenberg instances by purpose. Creating one downloads the wasm and spins up workers.
// Multi-threading needs cross-origin isolation (COOP/COEP headers) for SharedArrayBuffer.
const bbInstances = new Map<string, Promise<Barretenberg>>();
function getBarretenberg(purpose: "prove" | "verify"): Promise<Barretenberg> {
  let instance = bbInstances.get(purpose);
  if (!instance) {
    instance = srsPointsFor(purpose === "prove" ? PROVE_SRS_POINTS : VERIFY_SRS_POINTS).then((srsSize) =>
      Barretenberg.new({
        threads: self.crossOriginIsolated ? navigator.hardwareConcurrency || 4 : 1,
        srsSize,
      })
    );
    instance.catch(() => bbInstances.delete(purpose));
    bbInstances.set(purpose, instance);
  }
  return instance;
}

export const CLI_URL = "https://redacted.zk.email/skills/redacted-email-proof/SKILL.md";

/**
 * Pick the smallest browser-provable v2 circuit for this email.
 */
function selectCircuit(keyBits: number, headerLength: number, bodyLength: number): CircuitConfig {
  const forKey = V2_CIRCUITS.filter((c) => c.keyBits === keyBits);
  if (forKey.length === 0) {
    throw new Error(
      `Unsupported DKIM key size: ${keyBits} bits. ` +
      `This application only supports ${[...new Set(V2_CIRCUITS.map((c) => c.keyBits))].join(" and ")}-bit RSA keys. ` +
      `The email you're trying to verify was signed with a ${keyBits}-bit key.`
    );
  }
  const fit = forKey.find((c) => headerLength <= c.maxHeaderLength && bodyLength <= c.maxBodyLength);
  if (!fit) {
    const largest = forKey[forKey.length - 1];
    throw new Error(
      `Email too long: the signed header is ${headerLength} bytes and the body ${bodyLength} bytes. ` +
      `The largest circuit supports ${largest.maxHeaderLength} / ${largest.maxBodyLength} bytes.`
    );
  }
  if (!fit.browser) {
    throw new Error(
      `Email too long to prove in the browser (${bodyLength}-byte body; the browser limit is ` +
      `${Math.max(...forKey.filter((c) => c.browser).map((c) => c.maxBodyLength))} bytes). ` +
      `Emails with bodies up to ${fit.maxBodyLength} bytes can be proved locally with the command-line prover: ${CLI_URL}`
    );
  }
  return fit;
}

/**
 * Generate a zero-knowledge proof for email verification
 *
 * @param email - The original email content (EML format)
 * @param headerMask - 0/1 per header byte (0 = hide, 1 = reveal)
 * @param bodyMask - 0/1 per body byte (0 = hide, 1 = reveal)
 * @param existingDkimResult - Optional pre-verified DKIM result to avoid double verification
 *
 * IMPORTANT: The returned proof does NOT contain the original email. Its public inputs carry only
 * the masked header/body (hidden bytes are 0x00).
 */
export const handleGenerateProof = async (
  email: string,
  headerMask: number[],
  bodyMask: number[],
  existingDkimResult?: DKIMResult
) => {
  let dkimResult = existingDkimResult;
  if (!dkimResult) {
    const { verifyDKIMSignature } = await import("@zk-email/helpers/dist/dkim");
    const { verifyWithSignerFallback } = await import("./utils/dkimSigner");
    dkimResult = await verifyWithSignerFallback(email, (raw, domain) =>
      verifyDKIMSignature(raw as string, domain)
    );
  }

  // The UI's body mask is per character of the displayed body, which is decoded for
  // quoted-printable emails (utils/qp.ts). Map it to the raw signed bytes the circuit masks.
  const bodyByteMask = viewMaskToRawMask(bodyViewFor(dkimResult.body), bodyMask);
  const config = selectCircuit(dkimResult.modulusLength, dkimResult.headers.length, dkimResult.body.length);
  const circuit = await loadCircuit(config);

  // Pad masks with 1s (reveal) up to the circuit size: padding bytes are zeros anyway.
  const pad = (mask: number[], n: number) =>
    mask.length < n ? [...mask, ...new Array(n - mask.length).fill(1)] : mask.slice(0, n);
  // REASON: zkemail-nr's input generator can't find a c=simple "DKIM-Signature" (see
  // utils/dkimFields.ts). Give it a copy with only the field name lowercased (same length), then
  // restore the real signed header bytes and set the sequence and bh index ourselves.
  const headerText = new TextDecoder("latin1").decode(dkimResult.headers);
  const seq = dkimFieldSequence(headerText);
  const lowered = new Uint8Array(dkimResult.headers);
  for (let i = seq.index; i < seq.index + 14; i++) lowered[i] = headerText.charCodeAt(i) | 0x20;
  const inputs = await generateEmailVerifierInputsFromDKIMResult({ ...dkimResult, headers: Buffer.from(lowered) }, {
    headerMask: pad(headerMask, config.maxHeaderLength),
    bodyMask: pad(bodyByteMask, config.maxBodyLength),
    maxHeadersLength: config.maxHeaderLength,
    maxBodyLength: config.maxBodyLength,
  });
  for (let i = 0; i < dkimResult.headers.length; i++) inputs.header.storage[i] = String(dkimResult.headers[i]);
  inputs.dkim_header_sequence = { index: String(seq.index), length: String(seq.length) };
  inputs.body_hash_index = String(seq.bodyHashIndex);

  // REASON: the v2 circuits use noir-bignum >= v0.9, whose Barrett parameter is
  // floor(2^(2k + 6) / n). zkemail-nr 2.0.0 still derives redc with 2^(2k + 4) (via
  // @mach-34/noir-bignum-paramgen), which makes witness generation fail inside the RSA check.
  // Keep in sync with redcLimbsV2 in skills/redacted-email-proof/scripts/redacted.mjs.
  const keyBits = BigInt(dkimResult.modulusLength);
  inputs.pubkey.redc = bnToLimbStrArray((1n << (2n * keyBits + 6n)) / dkimResult.publicKey);

  const { witness } = await new Noir(circuit).execute(inputs);

  console.time("generateProof");
  const api = await getBarretenberg("prove");
  const proof = await new UltraHonkBackend(circuit.bytecode, api).generateProof(witness);
  console.timeEnd("generateProof");

  return withCircuitMetadata(proof, config);
};

/**
 * ProofData plus the circuit it was made with. The metadata is only a hint for faster
 * verification; verification re-derives candidates from the public-input count.
 */
export interface ProofWithCircuit extends ProofData {
  circuit?: string;
  circuitVersion?: CircuitVersion;
}

function withCircuitMetadata(proof: ProofData, c: CircuitConfig): ProofWithCircuit {
  return Object.assign(proof, { circuit: c.name, circuitVersion: c.version });
}

/**
 * Which circuits could have produced a proof with this many public inputs, most likely first.
 */
function candidateCircuits(proof: ProofWithCircuit): CircuitConfig[] {
  const n = proof.publicInputs?.length ?? 0;
  const shape = [...V2_CIRCUITS, ...V1_CIRCUITS].filter((c) => publicInputCount(c) === n);
  const named = shape.filter((c) => c.name === proof.circuit && (!proof.circuitVersion || c.version === proof.circuitVersion));
  // 2048-bit DKIM keys are by far the most common, so try those first.
  return [...named, ...shape.filter((c) => !named.includes(c)).sort((a, b) => b.keyBits - a.keyBits)];
}

export interface VerificationResult {
  valid: boolean;
  circuit?: string;
  version?: CircuitVersion;
  keyBits?: number;
  /** v1 proof: could carry appended unsigned text, and (2048-bit) the key hash doesn't bind redc */
  legacy?: boolean;
}

async function verifyWith(c: CircuitConfig, proof: ProofData): Promise<boolean> {
  if (c.version === 2) {
    // VK-only verification: milliseconds, and works for tiers the browser can't prove.
    const api = await getBarretenberg("verify");
    return new UltraHonkVerifierBackend(api).verifyProof({ ...proof, verificationKey: await loadVk(c) });
  }
  // Legacy links only: bb.js 0.84 (npm alias "bb-legacy") has to rebuild the VK from bytecode.
  const legacy = await import("bb-legacy");
  const backend = new legacy.UltraHonkBackend((await loadCircuit(c)).bytecode);
  try {
    return await backend.verifyProof(proof);
  } finally {
    await backend.destroy();
  }
}

/**
 * Verify a zero-knowledge proof against every circuit whose output shape matches.
 */
export const handleVerifyProof = async (proof: ProofWithCircuit): Promise<VerificationResult> => {
  for (const c of candidateCircuits(proof)) {
    try {
      if (await verifyWith(c, proof)) {
        console.log(`✅ [VERIFY] Verification successful with ${c.name} (v${c.version})`);
        return {
          valid: true,
          circuit: c.name,
          version: c.version,
          keyBits: c.keyBits,
          legacy: c.version === 1,
        };
      }
    } catch (e) {
      console.warn(`[VERIFY] ${c.name} (v${c.version}) failed:`, e);
    }
  }
  console.error("❌ [VERIFY] Proof verification failed with all candidate circuits");
  return { valid: false };
};

/**
 * Extract masked header and body from proof public inputs.
 *
 * Layout: [prefix fields (2 for v1, 3 for v2), ...maxHeaderLength header bytes,
 * ...maxBodyLength body bytes]. Each byte is a 32-byte hex field, e.g. "0x…61" = 'a'.
 * Masked characters are 0x00. The original email cannot be recovered from the proof.
 */
export function extractMaskedDataFromProof(proof: ProofWithCircuit): {
  maskedHeader: string;
  maskedBody: string;
  publicKeyHash: Uint8Array;
  emailNullifier: Uint8Array;
  version: CircuitVersion;
  bodyDecodedFromQp: boolean;
} | null {
  try {
    const layout = candidateCircuits(proof)[0];
    if (!layout) {
      console.error(`Unknown circuit configuration: ${proof.publicInputs?.length} publicInputs`);
      return null;
    }
    const prefix = prefixLength(layout.version);

    const hexToUint8Array = (hexField: unknown): Uint8Array => {
      if (typeof hexField !== "string") return new Uint8Array(0);
      const hex = hexField.startsWith("0x") ? hexField.slice(2) : hexField;
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
      return bytes;
    };

    const publicKeyHash = hexToUint8Array(proof.publicInputs[0]);
    const emailNullifier = hexToUint8Array(proof.publicInputs[layout.version === 2 ? 2 : 1]);

    const { header, body } = decodeMaskedBytes(proof.publicInputs, {
      prefix,
      maxHeaderLength: layout.maxHeaderLength,
      maxBodyLength: layout.maxBodyLength,
    });

    const decoder = new TextDecoder("utf-8", { fatal: false });
    // Display-only decoding of the proven raw bytes (quoted-printable is a public function of them).
    const bodyDecodedFromQp = looksQuotedPrintable(body);
    return {
      maskedHeader: decoder.decode(header),
      maskedBody: decoder.decode(bodyDecodedFromQp ? displayDecodeMasked(body) : body),
      bodyDecodedFromQp,
      publicKeyHash,
      emailNullifier,
      version: layout.version,
    };
  } catch (e) {
    console.error("Error extracting masked data from proof:", e);
    return null;
  }
}
