"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

interface EmailFieldProps {
  label: string;
  value: string;
  isMasked?: boolean;
  onToggleMask?: () => void;
  maskBits?: number[];
  onMaskBitsChange?: (bits: number[]) => void;
  restrictToNameOnly?: boolean; // For "From" field, only allow masking name part (before @)
  disableSelectionMasking?: boolean;
  useBlackMask?: boolean;
}

// Component to highlight selected text using Range API
function SelectionHighlight({
  containerRef,
  isActive,
}: {
  containerRef: RefObject<HTMLSpanElement | null>;
  isActive: boolean;
}) {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) {
      return;
    }

    const updatePosition = () => {
      if (!isActive || !containerRef.current) {
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setPosition(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const container = containerRef.current;
      if (!container) return;

      // Check if selection is within our container
      if (!container.contains(range.commonAncestorContainer)) {
        setPosition(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Calculate position relative to container
      const top = rect.top - containerRect.top + container.scrollTop;
      const left = rect.left - containerRect.left;
      const width = rect.width;
      const height = rect.height;

      setPosition({ top, left, width, height });
    };

    // Update immediately
    updatePosition();

    // Update on selection change
    const handleSelectionChange = () => {
      updatePosition();
    };

    // Update on scroll
    const handleScroll = () => {
      updatePosition();
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    const container = containerRef.current;
    container.addEventListener("scroll", handleScroll);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [containerRef, isActive]);

  if (!position || !isActive) return null;

  return (
    <div
      className="absolute pointer-events-none bg-[#5e6ad2]/40 border-2 border-[#5e6ad2]/70 rounded-sm transition-all duration-200 shadow-lg"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
        height: `${position.height}px`,
        zIndex: 1,
      }}
    />
  );
}

export default function EmailField({
  label,
  value,
  isMasked = false,
  onToggleMask,
  maskBits,
  onMaskBitsChange,
  restrictToNameOnly = false,
  disableSelectionMasking = false,
  useBlackMask = false,
}: EmailFieldProps) {
  const fieldRef = useRef<HTMLSpanElement | null>(null);
  const [showMaskButton, setShowMaskButton] = useState(false);
  const [maskButtonPosition, setMaskButtonPosition] = useState<{
    x: number;
    y: number;
  }>({ x: 0, y: 0 });
  const [currentSelection, setCurrentSelection] = useState<{
    start: number;
    end: number;
    maskState: "masked" | "unmasked" | "partial";
  } | null>(null);
  const [hasActiveSelection, setHasActiveSelection] = useState(false);

  // Calculate the maskable range (for "From" field, only before @)
  const maskableRange = useMemo(() => {
    if (restrictToNameOnly) {
      const atIndex = value.indexOf("@");
      if (atIndex > 0) {
        return { start: 0, end: atIndex };
      }
    }
    return { start: 0, end: value.length };
  }, [value, restrictToNameOnly]);

  // Initialize mask bits if not provided
  const localMaskBits = useMemo(() => {
    if (maskBits && maskBits.length === value.length) {
      // For restrictToNameOnly fields, ensure domain part is always revealed (1)
      const bits = [...maskBits];
      if (restrictToNameOnly && maskableRange.end < value.length) {
        for (let i = maskableRange.end; i < value.length; i++) {
          bits[i] = 1;
        }
      }
      return bits;
    }
    return new Array(value.length).fill(1);
  }, [maskBits, value.length, restrictToNameOnly, maskableRange.end]);

  // Track previous isMasked to detect changes and update mask bits
  const prevIsMaskedRef = useRef(isMasked);
  
  // Handle "Hide all" / "Show all" toggle - update mask bits when isMasked changes
  useEffect(() => {
    if (!onMaskBitsChange) return;
    
    // Only update when isMasked actually changes
    if (prevIsMaskedRef.current === isMasked) return;
    prevIsMaskedRef.current = isMasked;
    
    const newBits = [...localMaskBits];
    if (isMasked) {
      // Hide: set mask bits to 0 (circuit: 0 = hide) for the maskable range only
      // For restrictToNameOnly fields, this is only the name part (before @)
      // For other fields, this is the entire field
      for (let i = maskableRange.start; i < maskableRange.end; i++) {
        newBits[i] = 0;
      }
      // Ensure domain part (after @) is always revealed for restrictToNameOnly fields
      if (restrictToNameOnly && maskableRange.end < value.length) {
        for (let i = maskableRange.end; i < value.length; i++) {
          newBits[i] = 1;
        }
      }
    } else {
      // Show: set mask bits to 1 (circuit: 1 = reveal) for the maskable range
      for (let i = maskableRange.start; i < maskableRange.end; i++) {
        newBits[i] = 1;
      }
    }
    
    onMaskBitsChange(newBits);
  }, [isMasked, maskableRange.start, maskableRange.end, localMaskBits, onMaskBitsChange, restrictToNameOnly, value.length]);

  const escapeHtml = useCallback((text: string) => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }, []);

  const createMaskedHtml = useCallback(
    (text: string, bits: number[]) => {
      if (!text || bits.length !== text.length) {
        console.warn(`[EmailField] Text and bits length mismatch: text=${text.length}, bits=${bits.length}`);
        return escapeHtml(text);
      }

      let result = "";
      let index = 0;
      let maskedSegments = 0;
      let unmaskedSegments = 0;

      while (index < text.length) {
        const currentMask = bits[index] ?? 0;
        let end = index;
        while (end < text.length && (bits[end] ?? 0) === currentMask) {
          end += 1;
        }
        const segment = text.slice(index, end);
        const escapedSegment = escapeHtml(segment);
        
        // For restrictToNameOnly fields, make domain part (after @) unselectable
        const isDomainPart = restrictToNameOnly && index >= maskableRange.end;
        const unselectableStyle = isDomainPart ? ' style="user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none;"' : '';
        
        if (currentMask === 0) {
          maskedSegments++;
          if (useBlackMask) {
            // Solid black mask - completely hides the text
            // Use inline styles to ensure the black background is applied
            result += `<span style="background-color: #000000; color: #000000; display: inline;"${unselectableStyle}>${escapedSegment}</span>`;
          } else {
            // Semi-transparent red mask with line-through (original style)
            result += `<span class="line-through decoration-black bg-[#92929280] decoration-1 opacity-80"${unselectableStyle}>${escapedSegment}</span>`;
          }
        } else {
          unmaskedSegments++;
          result += `<span${unselectableStyle}>${escapedSegment}</span>`;
        }
        index = end;
      }


      return result;
    },
    [escapeHtml, useBlackMask, label, restrictToNameOnly, maskableRange.end]
  );

  // Ensure domain part is always revealed for restrictToNameOnly fields
  const sanitizedMaskBits = useMemo(() => {
    const bits = [...localMaskBits];
    if (restrictToNameOnly && maskableRange.end < value.length) {
      // Ensure domain part (after @) is always revealed (1)
      for (let i = maskableRange.end; i < value.length; i++) {
        bits[i] = 1;
      }
    }
    return bits;
  }, [localMaskBits, restrictToNameOnly, maskableRange.end, value.length]);

  const maskedHtml = useMemo(() => {
    return createMaskedHtml(value, sanitizedMaskBits);
  }, [value, sanitizedMaskBits, createMaskedHtml]);

  const handleMouseUp = useCallback(() => {
    // If selection masking is disabled, don't show mask buttons
    if (disableSelectionMasking) {
      return;
    }
    const container = fieldRef.current;
    if (!container) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setShowMaskButton(false);
      setCurrentSelection(null);
      setHasActiveSelection(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const selectionText = range.toString();
    if (!selectionText.trim()) {
      setShowMaskButton(false);
      setCurrentSelection(null);
      setHasActiveSelection(false);
      return;
    }

    if (!container.contains(range.commonAncestorContainer)) {
      setShowMaskButton(false);
      setCurrentSelection(null);
      setHasActiveSelection(false);
      return;
    }

    // Set active selection state immediately for visual feedback
    setHasActiveSelection(true);

    // Calculate selection offsets
    const rangeToStart = range.cloneRange();
    rangeToStart.selectNodeContents(container);
    rangeToStart.setEnd(range.startContainer, range.startOffset);
    let selectionStart = rangeToStart.toString().length;

    const rangeToEnd = range.cloneRange();
    rangeToEnd.selectNodeContents(container);
    rangeToEnd.setEnd(range.endContainer, range.endOffset);
    let selectionEnd = rangeToEnd.toString().length;

    if (selectionStart > selectionEnd) {
      [selectionStart, selectionEnd] = [selectionEnd, selectionStart];
    }

    selectionStart = Math.max(0, Math.min(selectionStart, value.length));
    selectionEnd = Math.max(0, Math.min(selectionEnd, value.length));

    // Restrict selection to maskable range for "From" field
    // If selection includes domain part, restrict it to only the name part
    if (restrictToNameOnly) {
      // If selection is entirely in the domain part, don't allow it
      if (selectionStart >= maskableRange.end && selectionEnd > maskableRange.end) {
        setShowMaskButton(false);
        setCurrentSelection(null);
        setHasActiveSelection(false);
        // Clear the selection visually
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();
        return;
      }
      // Restrict selection to maskable range (name part only)
      selectionStart = Math.max(selectionStart, maskableRange.start);
      selectionEnd = Math.min(selectionEnd, maskableRange.end);
      
      // If selection was adjusted, update the actual selection range
      if (selectionStart !== rangeToStart.toString().length || selectionEnd !== rangeToEnd.toString().length) {
        // Try to adjust the selection to only include the name part
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          // This is tricky - we'd need to find the text nodes and adjust
          // For now, just clear selection if it includes domain
          if (rangeToEnd.toString().length > maskableRange.end) {
            sel.removeAllRanges();
            setShowMaskButton(false);
            setCurrentSelection(null);
            setHasActiveSelection(false);
            return;
          }
        }
      }
    }

    if (selectionStart === selectionEnd) {
      setShowMaskButton(false);
      setCurrentSelection(null);
      setHasActiveSelection(false);
      return;
    }

    const selectionBits = localMaskBits.slice(selectionStart, selectionEnd);
    if (selectionBits.length === 0) {
      setShowMaskButton(false);
      setCurrentSelection(null);
      setHasActiveSelection(false);
      return;
    }

    const allMasked = selectionBits.every((bit) => bit === 0);
    const allUnmasked = selectionBits.every((bit) => bit === 1);

    let maskStateForSelection: "masked" | "unmasked" | "partial" = "partial";
    if (allMasked) {
      maskStateForSelection = "masked";
    } else if (allUnmasked) {
      maskStateForSelection = "unmasked";
    }

    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const x = rect.right - containerRect.left;
    const y = rect.bottom - containerRect.top + 6;

    setMaskButtonPosition({ x, y });
    setCurrentSelection({
      start: selectionStart,
      end: selectionEnd,
      maskState: maskStateForSelection,
    });
    setShowMaskButton(true);
  }, [value.length, localMaskBits, restrictToNameOnly, maskableRange, disableSelectionMasking]);

  const handleMaskSelection = useCallback(() => {
    if (!currentSelection || !onMaskBitsChange) return;
    const { start, end } = currentSelection;

    // Clear selection highlight when mask is applied
    setHasActiveSelection(false);
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();

    const newBits = [...localMaskBits];
    let boundedStart = Math.max(0, Math.min(start, value.length));
    let boundedEnd = Math.max(boundedStart, Math.min(end, value.length));

    // Restrict to maskable range for "From" field
    if (restrictToNameOnly) {
      boundedStart = Math.max(boundedStart, maskableRange.start);
      boundedEnd = Math.min(boundedEnd, maskableRange.end);
    }

    for (let i = boundedStart; i < boundedEnd; i++) {
      newBits[i] = 0;
    }

    // Ensure domain part is always revealed (1) for restrictToNameOnly fields
    if (restrictToNameOnly && maskableRange.end < value.length) {
      for (let i = maskableRange.end; i < value.length; i++) {
        newBits[i] = 1;
      }
    }

    onMaskBitsChange(newBits);
    setShowMaskButton(false);
    setCurrentSelection(null);
  }, [currentSelection, value.length, localMaskBits, onMaskBitsChange, restrictToNameOnly, maskableRange.start, maskableRange.end, maskableRange.end, value.length]);

  const handleUnmaskSelection = useCallback(() => {
    if (!currentSelection || !onMaskBitsChange) return;
    const { start, end } = currentSelection;

    // Clear selection highlight when unmask is applied
    setHasActiveSelection(false);
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();

    const newBits = [...localMaskBits];
    let boundedStart = Math.max(0, Math.min(start, value.length));
    let boundedEnd = Math.max(boundedStart, Math.min(end, value.length));

    // Restrict to maskable range for "From" field
    if (restrictToNameOnly) {
      boundedStart = Math.max(boundedStart, maskableRange.start);
      boundedEnd = Math.min(boundedEnd, maskableRange.end);
    }

    for (let i = boundedStart; i < boundedEnd; i++) {
      newBits[i] = 1;
    }

    // Ensure domain part is always revealed (1) for restrictToNameOnly fields
    if (restrictToNameOnly && maskableRange.end < value.length) {
      for (let i = maskableRange.end; i < value.length; i++) {
        newBits[i] = 1;
      }
    }

    onMaskBitsChange(newBits);
    setShowMaskButton(false);
    setCurrentSelection(null);
  }, [currentSelection, value.length, localMaskBits, onMaskBitsChange, restrictToNameOnly, maskableRange.start, maskableRange.end, maskableRange.end, value.length]);

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-1 relative">
      {/* Mobile: Label and checkbox on same row */}
      <div className="flex items-center justify-between md:justify-start md:w-30">
        <span className="w-auto">
          <span className="text-[#111314] bg-[#F5F3EF] text-base font-normal w-fit px-3 py-1 md:py-0.5 border border-[#F5F3EF]">
            {label.toUpperCase()}
          </span>
        </span>
        {onToggleMask && (
          <button
            onClick={onToggleMask}
            className="flex items-center gap-1 cursor-pointer p-0 md:hidden"
            type="button"
          >
            <div className="w-5 h-5 flex items-center justify-center">
              <input
                type="checkbox"
                checked={isMasked}
                onChange={(e) => {
                  e.stopPropagation();
                  if (onToggleMask) {
                    onToggleMask();
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                className="w-5 h-5 cursor-pointer accent-[#3B3B3B]"
              />
            </div>
            <span className="text-[#3B3B3B] text-base font-normal text-right">
              {restrictToNameOnly
                ? isMasked
                  ? "Show name"
                  : "Hide name"
                : isMasked
                  ? "Show all"
                  : "Hide all"}
            </span>
          </button>
        )}
      </div>
      
      {/* Value - appears below on mobile, inline on desktop */}
      <span
        ref={fieldRef}
        className="block md:flex-1 text-[#111314] text-base font-normal md:whitespace-nowrap relative select-text"
        onMouseUp={handleMouseUp}
        onMouseDown={() => {
          if (hasActiveSelection) {
            setHasActiveSelection(false);
            setShowMaskButton(false);
            setCurrentSelection(null);
          }
        }}
        dangerouslySetInnerHTML={{ __html: maskedHtml }}
      />
      
      {/* Desktop: Checkbox on right */}
      {onToggleMask && (
        <button
          onClick={onToggleMask}
          className="hidden md:flex items-center gap-2 cursor-pointer p-0"
          type="button"
        >
          <div className="w-5 h-5 flex items-center justify-center">
            <input
              type="checkbox"
              checked={isMasked}
              onChange={(e) => {
                e.stopPropagation();
                if (onToggleMask) {
                  onToggleMask();
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
              className="w-5 h-5 cursor-pointer accent-[#3B3B3B]"
            />
          </div>
          <span className="text-[#3B3B3B] text-base font-normal text-right">
            {restrictToNameOnly
              ? isMasked
                ? "Show name"
                : "Hide name"
              : isMasked
                ? "Show all"
                : "Hide all"}
          </span>
        </button>
      )}
      
      {/* Selection highlight overlay */}
      <SelectionHighlight
        containerRef={fieldRef}
        isActive={hasActiveSelection}
      />
      
      {/* Mask/Unmask dropdown menu */}
      {showMaskButton && currentSelection && (
        <div
          className="absolute z-10 bg-[#F5F3EF] border flex flex-col border-[#D4D4D4] text-sm rounded-lg shadow-lg p-1 min-w-[60px] w-fit"
          style={{
            left: `${maskButtonPosition.x}px`,
            top: `${maskButtonPosition.y}px`,
          }}
        >
          <button
            type="button"
            onClick={handleMaskSelection}
            className={`text-left px-3 py-0.5 text-sm hover:bg-[#206AC2] hover:text-white rounded-lg transition-colors ${
              currentSelection.maskState === "unmasked" ||
              currentSelection.maskState === "partial"
                ? "text-[#111314]"
                : "text-[#A8A8A8]"
            }`}
          >
            Mask
          </button>
          <button
            type="button"
            onClick={handleUnmaskSelection}
            className={`text-left px-3 py-0.5 text-sm transition-colors rounded-lg hover:bg-[#206AC2] hover:text-white ${
              currentSelection.maskState === "masked" ||
              currentSelection.maskState === "partial"
                ? "text-[#111314]"
                : "text-[#A8A8A8]"
            }`}
          >
            Unmask
          </button>
        </div>
      )}
    </div>
  );
}
