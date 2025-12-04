import "./polyfills";
import { UltraHonkBackend, type ProofData } from "@aztec/bb.js";
import { Noir, type CompiledCircuit } from "@noir-lang/noir_js";
import initNoirC from "@noir-lang/noirc_abi";
import initACVM from "@noir-lang/acvm_js";
import acvm from "@noir-lang/acvm_js/web/acvm_js_bg.wasm?url";
import noirc from "@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url";
// import circuit from "./circuit/target/circuit.json";
import { generateEmailVerifierInputs } from "@zk-email/zkemail-nr";
import circuitEmailMaskJson from "./circuit/target/email_mask.json";
import circuitEmailMaskMidJson from "./circuit/target/email_mask_mid.json";
import circuitEmailMaskLargeJson from "./circuit/target/email_mask_large.json";
import circuitEmailMaskXLargeJson from "./circuit/target/email_mask_xlarge.json";

// Circuit configurations
const CIRCUIT_CONFIGS = [
  {
    name: "email_mask",
    circuit: circuitEmailMaskJson as CompiledCircuit,
    maxHeaderLength: 512,
    maxBodyLength: 1024,
  },
  {
    name: "email_mask_mid",
    circuit: circuitEmailMaskMidJson as CompiledCircuit,
    maxHeaderLength: 1024,
    maxBodyLength: 2048,
  },
  {
    name: "email_mask_large",
    circuit: circuitEmailMaskLargeJson as CompiledCircuit,
    maxHeaderLength: 2048,
    maxBodyLength: 4096,
  },
  {
    name: "email_mask_xlarge",
    circuit: circuitEmailMaskXLargeJson as CompiledCircuit,
    maxHeaderLength: 4096,
    maxBodyLength: 8192,
  },
] as const;

// Initialize WASM modules
await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);

/**
 * Extended ProofData type that includes circuit metadata
 */
interface ProofDataWithMetadata extends ProofData {
  __circuitName?: string;
  __maxHeaderLength?: number;
  __maxBodyLength?: number;
}

/**
 * Select the appropriate circuit based on body mask length only
 * 
 * @param headerMaskLength - Length of the header mask array (for logging only)
 * @param bodyMaskLength - Length of the body mask array
 * @returns The circuit configuration that can accommodate the body size
 */
function selectCircuit(headerMaskLength: number, bodyMaskLength: number) {
  // Find the smallest circuit that can accommodate the body mask length
  // Header mask length is not considered in the selection
  for (const config of CIRCUIT_CONFIGS) {
    if (bodyMaskLength <= config.maxBodyLength) {
      console.log(`📦 [CIRCUIT] Selected ${config.name} (header: ${headerMaskLength}/${config.maxHeaderLength}, body: ${bodyMaskLength}/${config.maxBodyLength})`);
      return config;
    }
  }
  
  // If no circuit can accommodate, use the largest one and log a warning
  const largest = CIRCUIT_CONFIGS[CIRCUIT_CONFIGS.length - 1];
  console.warn(`⚠️ [CIRCUIT] Body mask size (${bodyMaskLength}) exceeds all circuit limits. Using largest circuit: ${largest.name}`);
  return largest;
}

/**
 * Generate a zero-knowledge proof for email verification
 *
 * @param email - The original email content (EML format)
 * @param headerMask - Array of 0s and 1s indicating which header bytes to mask (0 = mask/hide, 1 = reveal)
 * @param bodyMask - Array of 0s and 1s indicating which body bytes to mask (0 = mask/hide, 1 = reveal)
 * @returns ProofData containing the proof and public inputs, or null if generation failed
 *
 * IMPORTANT: The returned proof does NOT contain the original email.
 * - The proof.proof field contains cryptographic proof bytes (not the email)
 * - The proof.publicInputs contains masked header/body (characters at masked positions are replaced with null bytes)
 * - The original email cannot be recovered from the proof - this is by design (zero-knowledge property)
 *
 * To access the original email, you must store it separately (e.g., the 'email' parameter passed to this function)
 */
