"use client";

import { useState, useCallback } from "react";
import Header from "./components/Header";
import EmailCard from "./components/EmailCard";
import ActionBar from "./components/ActionBar";
import UploadModal from "./components/UploadModal";
import VerificationUrlModal from "./components/VerificationUrlModal";
import { type ParsedEmail } from "./utils/emlParser";
import { handleGenerateProof, extractMaskedDataFromProof } from "./lib";
import { uploadEmlToGCS, generateUuid } from "./utils/gcsUpload";
import { createVerificationUrl } from "./utils/urlEncoder";
import type { ProofData } from "@aztec/bb.js";

interface EmailState {
  from: string;
  to: string;
  time: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  originalEml?: string; // Store original EML file content
}

export default function Home() {
  const [maskedFields, setMaskedFields] = useState<Set<string>>(new Set());
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [email, setEmail] = useState<EmailState>({
    from: "",
    to: "",
    time: "",
    subject: "",
    bodyText: "",
    bodyHtml: undefined,
  });
  const [headerMask, setHeaderMask] = useState<number[]>([]);
  const [bodyMask, setBodyMask] = useState<number[]>([]);

  // Undo/redo state
  const [undoRedoHandlers, setUndoRedoHandlers] = useState<{
    undo: () => void;
    redo: () => void;
  } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isGeneratingProof, setIsGeneratingProof] = useState(false);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);

  const handleToggleMask = (field: string) => {
    const newMaskedFields = new Set(maskedFields);
    if (newMaskedFields.has(field)) {
      newMaskedFields.delete(field);
    } else {
      newMaskedFields.add(field);
    }
    setMaskedFields(newMaskedFields);
  };

  const handleEmailParsed = (parsedEmail: ParsedEmail, originalEml: string) => {
    setEmail({
      from: parsedEmail.from || "Unknown",
      to: parsedEmail.to || "Unknown",
      time: parsedEmail.time || new Date().toLocaleString(),
      subject: parsedEmail.subject || "(No Subject)",
      bodyText: parsedEmail.bodyText || parsedEmail.body || "",
      bodyHtml: parsedEmail.bodyHtml,
      originalEml, // Store original EML content
    });
    // Reset masked fields when new email is loaded
    setMaskedFields(new Set());
  };

  const handleResetChanges = () => {
    // Reset masked fields state
    setMaskedFields(new Set());
    // Trigger reset in EmailCard by incrementing resetTrigger
    setResetTrigger((prev) => prev + 1);
  };

  const handleUndoRedoHandlersReady = useCallback(
    (handlers: { undo: () => void; redo: () => void }) => {
      setUndoRedoHandlers(handlers);
    },
    []
  );

  const handleUndoRedoStateChange = useCallback(
    (canUndoValue: boolean, canRedoValue: boolean) => {
      setCanUndo(canUndoValue);
      setCanRedo(canRedoValue);
    },
    []
  );

  const handleMaskChange = useCallback(
    (headerMaskValue: number[], bodyMaskValue: number[]) => {
      setHeaderMask(headerMaskValue);
      setBodyMask(bodyMaskValue);
    },
    []
  );

  const handleVerify = async () => {
    if (!email.originalEml) return;
    
    setIsGeneratingProof(true);
    setVerificationUrl(null);
    try {
      console.log("email.bodyText", email, headerMask, bodyMask);
      const proof = await handleGenerateProof(email.originalEml, headerMask, bodyMask) as ProofData | undefined;
      
      // Log original proof structure for comparison
      if (proof) {
        console.log("✨ [GENERATE] Proof generated successfully");
        console.log("✨ [GENERATE] publicInputs count:", proof.publicInputs?.length);
        if (proof.publicInputs && proof.publicInputs.length > 0) {
          const firstOriginal = proof.publicInputs[0] as unknown;
          console.log("✨ [GENERATE] First publicInput type:", typeof firstOriginal);
          console.log("✨ [GENERATE] First publicInput instanceof Uint8Array:", firstOriginal instanceof Uint8Array);
          if (firstOriginal instanceof Uint8Array) {
            console.log("✨ [GENERATE] First publicInput length:", firstOriginal.length);
            console.log("✨ [GENERATE] First publicInput bytes (first 10):", Array.from(firstOriginal).slice(0, 10));
          }
        }
        
        // Extract masked email from proof
        const maskedData = extractMaskedDataFromProof(proof);
        if (maskedData) {
          console.log("=== Masked Email from Proof ===");
          console.log("Masked Header:", maskedData.maskedHeader);
          console.log("Masked Body:", maskedData.maskedBody);
          console.log("Public Key Hash:", Array.from(maskedData.publicKeyHash));
          console.log("Email Nullifier:", Array.from(maskedData.emailNullifier));
          
          // You can use maskedData.maskedHeader and maskedData.maskedBody here
          // Note: Masked positions will show as null bytes (0x00) or placeholders
        } else {
          console.warn("Could not extract masked data from proof");
        }
        
        // Calculate approximate size
        const publicInputsSize = proof.publicInputs?.reduce((sum: number, arr: unknown) => {
          const length = arr instanceof Uint8Array ? arr.length : Array.isArray(arr) ? arr.length : 0;
          return sum + length;
        }, 0) || 0;
        const proofSize = proof.proof?.length || 0;
        const totalSize = publicInputsSize + proofSize;

        console.log("Total binary size (bytes):", totalSize);
        console.log("Estimated base64 size:", Math.ceil(totalSize * 4 / 3));
        console.log("Estimated URL size (with encoding):", Math.ceil(totalSize * 4 / 3 * 1.37)); // base64 + URL encoding overhead
      }
      
      // Upload EML file and proof to Google Cloud Storage after proof is generated
      if (proof) {
        try {
          // Step 1: Generate a UUID for this email/proof pair
          const uuid = await generateUuid();
          console.log("Generated UUID:", uuid);
          
          // Step 2: Upload EML file to GCS using the UUID
          const { publicUrl } = await uploadEmlToGCS(email.originalEml, uuid);
          console.log("EML file uploaded successfully:", publicUrl);
          
          // Step 3: Generate shareable verification URL (stores proof on server, returns short URL)
          const shareableUrl = await createVerificationUrl(proof, uuid, headerMask, bodyMask);
          setVerificationUrl(shareableUrl);
          
          // Copy to clipboard
          try {
            await navigator.clipboard.writeText(shareableUrl);
            console.log("Verification URL copied to clipboard");
          } catch (clipboardError) {
            console.warn("Failed to copy to clipboard:", clipboardError);
          }
        } catch (uploadError) {
          console.error("Error uploading files to GCS:", uploadError);
          // Don't fail the entire operation if upload fails
        }
      }
    } catch (error) {
      console.error("Error generating proof:", error);
    } finally {
      setIsGeneratingProof(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F3EF] relative px-0 md:px-4 lg:px-6">
      <Header
        onChangeEmail={() => setIsUploadModalOpen(true)}
        onResetChanges={handleResetChanges}
      />

      <main className="pt-20 md:pt-16 lg:pt-20 px-6 md:px-0">
        <EmailCard
          key={`${email.from}-${email.to}-${email.time}-${email.subject}-${email.bodyText}`}
          title="Masked Mail"
          email={email}
          isMasked={true}
          onToggleMask={handleToggleMask}
          resetTrigger={resetTrigger}
          maskedFields={maskedFields}
          onUndoRedoHandlersReady={handleUndoRedoHandlersReady}
          onUndoRedoStateChange={handleUndoRedoStateChange}
          onMaskChange={handleMaskChange}
        />
      </main>

      <ActionBar
        onUndo={undoRedoHandlers?.undo}
        onRedo={undoRedoHandlers?.redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onVerify={handleVerify}
        isGeneratingProof={isGeneratingProof}
      />

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onEmailParsed={handleEmailParsed}
      />

      <VerificationUrlModal
        isOpen={verificationUrl !== null}
        onClose={() => setVerificationUrl(null)}
        verificationUrl={verificationUrl || ""}
      />
    </div>
  );
}
