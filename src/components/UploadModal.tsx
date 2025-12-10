"use client";

import { useCallback, useState } from "react";
import { parseEmlFile, type ParsedEmail } from "../utils/emlParser";
import EMLUploadIcon from "../assets/EMLUploadIcon.svg";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEmailParsed: (email: ParsedEmail, originalEml: string) => void;
}

export default function UploadModal({
  isOpen,
  onClose,
  onEmailParsed,
}: UploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".eml")) {
        setError("Please upload a valid .eml file");
        return;
      }

      setIsProcessing(true);
      setError(null);

      try {
        const text = await file.text();
        const parsedEmail = await parseEmlFile(text);
        onEmailParsed(parsedEmail, text); // Pass original EML content
        onClose();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to parse email file",
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [onEmailParsed, onClose],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(77,77,77,0.61)] backdrop-blur-[1px] px-4">
      <div className="w-full max-w-[480px] rounded-2xl bg-white p-4 md:p-5 shadow-[0_2px_4px_rgba(0,0,0,0.08),0_8px_16px_rgba(0,0,0,0.15)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-[#111314]">
            Upload Email File
          </h2>
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full border border-[#e2e2e2] text-[#9ca3af] transition-colors hover:text-[#111314]"
            disabled={isProcessing}
            aria-label="Close upload modal"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`w-full rounded-2xl border border-dashed bg-[#fdfdfd] px-6 py-12 text-center transition-colors ${
            isDragging
              ? "border-[#206ac2] bg-[#f3f8ff]"
              : "border-[#e2e2e2] hover:border-[#bfcad7]"
          } ${
            isProcessing ? "pointer-events-none opacity-60" : "cursor-pointer"
          }`}
        >
          <input
            type="file"
            accept=".eml"
            onChange={handleFileInput}
            className="hidden"
            id="eml-upload"
            disabled={isProcessing}
          />
          <label htmlFor="eml-upload" className="cursor-pointer">
            <div className="flex flex-col items-center gap-4">
              <img src={EMLUploadIcon} alt="EML" width={64} height={64} />

              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-[#111314]">
                  {isProcessing ? "Processing..." : "Drop your .eml file here"}
                </p>
                <p className="text-sm text-[#A8A8A8]">or click to browse</p>
              </div>
            </div>
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="mt-4 flex items-start justify-center gap-2 text-[12px] font-medium text-[#a8a8a8]">
          <span className="text-[#A8A8A8]">!</span>
          <p>Having trouble getting EML file? Take a look at our guide!</p>
        </div>
      </div>
    </div>
  );
}