export const handleGenerateProof = async (
  email: string,
  headerMask: number[],
  bodyMask: number[]
) => {
  try {

    console.log("headerMask", headerMask);
    console.log("bodyMask", bodyMask);
    console.log("headerMask.length", headerMask.length);
    console.log("bodyMask.length", bodyMask.length);
    // Select circuit based on actual mask lengths (before padding)
    const circuitConfig = selectCircuit(headerMask.length, bodyMask.length);
    const selectedCircuit = circuitConfig.circuit;
    
    const noir = new Noir(selectedCircuit);
    const backend = new UltraHonkBackend(selectedCircuit.bytecode);

    const inputParams = {
      maxHeadersLength: circuitConfig.maxHeaderLength,
      maxBodyLength: circuitConfig.maxBodyLength,
    };

    // Frontend now uses circuit-aligned semantics: 0=hide/mask, 1=reveal/keep
    // No inversion needed - pass masks directly

    // Pad arrays with 1s (reveal) if shorter than required lengths, or slice if longer
    // Padding bytes should be revealed (kept), not hidden
    const paddedHeaderMask = headerMask.length < circuitConfig.maxHeaderLength
      ? [...headerMask, ...new Array(circuitConfig.maxHeaderLength - headerMask.length).fill(1)]
      : headerMask.slice(0, circuitConfig.maxHeaderLength);
    const paddedBodyMask = bodyMask.length < circuitConfig.maxBodyLength
      ? [...bodyMask, ...new Array(circuitConfig.maxBodyLength - bodyMask.length).fill(1)]
      : bodyMask.slice(0, circuitConfig.maxBodyLength);

    const inputs = await generateEmailVerifierInputs(email, {
      headerMask: paddedHeaderMask,
      bodyMask: paddedBodyMask,
      ...inputParams,
    });
    // generate witness
    const { witness } = await noir.execute(inputs);

    console.time("generateProof");
    const proof = await backend.generateProof(witness);
    console.timeEnd("generateProof");

    // Store circuit name in proof metadata for verification
    // We'll add it as a custom property (note: this won't affect the proof structure)
    const proofWithMetadata = proof as ProofDataWithMetadata;
    proofWithMetadata.__circuitName = circuitConfig.name;
    proofWithMetadata.__maxHeaderLength = circuitConfig.maxHeaderLength;
    proofWithMetadata.__maxBodyLength = circuitConfig.maxBodyLength;

    return proof;
  } catch (e) {
    console.error(e);
    return null;
  }
};

/**
 * Verify a zero-knowledge proof
 * 
 * @param proof - The ProofData object to verify
 * @param circuitName - Optional circuit name to use for verification. If not provided, will try to detect from proof metadata or try all circuits
 * @returns true if proof is valid, false otherwise
 */
export const handleVerifyProof = async (proof: ProofData, circuitName?: string) => {
  try {
    console.log("🔍 [VERIFY] Starting proof verification");
    console.log("🔍 [VERIFY] publicInputs count:", proof.publicInputs?.length);
    const firstInputType = typeof (proof.publicInputs?.[0] as unknown);
    console.log("🔍 [VERIFY] First publicInput type:", firstInputType);
    
    if (proof.publicInputs && proof.publicInputs.length > 0) {
      const firstInput = proof.publicInputs[0] as unknown;
      if (typeof firstInput === 'string') {
        console.log("✅ [VERIFY] First publicInput is string (correct format):", firstInput.substring(0, 50));
      } else if (firstInput instanceof Uint8Array) {
        console.error("❌ [VERIFY] First publicInput is Uint8Array (WRONG! Should be string)");
        console.error("❌ [VERIFY] This will cause the library to fail - it expects strings!");
      } else {
        console.error("❌ [VERIFY] First publicInput is unexpected type:", typeof firstInput, firstInput);
      }
    }
    
    // Determine which circuit to use for verification
    let circuitToUse: CompiledCircuit | null = null;
    
    if (circuitName) {
      // Use specified circuit
      const config = CIRCUIT_CONFIGS.find(c => c.name === circuitName);
      if (config) {
        circuitToUse = config.circuit;
        console.log(`🔍 [VERIFY] Using specified circuit: ${circuitName}`);
      } else {
        console.warn(`⚠️ [VERIFY] Circuit name "${circuitName}" not found, trying to detect...`);
      }
    }
    
    if (!circuitToUse) {
      // Try to detect from proof metadata
      const proofWithMeta = proof as ProofDataWithMetadata;
      if (proofWithMeta.__circuitName) {
        const config = CIRCUIT_CONFIGS.find(c => c.name === proofWithMeta.__circuitName);
        if (config) {
          circuitToUse = config.circuit;
          console.log(`🔍 [VERIFY] Detected circuit from metadata: ${proofWithMeta.__circuitName}`);
        }
      }
    }
    
    if (!circuitToUse) {
      // Try all circuits (fallback)
      console.log("🔍 [VERIFY] Circuit not specified or detected, trying all circuits...");
      for (const config of CIRCUIT_CONFIGS) {
        try {
          const backend = new UltraHonkBackend(config.circuit.bytecode);
          const isValid = await backend.verifyProof(proof);
          if (isValid) {
            console.log(`✅ [VERIFY] Verification successful with circuit: ${config.name}`);
            return true;
          }
        } catch {
          // Try next circuit
          continue;
        }
      }
      console.error("❌ [VERIFY] Proof verification failed with all circuits");
      return false;
    }
    
    const backend = new UltraHonkBackend(circuitToUse.bytecode);
    console.log("🔍 [VERIFY] Calling backend.verifyProof()...");
    const isValid = await backend.verifyProof(proof);
    console.log("✅ [VERIFY] Verification result:", isValid);
    return isValid;
  } catch (e) {
    console.error("❌ [VERIFY] Error:", e);
    if (e instanceof Error) {
      console.error("❌ [VERIFY] Error message:", e.message);
      // Check if error message contains the comma-separated string
      if (e.message.includes(',')) {
        console.error("❌ [VERIFY] ERROR CONTAINS COMMA-SEPARATED STRING - This suggests a Uint8Array was converted to string!");
      }
    }
    return false;
  }
};

