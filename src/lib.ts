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
 * @param headerMask - Array of 0s and 1s indicating which header bytes to mask (1 = mask, 0 = reveal)
 * @param bodyMask - Array of 0s and 1s indicating which body bytes to mask (1 = mask, 0 = reveal)
 * @returns ProofData containing the proof and public inputs, or null if generation failed
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

    // Pad arrays with 0s if they're shorter than required lengths, or slice if longer
    const paddedHeaderMask = headerMask.length < circuitConfig.maxHeaderLength
      ? [...headerMask, ...new Array(circuitConfig.maxHeaderLength - headerMask.length).fill(0)]
      : headerMask.slice(0, circuitConfig.maxHeaderLength);
    const paddedBodyMask = bodyMask.length < circuitConfig.maxBodyLength
      ? [...bodyMask, ...new Array(circuitConfig.maxBodyLength - bodyMask.length).fill(0)]
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
    // Determine header and body sizes from proof metadata or use defaults
    const proofWithMeta = proof as ProofDataWithMetadata;
    const maxHeaderLength = proofWithMeta.__maxHeaderLength || 512;
    const maxBodyLength = proofWithMeta.__maxBodyLength || 1024;
    
    // Based on the circuit, publicInputs should contain:
    // [0]: Field element (Pedersen hash of DKIM pubkey) - 32 bytes
    // [1]: Field element (email nullifier) - 32 bytes  
    // [2]: Masked header - variable size based on circuit
    // [3]: Masked body - variable size based on circuit
    
    if (!proof.publicInputs || proof.publicInputs.length < 4) {
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
    let maskedHeaderBytes = toUint8Array(maskedHeaderBytesRaw);
    let maskedBodyBytes = toUint8Array(maskedBodyBytesRaw);
    
    // Trim to expected lengths if needed
    if (maskedHeaderBytes.length > maxHeaderLength) {
      maskedHeaderBytes = maskedHeaderBytes.slice(0, maxHeaderLength);
    }
    if (maskedBodyBytes.length > maxBodyLength) {
      maskedBodyBytes = maskedBodyBytes.slice(0, maxBodyLength);
    }

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
