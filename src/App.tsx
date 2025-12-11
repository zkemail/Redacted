"use client";

import { useState, useCallback, useEffect } from "react";
import Header from "./components/AppHeader";
import EmailCard from "./components/EmailCard";
import ActionBar from "./components/ActionBar";
import UploadModal from "./components/UploadModal";
import VerificationUrlModal from "./components/VerificationUrlModal";
import { type ParsedEmail, type DKIMResult } from "./utils/emlParser";
import { handleGenerateProof, handleVerifyProof as verifyProof } from "./lib";
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
  dkimCanonicalizedHeaders?: string; // DKIM-canonicalized headers for accurate header masking
  dkimCanonicalizedBody?: string; // DKIM-canonicalized body for accurate body masking
  dkimResult?: DKIMResult; // Full DKIM result for reuse during proof generation (Phase 2 optimization)
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
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [generatedProof, setGeneratedProof] = useState<ProofData | null>(null);
  const [isVerifyingProof, setIsVerifyingProof] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<{
    verified: boolean;
    message: string;
  } | null>(null);
  const [hasMaskedContentUI, setHasMaskedContentUI] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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
      dkimCanonicalizedHeaders: parsedEmail.dkimCanonicalizedHeaders, // DKIM-canonicalized headers
      dkimCanonicalizedBody: parsedEmail.dkimCanonicalizedBody, // DKIM-canonicalized body
      dkimResult: parsedEmail.dkimResult, // Full DKIM result for proof generation (Phase 2 optimization)
    });
    // Reset masked fields when new email is loaded
    setMaskedFields(new Set());
    // Reset proof-related state
    setVerificationUrl(null);
    setGeneratedProof(null);
    setVerificationStatus(null);
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

  const handleHasMaskedContentChange = useCallback((hasMasked: boolean) => {
    setHasMaskedContentUI(hasMasked);
  }, []);

  const handleMaskedFieldsSync = useCallback((fields: Set<string>) => {
    setMaskedFields(prev => {
      const isSame = prev.size === fields.size && [...fields].every(f => prev.has(f));
      return isSame ? prev : fields;
    });
  }, []);

  const handleVerify = async () => {
    if (!email.originalEml) return;

    setIsGeneratingProof(true);
    await new Promise(r => setTimeout(r, 0)); // Yield to event loop so React can re-render
    setVerificationUrl(null);
    setGeneratedProof(null);
    setVerificationStatus(null);
    try {
      // Pass existing DKIM result to avoid double verification (Phase 2 optimization)
      const proof = await handleGenerateProof(email.originalEml, headerMask, bodyMask, email.dkimResult) as ProofData;

      // Proof generated successfully (handleGenerateProof throws on error)
      setGeneratedProof(proof);

      // Upload proof to Google Cloud Storage
      try {
        const uuid = await generateUuid();
        const shareableUrl = await createVerificationUrl(proof, uuid, headerMask, bodyMask);
        setVerificationUrl(shareableUrl);
      } catch (uploadError) {
        console.error("Error uploading proof to GCS:", uploadError);
        // Don't fail the entire operation if upload fails
      }
    } catch (error) {
      console.error("Error generating proof:", error);
      // Check for body size limit error
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes("longer than max") || errorMsg.includes("Remaining body")) {
        setToast({
          type: 'error',
          message: 'Email body is too large. This app supports emails up to ~8KB body size.',
        });
      } else if (errorMsg.includes("Unsupported DKIM key size")) {
        setToast({ type: 'error', message: errorMsg });
      } else {
        setToast({ type: 'error', message: 'Failed to generate proof. Please try again.' });
      }
    } finally {
      setIsGeneratingProof(false);
    }
  };

  const handleVerifyProof = async () => {
    if (!generatedProof) {
      setVerificationStatus({
        verified: false,
        message: "No proof available to verify",
      });
      return;
    }

    setIsVerifyingProof(true);
    setVerificationStatus(null);
    
    try {
      const isValid = await verifyProof(generatedProof);
      
      if (isValid) {
        setVerificationStatus({
          verified: true,
          message: "✅ Proof verified successfully! The email content is authentic.",
        });
      } else {
        setVerificationStatus({
          verified: false,
          message: "❌ Proof verification failed. The proof may be invalid or corrupted.",
        });
      }
    } catch (error) {
      console.error("Error verifying proof:", error);
      setVerificationStatus({
        verified: false,
        message: "❌ Error verifying proof. Please try again.",
      });
    } finally {
      setIsVerifyingProof(false);
    }
  };

  useEffect(() => {
    setIsUploadModalOpen(true)
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F3EF] relative px-0 md:px-4 lg:px-6">
      {/* Toast notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100]">
          <div className={`px-3 py-2 rounded-md shadow-md flex items-center gap-2 text-sm ${
            toast.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
          </div>
        </div>
      )}

      <Header
        onChangeEmail={() => setIsUploadModalOpen(true)}
        onResetChanges={handleResetChanges}
        showShareLink={verificationUrl !== null}
        onShareLink={() => setShowVerificationModal(true)}
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
          onHasMaskedContentChange={handleHasMaskedContentChange}
          onMaskedFieldsSync={handleMaskedFieldsSync}
          disableSelectionMasking={verificationUrl !== null}
          useBlackMask={generatedProof !== null}
        />
      </main>

      <ActionBar
        onUndo={undoRedoHandlers?.undo}
        onRedo={undoRedoHandlers?.redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onVerify={handleVerify}
        isGeneratingProof={isGeneratingProof}
        showVerifyProof={verificationUrl !== null}
        onVerifyProof={handleVerifyProof}
        isVerifyingProof={isVerifyingProof}
        proofVerified={verificationStatus?.verified === true}
        hasMaskedContent={hasMaskedContentUI}
      />

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onEmailParsed={handleEmailParsed}
      />

      <VerificationUrlModal
        isOpen={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        verificationUrl={verificationUrl || ""}
      />
    </div>
  );
}
