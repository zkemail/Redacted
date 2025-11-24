"use client";

import { useState, useCallback } from "react";
import Header from "./components/AppHeader";
import EmailCard from "./components/EmailCard";
import ActionBar from "./components/ActionBar";
import UploadModal from "./components/UploadModal";
import { type ParsedEmail } from "./utils/emlParser";
import { handleGenerateProof } from "./lib";

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
    try {
      console.log("email.bodyText", email, headerMask, bodyMask);
      await handleGenerateProof(email.originalEml, headerMask, bodyMask);
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
    </div>
  );
}
