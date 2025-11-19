"use client";

import MagicWand from "../assets/MagicWand.svg";
import FileDownloadIcon from "../assets/FileDownloadIcon.svg";
import ArrowBendUpLeft from "../assets/ArrowBendUpLeft.svg";
import ArrowBendUpRight from "../assets/ArrowBendUpRight.svg";

interface ActionBarProps {
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onVerify: () => void;
  isGeneratingProof?: boolean;
}

export default function ActionBar({
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onVerify,
  isGeneratingProof = false,
}: ActionBarProps) {
  return (
    <div className="fixed bottom-4 md:bottom-10 left-1/2 transform -translate-x-1/2 z-50 px-4 w-max">
      <div className="bg-[#F5F3EF] rounded-2xl px-4 md:px-4 py-3 md:py-3 shadow-[0px_4px_8px_0px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-4 md:gap-4 flex-wrap justify-center">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5">
              <img src={MagicWand} alt="Use our AI" width={20} height={20} />
            </div>
            <span className="text-[#111314] text-base font-normal hidden md:block">
              Use our AI
            </span>
          </div>

          <div className="w-px h-6 bg-[#D4D4D4]" />

          <div 
            className={`flex items-center gap-2 ${isGeneratingProof ? 'cursor-wait opacity-70' : 'cursor-pointer hover:opacity-80'}`}
            onClick={() => !isGeneratingProof && onVerify()}
          >
            <div className="w-5 h-5 flex items-center justify-center">
              {isGeneratingProof ? (
                <div className="w-4 h-4 border-2 border-[#111314] border-t-transparent rounded-full animate-spin" />
              ) : (
                <img
                  src={FileDownloadIcon}
                  alt="View & Download"
                  width={20}
                  height={20}
                />
              )}
            </div>
            <span className="text-[#111314] text-base font-normal hidden md:block">
              View & Download
            </span>
          </div>

          <div className="w-px h-6 bg-[#D4D4D4]" />

          <div className="flex items-center gap-3">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className={`flex items-center justify-center w-5 h-5 transition-opacity ${
                canUndo
                  ? "opacity-100 cursor-pointer hover:opacity-80"
                  : "opacity-40 cursor-not-allowed"
              }`}
              type="button"
              aria-label="Undo"
            >
              <img src={ArrowBendUpLeft} alt="Undo" width={20} height={20} />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className={`flex items-center justify-center w-5 h-5 transition-opacity ${
                canRedo
                  ? "opacity-100 cursor-pointer hover:opacity-80"
                  : "opacity-40 cursor-not-allowed"
              }`}
              type="button"
              aria-label="Redo"
            >
              <img src={ArrowBendUpRight} alt="Redo" width={20} height={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