/**
 * Generate proof and extract masked email in one call
 *
 * @param email - The original email content (EML format)
 * @param headerMask - Array of 0s and 1s indicating which header bytes to mask (0 = mask/hide, 1 = reveal)
 * @param bodyMask - Array of 0s and 1s indicating which body bytes to mask (0 = mask/hide, 1 = reveal)
 * @returns Object containing both the proof and the masked email data, or null if generation failed
 */
export async function generateProofWithMaskedEmail(
  email: string,
  headerMask: number[],
  bodyMask: number[]
): Promise<{
  proof: ProofData;
  maskedHeader: string;
  maskedBody: string;
  publicKeyHash: Uint8Array;
  emailNullifier: Uint8Array;
} | null> {
  const proof = await handleGenerateProof(email, headerMask, bodyMask);
  if (!proof) return null;
  
  const maskedData = extractMaskedDataFromProof(proof);
  if (!maskedData) return null;
  
  return {
    proof,
    ...maskedData,
  };
}

/**
 * Extract masked header and body from proof public inputs
 *
 * IMPORTANT: This returns the MASKED versions, NOT the original email.
 * The original email cannot be recovered from the proof - that's the whole
 * point of zero-knowledge proofs. The masked data has characters at masked
 * positions replaced (typically with 0 or placeholder values).
 *
 * Noir circuit output structure:
 * - publicInputs[0]: Public key hash (32-byte field element as hex string)
 * - publicInputs[1]: Email nullifier (32-byte field element as hex string)
 * - publicInputs[2..2+maxHeaderLength-1]: Each byte of masked header (one field per byte)
 * - publicInputs[2+maxHeaderLength..]: Each byte of masked body (one field per byte)
 *
 * Each byte is stored as a 32-byte padded hex string, e.g., "0x0000...0061" = 'a' (0x61)
 *
 * @param proof The ProofData object from handleGenerateProof
 * @returns Object containing masked header and body as strings, or null if structure is unexpected
 */
