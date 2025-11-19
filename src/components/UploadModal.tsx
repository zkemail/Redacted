'use client';

import { useCallback, useState } from 'react';
import { parseEmlFile, type ParsedEmail } from '../utils/emlParser';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEmailParsed: (email: ParsedEmail, originalEml: string) => void;
}

export default function UploadModal({ isOpen, onClose, onEmailParsed }: UploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.eml')) {
      setError('Please upload a valid .eml file');
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
      setError(err instanceof Error ? err.message : 'Failed to parse email file');
    } finally {
      setIsProcessing(false);
    }
  }, [onEmailParsed, onClose]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#141517] border border-[#222325] rounded-3xl p-6 md:p-8 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white text-xl font-bold">Upload Email File</h2>
          <button
            onClick={onClose}
            className="text-[#9ca3af] hover:text-white transition-colors"
            disabled={isProcessing}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
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
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            isDragging
              ? 'border-[#5e6ad2] bg-[#5e6ad2]/10'
              : 'border-[#374151] hover:border-[#5e6ad2]/50'
          } ${isProcessing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
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
              <div className="w-16 h-16 bg-[#5e6ad2]/20 rounded-full flex items-center justify-center">
                <svg width="32" height="32" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M10 2L3 7v11h14V7l-7-5z"
                    stroke="#5e6ad2"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10 8v8M6 12h8"
                    stroke="#5e6ad2"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-white text-base font-medium">
                  {isProcessing ? 'Processing...' : 'Drop your .eml file here'}
                </p>
                <p className="text-[#9ca3af] text-sm">
                  or click to browse
                </p>
              </div>
            </div>
          </label>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-[#374151]" />
          <span className="text-[#9ca3af] text-sm">OR</span>
          <div className="flex-1 h-px bg-[#374151]" />
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full bg-[#26272e] border border-[#2d2f31] text-white py-2.5 rounded-lg hover:bg-[#2d2f31] transition-colors"
          disabled={isProcessing}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

