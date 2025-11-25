import "./polyfills";
import { UltraHonkBackend, type ProofData } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import initNoirC from "@noir-lang/noirc_abi";
import initACVM from "@noir-lang/acvm_js";
import acvm from "@noir-lang/acvm_js/web/acvm_js_bg.wasm?url";
import noirc from "@noir-lang/noirc_abi/web/noirc_abi_wasm_bg.wasm?url";
// import circuit from "./circuit/target/circuit.json";
import { generateEmailVerifierInputs } from "@zk-email/zkemail-nr";
import circuitEmailMask from "./circuit/target/email_mask.json";

// Initialize WASM modules
await Promise.all([initACVM(fetch(acvm)), initNoirC(fetch(noirc))]);

/**
 * Generate a zero-knowledge proof for email verification
 * 
 * @param email - The original email content (EML format)
 * @param headerMask - Array of 0s and 1s indicating which header bytes to mask (1 = mask, 0 = reveal)
 * @param bodyMask - Array of 0s and 1s indicating which body bytes to mask (1 = mask, 0 = reveal)
 * @returns ProofData containing the proof and public inputs
 * 
 * IMPORTANT: The returned proof does NOT contain the original email.
 * - The proof.proof field contains cryptographic proof bytes (not the email)
 * - The proof.publicInputs contains masked header/body (characters at masked positions are replaced)
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
    const noir = new Noir(circuitEmailMask);
    const backend = new UltraHonkBackend(circuitEmailMask.bytecode);

    const inputParams = {
      maxHeadersLength: 512,
      maxBodyLength: 1024,
    };

    // Pad arrays with 0s if they're shorter than required lengths, or slice if longer
    const paddedHeaderMask = headerMask.length < 512
      ? [...headerMask, ...new Array(512 - headerMask.length).fill(0)]
      : headerMask.slice(0, 512);
    const paddedBodyMask = bodyMask.length < 1024
      ? [...bodyMask, ...new Array(1024 - bodyMask.length).fill(0)]
      : bodyMask.slice(0, 1024);

    console.log("paddedHeaderMask length:", paddedHeaderMask.length, "paddedBodyMask length:", paddedBodyMask.length);

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

    return proof;
  } catch (e) {
    console.error(e);
  }
};

export const handleVerifyProof = async (proof: ProofData) => {
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
    
    const backend = new UltraHonkBackend(circuitEmailMask.bytecode);
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
 * @param headerMask - Array of 0s and 1s indicating which header bytes to mask (1 = mask, 0 = reveal)
 * @param bodyMask - Array of 0s and 1s indicating which body bytes to mask (1 = mask, 0 = reveal)
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
 * To get the original email, you must store it separately (e.g., in GCS).
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
    // Based on the circuit, publicInputs should contain:
    // [0]: Field element (Pedersen hash of DKIM pubkey) - 32 bytes
    // [1]: Field element (email nullifier) - 32 bytes  
    // [2]: Masked header - 512 bytes
    // [3]: Masked body - 1024 bytes
    
    if (!proof.publicInputs || proof.publicInputs.length < 4) {
      console.warn("Unexpected publicInputs structure:", proof.publicInputs);
      return null;
    }

    const publicKeyHashRaw: unknown = proof.publicInputs[0];
    const emailNullifierRaw: unknown = proof.publicInputs[1];
    const maskedHeaderBytesRaw: unknown = proof.publicInputs[2];
    const maskedBodyBytesRaw: unknown = proof.publicInputs[3];

    // Helper to convert to Uint8Array
    const toUint8Array = (val: unknown): Uint8Array => {
      if (val instanceof Uint8Array) return val;
      if (Array.isArray(val)) return new Uint8Array(val);
      if (typeof val === 'string') {
        // If it's a string, try to decode it (though this shouldn't happen)
        return new TextEncoder().encode(val);
      }
      return new Uint8Array(val as ArrayLike<number>);
    };

    const publicKeyHash = toUint8Array(publicKeyHashRaw);
    const emailNullifier = toUint8Array(emailNullifierRaw);
    const maskedHeaderBytes = toUint8Array(maskedHeaderBytesRaw);
    const maskedBodyBytes = toUint8Array(maskedBodyBytesRaw);

    // Convert masked data to strings (masked positions will show as null bytes or placeholders)
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const maskedHeader = decoder.decode(maskedHeaderBytes);
    const maskedBody = decoder.decode(maskedBodyBytes);

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
