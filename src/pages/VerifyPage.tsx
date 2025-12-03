"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { handleVerifyProof, extractMaskedDataFromProof } from "../lib";
import { fetchProofData } from "../utils/urlEncoder";
import { parseMaskedHeader } from "../utils/headerParser";
import MaskedText from "../components/MaskedText";
import ActionBar from "../components/ActionBar";
import WhistleblowerLogo from "../assets/WhistleblowerLogo.svg";

export default function VerifyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<{
    verified: boolean;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<{
    publicInputs: string[];
    proof: Uint8Array;
  } | null>(null);

  // Parsed data from proof outputs
  const [maskedHeader, setMaskedHeader] = useState<{
    from: string;
    to: string;
    subject: string;
    date: string;
  } | null>(null);
  const [maskedBody, setMaskedBody] = useState<string>('');

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

        // Fetch proof data from server using UUID
        const { proof: decodedProof } = await fetchProofData(uuid);

        if (!decodedProof) {
          setError("Failed to load proof data. The proof may have expired or been deleted.");
          setIsLoading(false);
          return;
        }

        // Validate proof structure
        if (!decodedProof.publicInputs || !Array.isArray(decodedProof.publicInputs)) {
          throw new Error('Invalid proof: publicInputs is not an array');
        }
        if (!decodedProof.proof || !(decodedProof.proof instanceof Uint8Array)) {
          throw new Error('Invalid proof: proof is not a Uint8Array');
        }

        setProof(decodedProof);

        // Extract masked data directly from proof outputs
        const maskedData = extractMaskedDataFromProof(decodedProof);

        if (!maskedData) {
          throw new Error('Failed to extract masked data from proof');
        }

        // Parse the masked header into structured fields
        const parsedHeader = parseMaskedHeader(maskedData.maskedHeader);
        setMaskedHeader({
          from: parsedHeader.from,
          to: parsedHeader.to,
          subject: parsedHeader.subject,
          date: parsedHeader.date,
        });

        // Store the masked body
        setMaskedBody(maskedData.maskedBody);

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

    setIsVerifying(true);
    setVerificationStatus(null);

    try {
      const isValid = await handleVerifyProof(proof);

      setVerificationStatus({
        verified: isValid,
        message: isValid
          ? "Proof verified successfully! The email content is authentic."
          : "Proof verification failed. The email content may have been tampered with.",
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

  // Loading state
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

  // Error state
  if (error) {
    return (
      <div className="min-h-screen w-full bg-[#F5F3EF] relative px-0 md:px-4 lg:px-6">
        <Header navigate={navigate} />
        <main className="pt-20 md:pt-16 lg:pt-20 px-6 md:px-0">
          <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-8 text-center">
            <div className="text-red-600 text-6xl mb-4">Warning</div>
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

  // No data state
  if (!maskedHeader) {
    return (
      <div className="min-h-screen bg-[#F5F3EF] relative px-0 md:px-4 lg:px-6">
        <Header navigate={navigate} />
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
      <Header navigate={navigate} />

      <main className="pt-20 md:pt-16 lg:pt-20 px-6 md:px-0">
        <div className="w-full max-w-4xl mx-auto">
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

          {/* Email Display Card - Shows proof outputs with masked content */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {/* Header Section */}
            <div className="p-6 border-b border-gray-100">
              <div className="space-y-3">
                {/* From */}
                <div className="flex">
                  <span className="text-gray-500 w-20 flex-shrink-0">From:</span>
                  <MaskedText text={maskedHeader.from} className="text-[#111314]" />
                </div>

                {/* To */}
                <div className="flex">
                  <span className="text-gray-500 w-20 flex-shrink-0">To:</span>
                  <MaskedText text={maskedHeader.to} className="text-[#111314]" />
                </div>

                {/* Date */}
                <div className="flex">
                  <span className="text-gray-500 w-20 flex-shrink-0">Date:</span>
                  <MaskedText text={maskedHeader.date} className="text-[#111314]" />
                </div>

                {/* Subject */}
                <div className="flex">
                  <span className="text-gray-500 w-20 flex-shrink-0">Subject:</span>
                  <MaskedText text={maskedHeader.subject} className="text-[#111314] font-medium" />
                </div>
              </div>
            </div>

            {/* Body Section */}
            <div className="p-6">
              <div className="prose max-w-none">
                <MaskedText
                  text={maskedBody}
                  className="text-[#111314] whitespace-pre-wrap break-words"
                />
              </div>
            </div>

            {/* Footer - Proof authenticity note */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
              <p className="text-sm text-gray-500 text-center">
                This content is extracted directly from the zero-knowledge proof's public outputs.
                Black blocks indicate redacted information that was masked by the sender.
              </p>
            </div>
          </div>
        </div>
      </main>

      <ActionBar
        onVerifyProof={handleVerify}
        isVerifyingProof={isVerifying}
        showVerifyProof={true}
      />
    </div>
  );
}

// Header component extracted for reuse
function Header({ navigate }: { navigate: (path: string) => void }) {
  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex flex-row items-center justify-between px-6 pt-6 py-4 md:py-2 bg-[#F5F3EF]">
        <div
          className="bg-[#EAEAEA] flex flex-row gap-2 px-4 py-2 items-center cursor-pointer"
          onClick={() => navigate("/")}
        >
          <img
            src={WhistleblowerLogo}
            height={16}
            width={104}
            alt="Whistleblow Logo"
          />
        </div>
      </div>

      {/* Desktop Header */}
      <div className="hidden md:block">
        <div className="bg-[#EAEAEA] fixed top-6 left-6 z-50 flex flex-row gap-4 px-4 py-2 items-center">
          <div
            className="cursor-pointer"
            onClick={() => navigate("/")}
          >
            <img
              src={WhistleblowerLogo}
              height={16}
              width={104}
              alt="Whistleblow Logo"
            />
          </div>
          <div className="w-px h-6 bg-[#D4D4D4]" />
          <div className="text-[#111314]">Verify</div>
        </div>
      </div>
    </>
  );
}
