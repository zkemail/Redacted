"use client";

import { useState, useCallback, useEffect } from "react";
import Header from "./components/AppHeader";
import EmailCard from "./components/EmailCard";
import ActionBar from "./components/ActionBar";
import UploadModal from "./components/UploadModal";
import VerificationUrlModal from "./components/VerificationUrlModal";
import { type ParsedEmail } from "./utils/emlParser";
import { handleGenerateProof } from "./lib";
import { generateUuid } from "./utils/gcsUpload";
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

export default function MainApp() {
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
  const [parsedEmail, setParsedEmail] = useState<ParsedEmail | null>(null);
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
    setParsedEmail(parsedEmail);
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
      const proof = await handleGenerateProof(email.originalEml, headerMask, bodyMask) as ProofData | undefined;
      
      // Proof generated successfully
      if (!proof) {
        throw new Error("Proof generation failed");
      }
      
      // Upload proof to Google Cloud Storage after proof is generated
      // Note: EML upload removed - verification now uses proof outputs directly
      if (proof) {
        try {
          // Step 1: Generate a UUID for this proof
          const uuid = await generateUuid();

          // Step 2: Generate shareable verification URL (stores proof on server, returns short URL)
          const shareableUrl = await createVerificationUrl(proof, uuid, headerMask, bodyMask);
          setVerificationUrl(shareableUrl);

          // Copy to clipboard
          try {
            await navigator.clipboard.writeText(shareableUrl);
          } catch (clipboardError) {
            console.warn("Failed to copy to clipboard:", clipboardError);
          }
        } catch (uploadError) {
          console.error("Error uploading proof to GCS:", uploadError);
          // Don't fail the entire operation if upload fails
        }
      }
    } catch (error) {
      console.error("Error generating proof:", error);
    } finally {
      setIsGeneratingProof(false);
    }
  };

  useEffect(() => {
    setIsUploadModalOpen(true)
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F3EF] relative px-0 md:px-4 lg:px-6">
      <Header
        onChangeEmail={() => setIsUploadModalOpen(true)}
        onResetChanges={handleResetChanges}
      />

      <main className="pt-20 md:pt-16 lg:pt-20 px-6 md:px-0">
        <EmailCard
          key={`${email.from}-${email.to}-${email.time}-${email.subject}-${email.bodyText}`}
          email={{
            ...email,
            ranges: parsedEmail?.ranges ? {
              from: parsedEmail.ranges.from ? {
                rawStart: parsedEmail.ranges.from.rawStart,
                displayOffset: parsedEmail.ranges.from.displayOffset,
                displayLength: parsedEmail.ranges.from.displayLength,
              } : undefined,
              to: parsedEmail.ranges.to ? {
                rawStart: parsedEmail.ranges.to.rawStart,
                displayOffset: parsedEmail.ranges.to.displayOffset,
                displayLength: parsedEmail.ranges.to.displayLength,
              } : undefined,
              time: parsedEmail.ranges.time ? {
                rawStart: parsedEmail.ranges.time.rawStart,
                displayOffset: parsedEmail.ranges.time.displayOffset,
                displayLength: parsedEmail.ranges.time.displayLength,
              } : undefined,
              subject: parsedEmail.ranges.subject ? {
                rawStart: parsedEmail.ranges.subject.rawStart,
                displayOffset: parsedEmail.ranges.subject.displayOffset,
                displayLength: parsedEmail.ranges.subject.displayLength,
              } : undefined,
            } : undefined,
          }}
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
