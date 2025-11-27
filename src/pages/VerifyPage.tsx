"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { handleVerifyProof } from "../lib";
import { fetchProofData } from "../utils/urlEncoder";
import { parseEmlFile } from "../utils/emlParser";
import type { ParsedEmail } from "../utils/emlParser";
import EmailCard from "../components/EmailCard";
import ActionBar from "../components/ActionBar";
import WhistleblowerLogo from "../assets/WhistleblowerLogo.svg";

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
  const [proof, setProof] = useState<{
    publicInputs: string[];
    proof: Uint8Array;
  } | null>(null);
  const [headerMask, setHeaderMask] = useState<number[]>([]);
  const [bodyMask, setBodyMask] = useState<number[]>([]);

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
        const { proof: decodedProof, emlUrl, headerMask: fetchedHeaderMask, bodyMask: fetchedBodyMask } = await fetchProofData(uuid);
        
        if (!decodedProof || !emlUrl) {
          setError("Failed to load data. The proof may have expired or been deleted.");
          setIsLoading(false);
          return;
        }

        // Validate proof structure before setting
        if (!decodedProof.publicInputs || !Array.isArray(decodedProof.publicInputs)) {
          throw new Error('Invalid proof: publicInputs is not an array');
        }
        if (!decodedProof.proof || !(decodedProof.proof instanceof Uint8Array)) {
          throw new Error('Invalid proof: proof is not a Uint8Array');
        }
        
        setProof(decodedProof);
        // Store mask information for displaying redacted content
        setHeaderMask(fetchedHeaderMask || []);
        setBodyMask(fetchedBodyMask || []);

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
        {/* Simplified Header - no buttons */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex flex-row items-center justify-between px-6 pt-6 py-4 md:py-2 bg-[#F5F3EF]">
          <div className="bg-[#EAEAEA] flex flex-row gap-2 px-4 py-2 items-center">
            <img
              src={WhistleblowerLogo}
              height={16}
              width={104}
              alt="Whistleblow Logo"
            />
          </div>
        </div>
        <div className="hidden md:block">
          <div className="bg-[#EAEAEA] fixed top-6 left-6 z-50 flex flex-row gap-4 px-4 py-2 items-center">
            <div>
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
        {/* Simplified Header - no buttons */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex flex-row items-center justify-between px-6 pt-6 py-4 md:py-2 bg-[#F5F3EF]">
          <div className="bg-[#EAEAEA] flex flex-row gap-2 px-4 py-2 items-center">
            <img
              src={WhistleblowerLogo}
              height={16}
              width={104}
              alt="Whistleblow Logo"
            />
          </div>
        </div>
        <div className="hidden md:block">
          <div className="bg-[#EAEAEA] fixed top-6 left-6 z-50 flex flex-row gap-4 px-4 py-2 items-center">
            <div>
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
        <main className="pt-20 md:pt-16 lg:pt-20 px-6 md:px-0">
          <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-8 text-center">
            <p className="text-[#666]">No email data available</p>
          </div>
        </main>
      </div>
    );
  }

  // Map headerMask and bodyMask to individual field mask bits
  const mapMasksToFields = (): {
    fromMaskBits: number[];
    toMaskBits: number[];
    timeMaskBits: number[];
    subjectMaskBits: number[];
    bodyMaskBits: number[];
  } => {
    const fromMaskBits = new Array(email.from.length).fill(0);
    const toMaskBits = new Array(email.to.length).fill(0);
    const timeMaskBits = new Array(email.time.length).fill(0);
    const subjectMaskBits = new Array(email.subject.length).fill(0);
    const bodyMaskBits = new Array((email.bodyText || email.body || "").length).fill(0);
    
    if (!email.raw || (!headerMask.length && !bodyMask.length)) {
      console.log("🔍 [MASK MAPPING] No masks or raw email available");
      return { fromMaskBits, toMaskBits, timeMaskBits, subjectMaskBits, bodyMaskBits };
    }
    
    // Find where header section ends (where body starts)
    const bodySeparator = email.raw.indexOf('\r\n\r\n');
    let headerEndIndex = -1;
    if (bodySeparator >= 0) {
      headerEndIndex = bodySeparator + 4;
    } else {
      const newlineSeparator = email.raw.indexOf('\n\n');
      if (newlineSeparator >= 0) {
        headerEndIndex = newlineSeparator + 2;
      }
    }
    
    
    // Map header mask to individual fields using ranges
    // headerMask is indexed from 0 (start of header) and is padded to 512 bytes
    // rawStart is the absolute position in the raw EML file
    // We need to map: rawStart -> position in headerMask array (0-511)
    if (email.ranges && headerMask.length > 0 && headerEndIndex > 0) {
      // From field
      if (email.ranges.from) {
        const rawStart = email.ranges.from.rawStart;
        const displayOffset = email.ranges.from.displayOffset || 0;
        
        // rawStart is the absolute position in the raw EML file (after "From: ")
        // displayOffset is the number of leading whitespace characters
        // The actual field value (without leading whitespace) starts at rawStart + displayOffset
        // headerMask[rawStart + displayOffset] corresponds to the first character of the display value
        const actualFieldStart = rawStart + displayOffset;
        
        // Get the mask slice for the entire field value
        const headerMaskSlice = headerMask.slice(actualFieldStart, actualFieldStart + email.from.length);
        
        console.log("🔍 [MASK MAPPING] From field:", {
          actualFieldStart,
          fromValue: email.from,
          headerMaskSliceSum: headerMaskSlice.reduce((a, b) => a + b, 0),
          expectedSum: email.from.length,
        });
        
        // Map from headerMask to the entire field value
        // headerMask[actualFieldStart + i] corresponds to email.from[i]
        let mappedCount = 0;
        for (let i = 0; i < email.from.length && i < fromMaskBits.length; i++) {
          const maskIndex = actualFieldStart + i;
          if (maskIndex >= 0 && maskIndex < headerMask.length) {
            fromMaskBits[i] = headerMask[maskIndex] || 0;
            if (headerMask[maskIndex] === 1) mappedCount++;
          } else {
            fromMaskBits[i] = 0;
          }
        }
        console.log("🔍 [MASK MAPPING] From result:", {
          mapped: `${mappedCount}/${email.from.length}`,
          maskBits: Array.from(fromMaskBits),
        });
      }
      
      // To field
      if (email.ranges.to) {
        const rawStart = email.ranges.to.rawStart;
        const displayOffset = email.ranges.to.displayOffset || 0;
        const actualFieldStart = rawStart + displayOffset;
        const headerMaskSlice = headerMask.slice(actualFieldStart, actualFieldStart + email.to.length);
        
        console.log("🔍 [MASK MAPPING] To field:", {
          actualFieldStart,
          toValue: email.to,
          headerMaskSliceSum: headerMaskSlice.reduce((a, b) => a + b, 0),
          expectedSum: email.to.length,
        });
        
        // Map the entire field value
        // headerMask[actualFieldStart + i] corresponds to email.to[i]
        let mappedCount = 0;
        for (let i = 0; i < email.to.length && i < toMaskBits.length; i++) {
          const maskIndex = actualFieldStart + i;
          if (maskIndex >= 0 && maskIndex < headerMask.length) {
            toMaskBits[i] = headerMask[maskIndex] || 0;
            if (headerMask[maskIndex] === 1) mappedCount++;
          } else {
            toMaskBits[i] = 0;
          }
        }
        console.log("🔍 [MASK MAPPING] To result:", {
          mapped: `${mappedCount}/${email.to.length}`,
          maskBits: Array.from(toMaskBits),
        });
      }
      
      // Time field
      if (email.ranges.time) {
        const rawStart = email.ranges.time.rawStart;
        const displayOffset = email.ranges.time.displayOffset || 0;
        
        // Map the entire field value
        for (let i = 0; i < email.time.length && i < timeMaskBits.length; i++) {
          const maskIndex = rawStart + displayOffset + i;
          if (maskIndex >= 0 && maskIndex < headerMask.length) {
            timeMaskBits[i] = headerMask[maskIndex] || 0;
          } else {
            timeMaskBits[i] = 0;
          }
        }
      }
      
      // Subject field
      if (email.ranges.subject) {
        const rawStart = email.ranges.subject.rawStart;
        const displayOffset = email.ranges.subject.displayOffset || 0;
        
        // Map the entire field value
        for (let i = 0; i < email.subject.length && i < subjectMaskBits.length; i++) {
          const maskIndex = rawStart + displayOffset + i;
          if (maskIndex >= 0 && maskIndex < headerMask.length) {
            subjectMaskBits[i] = headerMask[maskIndex] || 0;
          } else {
            subjectMaskBits[i] = 0;
          }
        }
      }
    }
    
    // Map body mask
    // bodyMask is relative to body start, and bodyMaskBits should map directly
    if (email.ranges && email.ranges.body && bodyMask.length > 0) {
      // bodyMask is already relative to body start, so map directly
      for (let i = 0; i < Math.min(bodyMaskBits.length, bodyMask.length); i++) {
        bodyMaskBits[i] = bodyMask[i] || 0;
      }
    }
    
    return { fromMaskBits, toMaskBits, timeMaskBits, subjectMaskBits, bodyMaskBits };
  };
  
  const { fromMaskBits, toMaskBits, timeMaskBits, subjectMaskBits, bodyMaskBits } = mapMasksToFields();

  return (
    <div className="min-h-screen bg-[#F5F3EF] relative px-0 md:px-4 lg:px-6">
      {/* Simplified Header - no buttons */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex flex-row items-center justify-between px-6 pt-6 py-4 md:py-2 bg-[#F5F3EF]">
        <div className="bg-[#EAEAEA] flex flex-row gap-2 px-4 py-2 items-center">
          <img
            src={WhistleblowerLogo}
            height={16}
            width={104}
            alt="Whistleblow Logo"
          />
        </div>
      </div>
      <div className="hidden md:block">
        <div className="bg-[#EAEAEA] fixed top-6 left-6 z-50 flex flex-row gap-4 px-4 py-2 items-center">
          <div>
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

          {/* Email Card - Show redacted content using masks from proof */}
          <EmailCard
            email={{
              from: email.from || "Unknown",
              to: email.to || "Unknown",
              time: email.time || "",
              subject: email.subject || "(No Subject)",
              bodyText: email.bodyText || email.body || "",
              bodyHtml: email.bodyHtml,
              originalEml: email.raw,
            }}
            onToggleMask={undefined}
            resetTrigger={0}
            maskedFields={new Set()}
            onUndoRedoHandlersReady={() => {}}
            onUndoRedoStateChange={() => {}}
            onMaskChange={() => {}}
            disableSelectionMasking={true}
            useBlackMask={true}
            initialMaskBits={{
              fromMaskBits,
              toMaskBits,
              timeMaskBits,
              subjectMaskBits,
              bodyMaskBits,
            }}
          />
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
