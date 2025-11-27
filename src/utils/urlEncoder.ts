import type { ProofData } from "@aztec/bb.js";

/**
 * Stores proof on server (via direct GCS upload) and creates a short verification URL
 */
export async function createVerificationUrl(
  proof: ProofData, 
  uuid: string,
  headerMask: number[],
  bodyMask: number[]
): Promise<string> {
  const normalizePublicInput = (value: unknown): string => {
    if (typeof value === "string") {
      return value;
    }
    if (value instanceof Uint8Array) {
      return Array.from(value)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
    if (Array.isArray(value)) {
      return value
        .map((entry) => {
          const num =
            typeof entry === "number"
              ? entry
              : typeof entry === "string"
                ? parseInt(entry, 10)
                : NaN;
          if (Number.isNaN(num)) {
            throw new Error("Invalid public input entry; expected number-like value");
          }
          return num.toString(16).padStart(2, "0");
        })
        .join("");
    }
    return String(value);
  };

  const normalizeProofBytes = (): number[] => {
    const rawProof: unknown = proof.proof as unknown;
    if (rawProof instanceof Uint8Array) {
      return Array.from(rawProof);
    }
    if (Array.isArray(rawProof)) {
      return rawProof.map((entry) => {
        if (typeof entry === "number") {
          return entry;
        }
        if (typeof entry === "string") {
          const parsed = parseInt(entry, 10);
          if (Number.isNaN(parsed)) {
            throw new Error(`Invalid proof byte value: ${entry}`);
          }
          return parsed;
        }
        throw new Error(`Unexpected proof byte type: ${typeof entry}`);
      });
    }
    throw new Error(`Unexpected proof type: ${typeof rawProof}`);
  };

  const proofForStorage = {
    publicInputs: (proof.publicInputs ?? []).map((input) => normalizePublicInput(input)),
    proof: normalizeProofBytes(),
  };

  const proofJson = JSON.stringify(proofForStorage);
  
  const apiUrl = import.meta.env.VITE_GCS_API_URL || 'http://localhost:3001/api';
  
  // Step 1: Get signed URL for proof upload (using the same UUID)
  const urlResponse = await fetch(`${apiUrl}/get-proof-upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      uuid,
      headerMask: headerMask, // Store full header mask, not truncated
      bodyMask: bodyMask, // Store full body mask, not truncated
    }),
  });

  if (!urlResponse.ok) {
    const errorData = await urlResponse.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to get proof upload URL: ${urlResponse.status}`);
  }

  const { uploadUrl } = await urlResponse.json();

  // Step 2: Upload proof directly to GCS using the signed URL
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: proofJson,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Proof upload failed with status ${uploadResponse.status}`);
  }

  // Step 3: Create short verification URL using the UUID
  const baseUrl = window.location.origin;
  const verificationUrl = `${baseUrl}/verify?id=${uuid}`;
  
  
  return verificationUrl;
}

/**
 * Fetches all data (proof, EML URL, masks) from server using UUID
 */
export async function fetchProofData(uuid: string): Promise<{
  proof: ProofData | null;
  emlUrl: string | null;
  headerMask: number[];
  bodyMask: number[];
}> {
  const apiUrl = import.meta.env.VITE_GCS_API_URL || 'http://localhost:3001/api';
  
  try {
    const response = await fetch(`${apiUrl}/get-data/${uuid}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText}`);
    }

    const data = await response.json();
    
    
    // Helper function to safely convert to Uint8Array (only for proof field)
    const toUint8Array = (val: unknown, context: string = ''): Uint8Array => {
      if (val instanceof Uint8Array) {
        return val;
      }
      if (Array.isArray(val)) {
        const numbers = val.map((v: unknown, idx: number) => {
          if (typeof v === 'number') {
            if (isNaN(v) || v < 0 || v > 255) {
              throw new Error(`Invalid byte value at index ${idx}${context ? ` (${context})` : ''}: ${v}`);
            }
            return v;
          }
          if (typeof v === 'string') {
            const num = parseInt(v, 10);
            if (isNaN(num) || num < 0 || num > 255) {
              throw new Error(`Cannot parse byte value at index ${idx}${context ? ` (${context})` : ''}: ${v}`);
            }
            return num;
          }
          throw new Error(`Invalid value type at index ${idx}${context ? ` (${context})` : ''}: ${typeof v}`);
        });
        return new Uint8Array(numbers);
      }
      if (typeof val === 'string') {
        // If it's a hex string (0x...), parse it
        if (val.startsWith('0x')) {
          const hexWithoutPrefix = val.substring(2);
          const bytes: number[] = [];
          for (let i = 0; i < hexWithoutPrefix.length; i += 2) {
            const byte = parseInt(hexWithoutPrefix.substr(i, 2), 16);
            if (isNaN(byte) || byte < 0 || byte > 255) {
              throw new Error(`Invalid hex byte at position ${i}${context ? ` (${context})` : ''}`);
            }
            bytes.push(byte);
          }
          return new Uint8Array(bytes);
        }
        // Otherwise, treat as comma-separated string
        const parts = val.split(',').map(s => {
          const num = parseInt(s.trim(), 10);
          if (isNaN(num) || num < 0 || num > 255) {
            throw new Error(`Invalid byte value in comma-separated string${context ? ` (${context})` : ''}: ${s.trim()}`);
          }
          return num;
        });
        return new Uint8Array(parts);
      }
      throw new Error(`Cannot convert value to Uint8Array${context ? ` (${context})` : ''}: ${typeof val}`);
    };
    
    // Reconstruct ProofData from stored format
    if (!data.proof || !data.proof.publicInputs || !data.proof.proof) {
      throw new Error('Invalid proof data structure');
    }
    
    // IMPORTANT: publicInputs should be STRINGS (hex strings), not Uint8Arrays
    // The library expects strings, and we stored them as strings
    const proof: ProofData = {
      publicInputs: data.proof.publicInputs.map((arr: unknown, idx: number) => {
        // If it's already a string, keep it as is (this is what the library expects)
        if (typeof arr === 'string') {
          return arr;
        }
        // If it's an array of numbers, convert to hex string
        if (Array.isArray(arr)) {
          const hexString = arr.map((b: any) => {
            const num = typeof b === 'number' ? b : parseInt(b, 10);
            return num.toString(16).padStart(2, '0');
          }).join('');
          return hexString;
        }
        // If it's a Uint8Array (shouldn't happen, but handle it)
        if (arr instanceof Uint8Array) {
          const hexString = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
          return hexString;
        }
        throw new Error(`Unexpected publicInput type at index ${idx}: ${typeof arr}`);
      }),
      proof: (() => {
        // Proof field should be Uint8Array
        const result = toUint8Array(data.proof.proof, 'proof');
        if (!(result instanceof Uint8Array)) {
          throw new Error('Failed to convert proof to Uint8Array');
        }
        return result;
      })(),
    };
    
    
    return {
      proof,
      emlUrl: data.emlUrl,
      headerMask: data.headerMask || [],
      bodyMask: data.bodyMask || [],
    };
  } catch (error) {
    console.error('Error fetching proof data:', error);
    return { proof: null, emlUrl: null, headerMask: [], bodyMask: [] };
  }
}

