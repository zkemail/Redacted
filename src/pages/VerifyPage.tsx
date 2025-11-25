"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { handleVerifyProof } from "../lib";
import { fetchProofData } from "../utils/urlEncoder";
import { parseEmlFile } from "../utils/emlParser";
import type { ParsedEmail } from "../utils/emlParser";
import EmailCard from "../components/EmailCard";
import Header from "../components/Header";

export default function VerifyPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState<ParsedEmail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<{
    verified: boolean;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<any>(null);

  useEffect(() => {
    const loadVerificationData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get UUID from URL
        const uuid = searchParams.get('id');
        
        if (!uuid) {
          setError("Invalid verification URL. Missing UUID.");
          setIsLoading(false);
          return;
        }

        // Fetch all data (proof, EML URL, masks) from server using UUID
        const { proof: decodedProof, emlUrl, headerMask: decodedHeaderMask, bodyMask: decodedBodyMask } = await fetchProofData(uuid);
        
        if (!decodedProof || !emlUrl) {
          setError("Failed to load data. The proof may have expired or been deleted.");
          setIsLoading(false);
          return;
        }

        // Validate proof structure before setting
        console.log("=== Proof Validation ===");
        console.log("decodedProof:", decodedProof);
        console.log("decodedProof.publicInputs:", decodedProof.publicInputs);
        console.log("decodedProof.publicInputs length:", decodedProof.publicInputs?.length);
        console.log("decodedProof.publicInputs types:", decodedProof.publicInputs?.map((arr: any) => {
          if (arr instanceof Uint8Array) return 'Uint8Array';
          if (Array.isArray(arr)) return 'Array';
          return typeof arr;
        }));
        console.log("decodedProof.proof type:", decodedProof.proof instanceof Uint8Array ? 'Uint8Array' : typeof decodedProof.proof);
        
        if (!decodedProof.publicInputs || !Array.isArray(decodedProof.publicInputs)) {
          throw new Error('Invalid proof: publicInputs is not an array');
        }
        if (!decodedProof.proof || !(decodedProof.proof instanceof Uint8Array)) {
          throw new Error('Invalid proof: proof is not a Uint8Array');
        }
        
        setProof(decodedProof);
        // Store mask information for displaying redacted content
        // We'll use this to show what was redacted

        // Fetch the EML file using the URL from the server
        const response = await fetch(emlUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch EML file: ${response.statusText}`);
        }

        const emlContent = await response.text();
        
        // Parse the EML file
        const parsedEmail = await parseEmlFile(emlContent);
        setEmail(parsedEmail);
      } catch (err) {
        console.error("Error loading verification data:", err);
        setError(err instanceof Error ? err.message : "Failed to load verification data");
      } finally {
        setIsLoading(false);
      }
    };

    loadVerificationData();
  }, [searchParams]);

  const handleVerify = async () => {
    if (!proof) {
      setError("Proof data is missing");
      return;
    }

      // Final validation before verification
      console.log("=== Final Proof Validation Before Verification ===");
      if (!proof.publicInputs || !Array.isArray(proof.publicInputs)) {
        throw new Error('Invalid proof: publicInputs is not an array');
      }
      if (!proof.proof || !(proof.proof instanceof Uint8Array)) {
        throw new Error('Invalid proof: proof is not a Uint8Array');
      }

    // IMPORTANT: publicInputs should be STRINGS (hex strings), not Uint8Arrays
    // The library expects strings, so validate they are strings
    proof.publicInputs.forEach((arr: unknown, idx: number) => {
      if (typeof arr !== 'string') {
        throw new Error(`Invalid proof: publicInputs[${idx}] is not a string (got ${typeof arr})`);
      }
      // Validate it's a valid hex string (starts with 0x)
      if (!arr.startsWith('0x')) {
        throw new Error(`Invalid proof: publicInputs[${idx}] is not a valid hex string (should start with 0x)`);
      }
      // Validate hex string length (should be at least 2 chars: 0x, and even number of hex digits)
      if (arr.length < 2 || (arr.length - 2) % 2 !== 0) {
        throw new Error(`Invalid proof: publicInputs[${idx}] has invalid length (got ${arr.length}, should be 0x + even number of hex digits)`);
      }
    });

      // Validate proof array
      for (let i = 0; i < proof.proof.length; i++) {
        if (isNaN(proof.proof[i]) || proof.proof[i] < 0 || proof.proof[i] > 255) {
          throw new Error(`Invalid byte value at proof[${i}]: ${proof.proof[i]}`);
        }
      }

      console.log("✅ Proof validation passed. publicInputs are strings (correct format).");

    setIsVerifying(true);
    setVerificationStatus(null);
    
    try {
      const isValid = await handleVerifyProof(proof);
      
      setVerificationStatus({
        verified: isValid,
        message: isValid
          ? "✓ Proof verified successfully! The email content is authentic."
          : "✗ Proof verification failed. The email content may have been tampered with.",
      });
    } catch (err) {
      console.error("Error verifying proof:", err);
      setVerificationStatus({
        verified: false,
        message: `Verification error: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F3EF] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#111314] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#111314]">Loading verification data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F3EF] relative px-0 md:px-4 lg:px-6">
        <Header onChangeEmail={() => window.location.href = '/'} />
        <main className="pt-20 md:pt-16 lg:pt-20 px-6 md:px-0">
          <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-8 text-center">
            <div className="text-red-600 text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-semibold text-[#111314] mb-2">Verification Error</h1>
            <p className="text-[#666] mb-6">{error}</p>
            <button
              onClick={() => window.location.href = '/'}
              className="px-6 py-2 bg-[#111314] text-white rounded hover:opacity-90"
            >
              Go to Home
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="min-h-screen bg-[#F5F3EF] relative px-0 md:px-4 lg:px-6">
        <Header onChangeEmail={() => window.location.href = '/'} />
        <main className="pt-20 md:pt-16 lg:pt-20 px-6 md:px-0">
          <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-8 text-center">
            <p className="text-[#666]">No email data available</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F3EF] relative px-0 md:px-4 lg:px-6">
      <Header onChangeEmail={() => window.location.href = '/'} />
      
      <main className="pt-20 md:pt-16 lg:pt-20 px-6 md:px-0">
        <div className="max-w-4xl mx-auto">
          {/* Verification Status Banner */}
          {verificationStatus && (
            <div
              className={`mb-6 p-4 rounded-lg ${
                verificationStatus.verified
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              <p
                className={`text-center font-medium ${
                  verificationStatus.verified ? "text-green-800" : "text-red-800"
                }`}
              >
                {verificationStatus.message}
              </p>
            </div>
          )}

          {/* Email Card - Show redacted content */}
          <EmailCard
            title="Redacted Email"
            email={{
              from: email.from || "Unknown",
              to: email.to || "Unknown",
              time: email.time || "",
              subject: email.subject || "(No Subject)",
              bodyText: email.bodyText || email.body || "",
              bodyHtml: email.bodyHtml,
              originalEml: email.raw, // Pass original EML for proper masking
            }}
            isMasked={true}
            onToggleMask={() => {}} // Disable toggling on verify page
            resetTrigger={0}
            maskedFields={new Set(['from', 'to', 'time', 'subject', 'body'])} // Show all fields as masked (redacted)
            onUndoRedoHandlersReady={() => {}}
            onUndoRedoStateChange={() => {}}
            onMaskChange={() => {}}
          />

          {/* Verify Button */}
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleVerify}
              disabled={isVerifying || !proof}
              className={`px-8 py-3 rounded-lg font-medium ${
                isVerifying || !proof
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-[#111314] text-white hover:opacity-90"
              }`}
            >
              {isVerifying ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verifying...
                </span>
              ) : (
                "Verify Proof"
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

