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
  console.log("💾 [STORE] Preparing proof for storage");
  console.log("💾 [STORE] publicInputs count:", proof.publicInputs?.length);
  if (proof.publicInputs && proof.publicInputs.length > 0) {
    const firstInput = proof.publicInputs[0];
    console.log("💾 [STORE] First publicInput type:", typeof firstInput);
    console.log("💾 [STORE] First publicInput instanceof Uint8Array:", firstInput instanceof Uint8Array);
    if (typeof firstInput === 'string') {
      console.log("💾 [STORE] First publicInput is string, length:", firstInput.length);
      console.log("💾 [STORE] First publicInput value (first 50 chars):", firstInput.substring(0, 50));
    } else if (firstInput instanceof Uint8Array) {
      console.log("💾 [STORE] First publicInput length:", firstInput.length);
      console.log("💾 [STORE] First publicInput bytes (first 10):", Array.from(firstInput).slice(0, 10));
    }
  }
  
  // IMPORTANT: The library returns publicInputs as STRINGS (hex strings), not Uint8Arrays
  // We need to preserve this format when storing
  const proofForStorage = {
    publicInputs: proof.publicInputs.map((arr: any) => {
      // If it's already a string, keep it as is
      if (typeof arr === 'string') {
        return arr;
      }
      // If it's a Uint8Array, convert to hex string
      if (arr instanceof Uint8Array) {
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
      }
      // If it's an array of numbers, convert to hex string
      if (Array.isArray(arr)) {
        return arr.map((b: any) => {
          const num = typeof b === 'number' ? b : parseInt(b, 10);
          return num.toString(16).padStart(2, '0');
        }).join('');
      }
      // Fallback: convert to string
      return String(arr);
    }),
    proof: (() => {
      // Proof field should be Uint8Array, convert to array of numbers
      if (proof.proof instanceof Uint8Array) {
        return Array.from(proof.proof);
      }
      if (Array.isArray(proof.proof)) {
        return proof.proof.map((v: any) => typeof v === 'number' ? v : parseInt(v, 10));
      }
      throw new Error(`Unexpected proof type: ${typeof proof.proof}`);
    })(),
  };
  
  // Old conversion code removed - we now preserve strings as strings
  const convertToNumberArray = (val: unknown, idx: number): number[] => {
    if (val instanceof Uint8Array) {
      // Convert Uint8Array to array of numbers
      const numbers = Array.from(val);
      // Validate all are numbers
      if (!numbers.every(n => typeof n === 'number' && !isNaN(n) && n >= 0 && n <= 255)) {
        console.error(`Invalid numbers in publicInputs[${idx}]:`, numbers.slice(0, 10));
        throw new Error(`publicInputs[${idx}] contains invalid byte values`);
      }
      return numbers;
    }
    // If it's already an array, validate and convert to numbers
    if (Array.isArray(val)) {
      console.warn(`publicInputs[${idx}] is already an array, not Uint8Array`);
      const numbers = val.map((v: any) => {
        if (typeof v === 'number') {
          if (isNaN(v) || v < 0 || v > 255) {
            throw new Error(`Invalid byte value in publicInputs[${idx}]: ${v}`);
          }
          return v;
        }
        if (typeof v === 'string') {
          const num = parseInt(v, 10);
          if (isNaN(num) || num < 0 || num > 255) {
            throw new Error(`Invalid byte value in publicInputs[${idx}]: ${v}`);
          }
          return num;
        }
        throw new Error(`Invalid value type in publicInputs[${idx}]: ${typeof v}`);
      });
      return numbers;
    }
    // If it's a string, try to parse it
    if (typeof val === 'string') {
      console.warn(`publicInputs[${idx}] is a string, attempting to parse`);
      // Try hex string (0x...)
      if (val.startsWith('0x')) {
        const hexWithoutPrefix = val.substring(2);
        const bytes: number[] = [];
        for (let i = 0; i < hexWithoutPrefix.length; i += 2) {
          const byte = parseInt(hexWithoutPrefix.substr(i, 2), 16);
          if (isNaN(byte) || byte < 0 || byte > 255) {
            throw new Error(`Invalid hex byte in publicInputs[${idx}] at position ${i}`);
          }
          bytes.push(byte);
        }
        return bytes;
      }
      // Try comma-separated numbers
      if (val.includes(',')) {
        const parts = val.split(',').map(s => {
          const num = parseInt(s.trim(), 10);
          if (isNaN(num) || num < 0 || num > 255) {
            throw new Error(`Invalid byte value in publicInputs[${idx}]: ${s.trim()}`);
          }
          return num;
        });
        return parts;
      }
      // Try base64
      try {
        const binary = atob(val);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return Array.from(bytes);
      } catch {
        // If base64 fails, treat as raw string and encode
        const encoder = new TextEncoder();
        const encoded = encoder.encode(val);
        return Array.from(encoded);
      }
    }
    throw new Error(`Unexpected publicInput type at index ${idx}: ${typeof val}`);
  };

  const proofJson = JSON.stringify(proofForStorage);
  console.log("💾 [STORE] Proof JSON size:", proofJson.length, "chars");
  
  const apiUrl = import.meta.env.VITE_GCS_API_URL || 'http://localhost:3001/api';
  
  // Step 1: Get signed URL for proof upload (using the same UUID)
  const urlResponse = await fetch(`${apiUrl}/get-proof-upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      uuid,
      headerMask: headerMask.slice(0, 512),
      bodyMask: bodyMask.slice(0, 1024),
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
  
  console.log("💾 [STORE] Verification URL:", verificationUrl);
  
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
    
    console.log("📥 [FETCH] Retrieved data from server");
    console.log("📥 [FETCH] data.proof.publicInputs is array:", Array.isArray(data.proof.publicInputs));
    console.log("📥 [FETCH] data.proof.publicInputs count:", data.proof.publicInputs?.length);
    if (Array.isArray(data.proof.publicInputs) && data.proof.publicInputs.length > 0) {
      const firstRetrieved = data.proof.publicInputs[0];
      console.log("📥 [FETCH] First publicInput type (raw):", typeof firstRetrieved);
      console.log("📥 [FETCH] First publicInput is array (raw):", Array.isArray(firstRetrieved));
      if (typeof firstRetrieved === 'string') {
        console.log("📥 [FETCH] First publicInput is string (correct!):", firstRetrieved.substring(0, 50));
      } else if (Array.isArray(firstRetrieved)) {
        console.log("📥 [FETCH] First publicInput length (raw):", firstRetrieved.length);
        console.log("📥 [FETCH] First publicInput first 10 values (raw):", firstRetrieved.slice(0, 10));
        // Check if values are numbers or strings
        if (firstRetrieved.length > 0) {
          console.log("📥 [FETCH] First value type:", typeof firstRetrieved[0]);
          console.log("📥 [FETCH] First value:", firstRetrieved[0]);
        }
      }
    }
    
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
          console.log(`📥 [FETCH] publicInputs[${idx}] is string (preserved):`, arr.substring(0, 50));
          return arr;
        }
        // If it's an array of numbers, convert to hex string
        if (Array.isArray(arr)) {
          const hexString = arr.map((b: any) => {
            const num = typeof b === 'number' ? b : parseInt(b, 10);
            return num.toString(16).padStart(2, '0');
          }).join('');
          console.log(`📥 [FETCH] publicInputs[${idx}] converted from array to hex string:`, hexString.substring(0, 50));
          return hexString;
        }
        // If it's a Uint8Array (shouldn't happen, but handle it)
        if (arr instanceof Uint8Array) {
          const hexString = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
          console.log(`📥 [FETCH] publicInputs[${idx}] converted from Uint8Array to hex string:`, hexString.substring(0, 50));
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
    
    console.log("📥 [FETCH] Reconstructed proof");
    console.log("📥 [FETCH] publicInputs count:", proof.publicInputs.length);
    console.log("📥 [FETCH] First publicInput type:", typeof proof.publicInputs[0]);
    if (typeof proof.publicInputs[0] === 'string') {
      console.log("✅ [FETCH] First publicInput is string (correct format):", proof.publicInputs[0].substring(0, 50));
    } else {
      console.error("❌ [FETCH] First publicInput is NOT a string! Type:", typeof proof.publicInputs[0]);
    }
    console.log("📥 [FETCH] proof.proof instanceof Uint8Array:", proof.proof instanceof Uint8Array);
    
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

