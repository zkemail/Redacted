"use client";

import { useState } from "react";
import CloseIcon from "../assets/CloseIcon.svg";

interface VerificationUrlModalProps {
  isOpen: boolean;
  onClose: () => void;
  verificationUrl: string;
}

export default function VerificationUrlModal({
  isOpen,
  onClose,
  verificationUrl,
}: VerificationUrlModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(verificationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00000030] bg-opacity-10">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:opacity-70"
        >
          <img src={CloseIcon} alt="Close" width={20} height={20} />
        </button>

        <h2 className="text-2xl font-semibold text-[#111314] mb-4">
          Verification URL Generated
        </h2>

        <p className="text-[#666] mb-4">
          Share this URL to allow others to verify the redacted email content:
        </p>

        <div className="bg-[#F5F3EF] rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={verificationUrl}
              readOnly
              className="flex-1 bg-transparent text-[#111314] text-sm break-all outline-none"
            />
            <button
              onClick={handleCopy}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                copied
                  ? "bg-green-500 text-white"
                  : "bg-[#111314] text-white hover:opacity-90"
              }`}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}