export function extractMaskedDataFromProof(proof: ProofData): {
  maskedHeader: string;
  maskedBody: string;
  publicKeyHash: Uint8Array;
  emailNullifier: Uint8Array;
} | null {
  try {
    if (!proof.publicInputs || proof.publicInputs.length < 4) {
      console.error("Invalid proof: publicInputs too short");
      return null;
    }

    // Determine circuit configuration from publicInputs length
    // Structure: 2 (pubkey + nullifier) + maxHeaderLength + maxBodyLength
    const totalInputs = proof.publicInputs.length;
    let maxHeaderLength: number;
    let maxBodyLength: number;

    // Check against known circuit configurations
    // 2 + 512 + 1024 = 1538 (email_mask)
    // 2 + 1024 + 2048 = 3074 (email_mask_mid)
    // 2 + 2048 + 4096 = 6146 (email_mask_large)
    // 2 + 4096 + 8192 = 12290 (email_mask_xlarge)
    if (totalInputs === 1538) {
      maxHeaderLength = 512;
      maxBodyLength = 1024;
    } else if (totalInputs === 3074) {
      maxHeaderLength = 1024;
      maxBodyLength = 2048;
    } else if (totalInputs === 6146) {
      maxHeaderLength = 2048;
      maxBodyLength = 4096;
    } else if (totalInputs === 12290) {
      maxHeaderLength = 4096;
      maxBodyLength = 8192;
    } else {
      // Try to use metadata if available
      const proofWithMeta = proof as ProofDataWithMetadata;
      if (proofWithMeta.__maxHeaderLength && proofWithMeta.__maxBodyLength) {
        maxHeaderLength = proofWithMeta.__maxHeaderLength;
        maxBodyLength = proofWithMeta.__maxBodyLength;
      } else {
        console.error(`Unknown circuit configuration: ${totalInputs} publicInputs`);
        return null;
      }
    }

    console.log(`Detected circuit: maxHeader=${maxHeaderLength}, maxBody=${maxBodyLength}`);

    // Helper to extract a single byte from a 32-byte padded hex field
    // e.g., "0x0000000000000000000000000000000000000000000000000000000000000061" -> 0x61
    const hexFieldToByte = (hexField: unknown): number => {
      if (typeof hexField === 'string') {
        // Remove 0x prefix if present
        const hex = hexField.startsWith('0x') ? hexField.slice(2) : hexField;
        // Parse the last 2 characters (1 byte) - the actual value
        const lastByte = hex.slice(-2);
        return parseInt(lastByte, 16);
      }
      if (typeof hexField === 'number') {
        return hexField & 0xFF;
      }
      return 0;
    };

    // Helper to convert hex string to Uint8Array (for pubkey hash and nullifier)
    const hexToUint8Array = (hexField: unknown): Uint8Array => {
      if (typeof hexField === 'string') {
        const hex = hexField.startsWith('0x') ? hexField.slice(2) : hexField;
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return bytes;
      }
      return new Uint8Array(0);
    };

    // Extract public key hash and nullifier (first 2 elements)
    const publicKeyHash = hexToUint8Array(proof.publicInputs[0]);
    const emailNullifier = hexToUint8Array(proof.publicInputs[1]);

    // Extract header bytes (elements 2 to 2+maxHeaderLength)
    const headerStartIdx = 2;
    const headerEndIdx = headerStartIdx + maxHeaderLength;
    const headerBytes = new Uint8Array(maxHeaderLength);
    for (let i = 0; i < maxHeaderLength; i++) {
      headerBytes[i] = hexFieldToByte(proof.publicInputs[headerStartIdx + i]);
    }

    // Extract body bytes (elements 2+maxHeaderLength to end)
    const bodyStartIdx = headerEndIdx;
    const bodyBytes = new Uint8Array(maxBodyLength);
    for (let i = 0; i < maxBodyLength; i++) {
      bodyBytes[i] = hexFieldToByte(proof.publicInputs[bodyStartIdx + i]);
    }

    // Convert to strings (null bytes 0x00 represent masked characters)
    const decoder = new TextDecoder("utf-8", { fatal: false });

    // Trim SHA-256 padding and trailing zeros from header and body
    // The circuit includes SHA-256 padding for DKIM verification:
    // - Original content
    // - 0x80 byte (padding start marker)
    // - Zero bytes
    // - 64-bit message length
    // We need to find and remove this padding to show only the actual email content
    const trimSha256Padding = (bytes: Uint8Array): Uint8Array => {
      // First, trim trailing zeros from circuit padding
      let end = bytes.length;
      while (end > 0 && bytes[end - 1] === 0) {
        end--;
      }

      // Now look for SHA-256 padding pattern:
      // The padding ends with a 64-bit (8 byte) length field
      // Before that are zeros, and before those is the 0x80 marker
      // We need to find the 0x80 byte that starts the SHA-256 padding

      // Look backwards from current end for the 0x80 padding marker
      // It should be followed by zeros (and possibly length bytes we already trimmed)
      let sha256PaddingStart = -1;
      for (let i = end - 1; i >= 0 && i >= end - 72; i--) {
        // SHA-256 padding can be at most 64+8=72 bytes
        if (bytes[i] === 0x80) {
          // Check if everything after this (up to where we trimmed) looks like padding
          // (should be zeros or the length bytes)
          let looksLikePadding = true;
          for (let j = i + 1; j < end; j++) {
            // After 0x80, we expect zeros, or non-zero bytes could be the length field
            // The length field is at the very end, so if we see non-zero,
            // it should be within the last 8 bytes
            if (bytes[j] !== 0 && j < end - 8) {
              looksLikePadding = false;
              break;
            }
          }
          if (looksLikePadding) {
            sha256PaddingStart = i;
            break;
          }
        }
      }

      if (sha256PaddingStart >= 0) {
        end = sha256PaddingStart;
      }

      return bytes.slice(0, end);
    };

    const trimmedHeaderBytes = trimSha256Padding(headerBytes);
    const trimmedBodyBytes = trimSha256Padding(bodyBytes);

    const maskedHeader = decoder.decode(trimmedHeaderBytes);
    const maskedBody = decoder.decode(trimmedBodyBytes);

    return {
      maskedHeader,
      maskedBody,
      publicKeyHash,
      emailNullifier,
    };
  } catch (e) {
    console.error("Error extracting masked data from proof:", e);
    return null;
  }
}
