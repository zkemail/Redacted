"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import EmailField from "./EmailField";
import DashedBorder from "./DashedBorder";

// Component to highlight selected text using Range API
function SelectionHighlight({
  containerRef,
  isActive,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
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

type SelectionInfo = {
  start: number;
  end: number;
  maskState: "masked" | "unmasked" | "partial";
};

type MaskBitsState = {
  fromMaskBits: number[];
  toMaskBits: number[];
  timeMaskBits: number[];
  subjectMaskBits: number[];
  bodyMaskBits: number[];
};

interface EmailCardProps {
  title: string;
  email: {
    from: string;
    to: string;
    time: string;
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    originalEml?: string; // Original EML file content
  };
  isMasked?: boolean;
  onToggleMask?: (field: string) => void;
  resetTrigger?: number; // When this changes, reset all mask bits
  maskedFields?: Set<string>; // Set of field names that are masked
  onUndoRedoStateChange?: (canUndo: boolean, canRedo: boolean) => void; // Callback to update undo/redo button states
  onUndoRedoHandlersReady?: (handlers: { undo: () => void; redo: () => void }) => void; // Callback to provide undo/redo handlers
  onMaskChange?: (headerMask: number[], bodyMask: number[]) => void; // Callback to update header and body masks
}

export default function EmailCard({
  title,
  email,
  isMasked = false,
  onToggleMask,
  resetTrigger,
  maskedFields = new Set(),
  onUndoRedoStateChange,
  onUndoRedoHandlersReady,
  onMaskChange,
}: EmailCardProps) {
  const bodyText = email.bodyText ?? "";

  // Mask bits for all fields - use useMemo to compute initial values
  const initialFromBits = useMemo(
    () => new Array(email.from.length).fill(0),
    [email.from.length]
  );
  const initialToBits = useMemo(
    () => new Array(email.to.length).fill(0),
    [email.to.length]
  );
  const initialTimeBits = useMemo(
    () => new Array(email.time.length).fill(0),
    [email.time.length]
  );
  const initialSubjectBits = useMemo(
    () => new Array(email.subject.length).fill(0),
    [email.subject.length]
  );
  const initialBodyBits = useMemo(
    () => new Array(bodyText.length).fill(0),
    [bodyText.length]
  );

  const [fromMaskBits, setFromMaskBits] = useState<number[]>(initialFromBits);
  const [toMaskBits, setToMaskBits] = useState<number[]>(initialToBits);
  const [timeMaskBits, setTimeMaskBits] = useState<number[]>(initialTimeBits);
  const [subjectMaskBits, setSubjectMaskBits] =
    useState<number[]>(initialSubjectBits);
  const [bodyMaskBits, setBodyMaskBits] = useState<number[]>(initialBodyBits);

  // History management for undo/redo
  const [history, setHistory] = useState<MaskBitsState[]>([
    {
      fromMaskBits: initialFromBits,
      toMaskBits: initialToBits,
      timeMaskBits: initialTimeBits,
      subjectMaskBits: initialSubjectBits,
      bodyMaskBits: initialBodyBits,
    },
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const historyIndexRef = useRef(0);
  const historyLengthRef = useRef(1); // Start with 1 (initial state)
  const historyRef = useRef<MaskBitsState[]>([
    {
      fromMaskBits: initialFromBits,
      toMaskBits: initialToBits,
      timeMaskBits: initialTimeBits,
      subjectMaskBits: initialSubjectBits,
      bodyMaskBits: initialBodyBits,
    },
  ]);
  
  // Keep refs in sync with state and update button states
  useEffect(() => {
    historyIndexRef.current = historyIndex;
    historyRef.current = history;
    historyLengthRef.current = history.length;
    // Update undo/redo button states when history index changes
    if (onUndoRedoStateChange) {
      const canUndo = historyIndex > 0;
      const canRedo = historyIndex < history.length - 1;
      // Use setTimeout to avoid calling during render (fixes React warning)
      setTimeout(() => {
        onUndoRedoStateChange(canUndo, canRedo);
      }, 0);
    }
  }, [historyIndex, history, onUndoRedoStateChange]);
  const [emailMask, setEmailMask] = useState<{
    eml: string;
    bits: number[];
    mask: string;
    bodyMappingPosition?: number; // Where body bits were mapped in EML
  } | null>(null);
  const [bodyMaskInfo, setBodyMaskInfo] = useState<{
    startPosition: number;
    bits: number[];
    sum: number;
    length: number;
    note?: string; // Explanation of what this represents
  } | null>(null);
  const [bodyMappingPosition, setBodyMappingPosition] = useState<number>(-1);

  // Reset mask bits when email content changes - use key prop in parent to trigger remount
  const emailKey = `${email.from}-${email.to}-${email.time}-${
    email.subject
  }-${bodyText}-${email.originalEml?.substring(0, 100)}`;
  const prevEmailKeyRef = useRef(emailKey);
  const prevResetTriggerRef = useRef(resetTrigger);

  useEffect(() => {
    if (prevEmailKeyRef.current !== emailKey) {
      prevEmailKeyRef.current = emailKey;
      // Use setTimeout to batch updates and avoid synchronous setState warning
      const resetState: MaskBitsState = {
        fromMaskBits: new Array(email.from.length).fill(0),
        toMaskBits: new Array(email.to.length).fill(0),
        timeMaskBits: new Array(email.time.length).fill(0),
        subjectMaskBits: new Array(email.subject.length).fill(0),
        bodyMaskBits: new Array(bodyText.length).fill(0),
      };
      setTimeout(() => {
        setFromMaskBits(resetState.fromMaskBits);
        setToMaskBits(resetState.toMaskBits);
        setTimeMaskBits(resetState.timeMaskBits);
        setSubjectMaskBits(resetState.subjectMaskBits);
        setBodyMaskBits(resetState.bodyMaskBits);
        setEmailMask(null);
        // Reset history for new email
        setHistory([resetState]);
        setHistoryIndex(0);
        historyIndexRef.current = 0;
        if (onUndoRedoStateChange) {
          onUndoRedoStateChange(false, false);
        }
      }, 0);
    }
  }, [
    emailKey,
    email.from.length,
    email.to.length,
    email.time.length,
    email.subject.length,
    bodyText.length,
    onUndoRedoStateChange,
  ]);

  // Helper function to get current mask bits state
  const getCurrentMaskBitsState = useCallback((): MaskBitsState => {
    return {
      fromMaskBits: fromMaskBits.length === email.from.length ? [...fromMaskBits] : new Array(email.from.length).fill(0),
      toMaskBits: toMaskBits.length === email.to.length ? [...toMaskBits] : new Array(email.to.length).fill(0),
      timeMaskBits: timeMaskBits.length === email.time.length ? [...timeMaskBits] : new Array(email.time.length).fill(0),
      subjectMaskBits: subjectMaskBits.length === email.subject.length ? [...subjectMaskBits] : new Array(email.subject.length).fill(0),
      bodyMaskBits: bodyMaskBits.length === bodyText.length ? [...bodyMaskBits] : new Array(bodyText.length).fill(0),
    };
  }, [fromMaskBits, toMaskBits, timeMaskBits, subjectMaskBits, bodyMaskBits, email.from.length, email.to.length, email.time.length, email.subject.length, bodyText.length]);

  // Helper function to save state to history (saves the state AFTER a change)
  const saveToHistory = useCallback((state: MaskBitsState) => {
    // Prevent duplicate saves by checking if this state was just saved
    const stateKey = JSON.stringify(state);
    if (stateKey === lastSavedStateRef.current) {
      return; // This state was already saved, skip
    }
    
    // Don't save if we're currently saving or restoring
    if (isSavingHistoryRef.current) {
      return;
    }
    
    if (isRestoringFromHistoryRef.current) {
      return;
    }
    
    // Mark that we're saving IMMEDIATELY (synchronously) to prevent race conditions
    isSavingHistoryRef.current = true;
    lastSavedStateRef.current = stateKey;
    
    setHistory((prevHistory) => {
      const currentIndex = historyIndexRef.current;
      // Remove any future history if we're not at the end (user made a new change after undoing)
      // We keep states up to and including currentIndex, then add the new state
      const newHistory = prevHistory.slice(0, currentIndex + 1);
      // Add the new state (this is the state AFTER the change)
      newHistory.push(state);
      // Limit history size to prevent memory issues (keep last 50 states)
      const finalHistory = newHistory.length > 50 ? newHistory.slice(-50) : newHistory;
      const newIndex = finalHistory.length - 1;
      
      // Update history length ref and history ref
      historyLengthRef.current = finalHistory.length;
      historyRef.current = finalHistory;
      
      // Update history index to point to the new state
      setHistoryIndex(newIndex);
      historyIndexRef.current = newIndex;
      
      // Clear the saving flag after state update completes
      setTimeout(() => {
        isSavingHistoryRef.current = false;
      }, 50); // Increased delay to ensure state update completes
      
      return finalHistory;
    });
  }, []);

  // Helper function to restore state from history
  const restoreFromHistory = useCallback((state: MaskBitsState) => {
    // Set flag to prevent saving history during restoration
    isRestoringFromHistoryRef.current = true;
    // Update lastSavedStateRef immediately to prevent saves
    lastSavedStateRef.current = JSON.stringify(state);
    // Clear any pending saves
    pendingHistorySaveRef.current = null;
    
    setFromMaskBits([...state.fromMaskBits]);
    setToMaskBits([...state.toMaskBits]);
    setTimeMaskBits([...state.timeMaskBits]);
    setSubjectMaskBits([...state.subjectMaskBits]);
    setBodyMaskBits([...state.bodyMaskBits]);
    
    // Clear the flag after a longer delay to ensure all state updates complete
    // React batches state updates, so we need to wait for all of them
    setTimeout(() => {
      isRestoringFromHistoryRef.current = false;
      isUndoRedoInProgressRef.current = false;
    }, 150); // Increased delay to ensure all state updates are processed
  }, []);

  // Undo function - exposed via useImperativeHandle or callback
  const handleUndo = useCallback(() => {
    // Prevent multiple simultaneous undo operations
    if (isUndoRedoInProgressRef.current) {
      return;
    }
    
    const currentIndex = historyIndexRef.current;
    const currentHistory = historyRef.current;
    
    if (currentIndex > 0 && currentHistory.length > 0) {
      const newIndex = currentIndex - 1;
      const stateToRestore = currentHistory[newIndex];
      if (stateToRestore) {
        isUndoRedoInProgressRef.current = true;
        
        // Update index synchronously before restoring
        historyIndexRef.current = newIndex;
        setHistoryIndex(newIndex);
        // Then restore state (this will trigger useEffect to update button states)
        restoreFromHistory(stateToRestore);
      }
    }
  }, [restoreFromHistory]);

  // Redo function - exposed via useImperativeHandle or callback
  const handleRedo = useCallback(() => {
    // Prevent multiple simultaneous redo operations
    if (isUndoRedoInProgressRef.current) {
      return;
    }
    
    const currentIndex = historyIndexRef.current;
    const currentHistory = historyRef.current;
    
    if (currentIndex < currentHistory.length - 1 && currentHistory.length > 0) {
      const newIndex = currentIndex + 1;
      const stateToRestore = currentHistory[newIndex];
      if (stateToRestore) {
        isUndoRedoInProgressRef.current = true;
        
        // Update index synchronously before restoring
        historyIndexRef.current = newIndex;
        setHistoryIndex(newIndex);
        // Then restore state (this will trigger useEffect to update button states)
        restoreFromHistory(stateToRestore);
      }
    }
  }, [restoreFromHistory]);

  // Track pending history saves to avoid saving before state updates
  const pendingHistorySaveRef = useRef<{ field: string; newBits: number[] } | null>(null);
  const lastSavedStateRef = useRef<string>('');
  const isRestoringFromHistoryRef = useRef(false);
  const isSavingHistoryRef = useRef(false);
  const isUndoRedoInProgressRef = useRef(false);

  // Effect to save history after state updates for EmailField changes
  useEffect(() => {
    // Don't save history if we're restoring from history (undo/redo) or already saving
    if (isRestoringFromHistoryRef.current || isSavingHistoryRef.current) {
      // Clear pending save if we can't process it
      if (pendingHistorySaveRef.current) {
        pendingHistorySaveRef.current = null;
      }
      return;
    }
    
    // Only process if we have a pending save
    const pendingSave = pendingHistorySaveRef.current;
    if (!pendingSave) {
      return;
    }
    
    // Clear pending save immediately to prevent processing it multiple times
    pendingHistorySaveRef.current = null;
    
    const { field, newBits } = pendingSave;
    
    // Get the current state (which now includes the updated field)
    const newState = getCurrentMaskBitsState();
    // Ensure the field we just updated is correctly set
    if (field === 'from') {
      newState.fromMaskBits = newBits;
    } else if (field === 'to') {
      newState.toMaskBits = newBits;
    } else if (field === 'time') {
      newState.timeMaskBits = newBits;
    } else if (field === 'subject') {
      newState.subjectMaskBits = newBits;
    }
    
    // Create a key to avoid duplicate saves
    const stateKey = JSON.stringify(newState);
    if (stateKey !== lastSavedStateRef.current) {
      // Save to history (this will set the flags internally)
      saveToHistory(newState);
    }
  }, [fromMaskBits, toMaskBits, timeMaskBits, subjectMaskBits, getCurrentMaskBitsState, saveToHistory]);

  // Wrapper functions for mask bit setters that save to history
  // These are called from EmailField when user performs mask/unmask operations
  const setFromMaskBitsWithHistory = useCallback((bits: number[] | ((prev: number[]) => number[])) => {
    // Apply the change first
    setFromMaskBits(bits);
    // Calculate what the new bits will be
    const newBits = typeof bits === 'function' 
      ? bits(fromMaskBits.length === email.from.length ? [...fromMaskBits] : new Array(email.from.length).fill(0))
      : bits;
    // Mark that we need to save history after the state updates
    pendingHistorySaveRef.current = { field: 'from', newBits };
  }, [fromMaskBits, email.from.length]);

  const setToMaskBitsWithHistory = useCallback((bits: number[] | ((prev: number[]) => number[])) => {
    setToMaskBits(bits);
    const newBits = typeof bits === 'function'
      ? bits(toMaskBits.length === email.to.length ? [...toMaskBits] : new Array(email.to.length).fill(0))
      : bits;
    pendingHistorySaveRef.current = { field: 'to', newBits };
  }, [toMaskBits, email.to.length]);

  const setTimeMaskBitsWithHistory = useCallback((bits: number[] | ((prev: number[]) => number[])) => {
    setTimeMaskBits(bits);
    const newBits = typeof bits === 'function'
      ? bits(timeMaskBits.length === email.time.length ? [...timeMaskBits] : new Array(email.time.length).fill(0))
      : bits;
    pendingHistorySaveRef.current = { field: 'time', newBits };
  }, [timeMaskBits, email.time.length]);

  const setSubjectMaskBitsWithHistory = useCallback((bits: number[] | ((prev: number[]) => number[])) => {
    setSubjectMaskBits(bits);
    const newBits = typeof bits === 'function'
      ? bits(subjectMaskBits.length === email.subject.length ? [...subjectMaskBits] : new Array(email.subject.length).fill(0))
      : bits;
    pendingHistorySaveRef.current = { field: 'subject', newBits };
  }, [subjectMaskBits, email.subject.length]);

  // Expose undo/redo handlers to parent component
  useEffect(() => {
    if (onUndoRedoHandlersReady) {
      onUndoRedoHandlersReady({
        undo: handleUndo,
        redo: handleRedo,
      });
    }
  }, [handleUndo, handleRedo, onUndoRedoHandlersReady]);

  // Reset mask bits when resetTrigger changes
  useEffect(() => {
    if (
      resetTrigger !== undefined &&
      prevResetTriggerRef.current !== resetTrigger
    ) {
      prevResetTriggerRef.current = resetTrigger;
      // Reset all mask bits to initial state (all zeros)
      const resetState: MaskBitsState = {
        fromMaskBits: new Array(email.from.length).fill(0),
        toMaskBits: new Array(email.to.length).fill(0),
        timeMaskBits: new Array(email.time.length).fill(0),
        subjectMaskBits: new Array(email.subject.length).fill(0),
        bodyMaskBits: new Array(bodyText.length).fill(0),
      };
      setTimeout(() => {
        setFromMaskBits(resetState.fromMaskBits);
        setToMaskBits(resetState.toMaskBits);
        setTimeMaskBits(resetState.timeMaskBits);
        setSubjectMaskBits(resetState.subjectMaskBits);
        setBodyMaskBits(resetState.bodyMaskBits);
        setEmailMask(null);
        // Clear any active selections
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();
        // Note: clearSelectionState will be called, but we need to clear refs manually here
        // since clearSelectionState might not be accessible in this effect
        savedSelectionRangeRef.current = null;
        savedSelectionOffsetsRef.current = null;
        setShowMaskButton(false);
        setCurrentSelection(null);
        setHasActiveSelection(false);
        // Reset history
        setHistory([resetState]);
        setHistoryIndex(0);
        historyIndexRef.current = 0;
        if (onUndoRedoStateChange) {
          onUndoRedoStateChange(false, false);
        }
      }, 0);
    }
  }, [resetTrigger, email.from.length, email.to.length, email.time.length, email.subject.length, bodyText.length, onUndoRedoStateChange]);

  // Selection masking state (for Body)
  const bodyContainerRef = useRef<HTMLDivElement | null>(null);
  const savedSelectionRangeRef = useRef<Range | null>(null);
  const savedSelectionOffsetsRef = useRef<{ start: number; end: number } | null>(null);
  const [showMaskButton, setShowMaskButton] = useState(false);
  const [maskButtonPosition, setMaskButtonPosition] = useState<{
    x: number;
    y: number;
  }>({ x: 0, y: 0 });
  const [currentSelection, setCurrentSelection] =
    useState<SelectionInfo | null>(null);
  const [hasActiveSelection, setHasActiveSelection] = useState(false);

  const escapeHtml = useCallback((text: string) => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }, []);

  const createMaskedHtmlFromPlainText = useCallback(
    (text: string, bits: number[]) => {
      if (!text) return "";
      let result = "";
      let index = 0;

      while (index < text.length) {
        const currentMask = bits[index] ?? 0;
        let end = index;
        while (end < text.length && (bits[end] ?? 0) === currentMask) {
          end += 1;
        }
        const segment = text.slice(index, end);
        const escapedSegment = escapeHtml(segment);
        if (currentMask === 1) {
          result += `<span class="line-through decoration-black bg-[#FD878950] decoration-1 opacity-80">${escapedSegment}</span>`;
        } else {
          result += escapedSegment;
        }
        index = end;
      }

      return result;
    },
    [escapeHtml]
  );

  const scopeHtmlContent = useCallback(
    (html: string, scopeId: string): string => {
      if (
        typeof window === "undefined" ||
        typeof window.DOMParser === "undefined"
      ) {
        return html;
      }

      try {
        const parser = new window.DOMParser();
        const doc = parser.parseFromString(
          `<div id="${scopeId}">${html}</div>`,
          "text/html"
        );
        const container = doc.getElementById(scopeId);
        if (!container) {
          return html;
        }

        // Remove any style tags or link tags that might affect global styles (do this first)
        const styleTags = container.querySelectorAll("style");
        styleTags.forEach((style) => style.remove());

        const linkTags = container.querySelectorAll('link[rel="stylesheet"]');
        linkTags.forEach((link) => link.remove());

        // Remove any script tags for security
        const scripts = container.querySelectorAll("script");
        scripts.forEach((script) => script.remove());

        // Scope all elements: prefix classes and sanitize inline styles
        const allElements = container.querySelectorAll("*");
        allElements.forEach((element) => {
          // Scope class names (only non-Tailwind classes)
          if (element.className && typeof element.className === "string") {
            const classes = element.className.split(/\s+/).filter(Boolean);
            // Only scope non-Tailwind utility classes (preserve our masking classes)
            const scopedClasses = classes.map((cls) => {
              // Keep Tailwind utility classes and our masking classes as-is
              if (
                cls.startsWith("line-through") ||
                cls.startsWith("decoration-") ||
                /^(text-|bg-|border-|p-|m-|w-|h-|flex|grid|hidden|block|inline|absolute|relative|fixed|sticky)/.test(
                  cls
                )
              ) {
                return cls;
              }
              // Scope other classes to prevent conflicts
              return `${scopeId}-${cls}`;
            });
            element.className = scopedClasses.join(" ");
          }

          // Sanitize inline styles to prevent layout leakage
          if (element.hasAttribute("style")) {
            const style = element.getAttribute("style") || "";
            // Remove potentially dangerous styles that could affect page layout
            const dangerousProps = [
              "position:fixed",
              "position:absolute",
              "z-index",
              "overflow",
              "display:none",
            ];

            // Only keep safe formatting styles
            const safeStyleProps = style.split(";").filter((prop) => {
              const trimmed = prop.trim().toLowerCase();
              // Allow safe properties like color, font, text-align, etc.
              return (
                !dangerousProps.some((dangerous) =>
                  trimmed.includes(dangerous)
                ) &&
                (trimmed.startsWith("color") ||
                  trimmed.startsWith("font") ||
                  trimmed.startsWith("text-") ||
                  trimmed.startsWith("line-height") ||
                  trimmed.startsWith("margin") ||
                  trimmed.startsWith("padding") ||
                  trimmed.startsWith("border") ||
                  trimmed.startsWith("background-color") ||
                  trimmed.startsWith("width") ||
                  trimmed.startsWith("height") ||
                  trimmed.startsWith("max-width") ||
                  trimmed.startsWith("max-height"))
              );
            });

            const sanitizedStyle = safeStyleProps.join(";");
            if (style !== sanitizedStyle) {
              element.setAttribute("style", sanitizedStyle);
            }
          }
        });

        return container.innerHTML;
      } catch (error) {
        return html;
      }
    },
    []
  );

  const createMaskedHtmlFromHtml = useCallback(
    (html: string, bits: number[]) => {
      if (!html) {
        return createMaskedHtmlFromPlainText(bodyText, bits);
      }
      if (
        typeof window === "undefined" ||
        typeof window.DOMParser === "undefined"
      ) {
        return html;
      }

      try {
        const parser = new window.DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        
        // Try to find the body element first, otherwise use the document body or create a container
        let container: Element | null = doc.body;
        
        // If there's no body or body is empty, try to find the main content
        if (!container || container.textContent?.trim().length === 0) {
          // Try to find a div or other container with actual content
          container = doc.querySelector('body > *') || doc.documentElement;
        }
        
        // If still no container, wrap the HTML in a div
        if (!container) {
          const wrapper = doc.createElement('div');
          wrapper.innerHTML = html;
          container = wrapper;
        }

        // First, extract plain text from HTML to compare with bodyText
        const htmlPlainText = container.textContent || '';
        const htmlTextLength = htmlPlainText.length;
        

        // Try to find where bodyText appears in the HTML plain text
        // Try exact match first
        let bodyTextStartPos = htmlPlainText.indexOf(bodyText);
        
        // If exact match not found, try to find a substring match
        // (bodyText might have whitespace differences)
        if (bodyTextStartPos < 0 && bodyText.length > 0) {
          // Try finding first 100 chars of bodyText
          const bodyTextPrefix = bodyText.substring(0, Math.min(100, bodyText.length));
          const prefixPos = htmlPlainText.indexOf(bodyTextPrefix);
          if (prefixPos >= 0) {
            // Found prefix, try to align from there
            bodyTextStartPos = prefixPos;
          }
        }


        // If HTML text is longer than bodyText, we need to expand the bits array
        // to match the HTML text length. We'll map bodyText positions to HTML positions.
        // For positions beyond bodyText.length, we'll use 0 (unmasked).
        let expandedBits: number[];
        
        if (htmlTextLength <= bodyText.length) {
          // HTML text is shorter or equal, use bits as-is (truncated if needed)
          expandedBits = bits.slice(0, htmlTextLength);
        } else {
          // HTML text is longer - expand bits array to match HTML length
          // Map bodyText positions to HTML positions
          expandedBits = new Array(htmlTextLength).fill(0);
          
          if (bodyTextStartPos >= 0) {
            // Found bodyText at position bodyTextStartPos in HTML
            // Map bits to that position
            for (let i = 0; i < Math.min(bits.length, bodyText.length); i++) {
              const htmlPos = bodyTextStartPos + i;
              if (htmlPos < expandedBits.length) {
                expandedBits[htmlPos] = bits[i] || 0;
              }
            }
          } else {
            // bodyText not found - this is a problem, but try to map first characters as fallback
            for (let i = 0; i < Math.min(bits.length, bodyText.length, htmlTextLength); i++) {
              expandedBits[i] = bits[i] || 0;
            }
          }
        }

        const expandedSum = expandedBits.reduce((a, b) => a + b, 0);

        // Collect all text nodes first to avoid issues with modifying DOM while walking
        const textNodes: Text[] = [];
        const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode() as Text | null;
        while (textNode) {
          if (textNode.textContent && textNode.textContent.length > 0) {
            textNodes.push(textNode);
          }
          textNode = walker.nextNode() as Text | null;
        }


        let globalIndex = 0;
        let totalProcessed = 0;
        let spansCreated = 0;

        // Now process each text node
        for (let nodeIdx = 0; nodeIdx < textNodes.length; nodeIdx++) {
          const currentNode = textNodes[nodeIdx];
          const nodeText = currentNode.textContent ?? "";
          

          if (nodeText.length > 0) {
            const fragments: Node[] = [];
            let localIndex = 0;

            while (localIndex < nodeText.length) {
              // Ensure we don't go out of bounds
              if (globalIndex >= expandedBits.length) {
                // If we've exceeded the bits array, treat remaining as unmasked
                fragments.push(doc.createTextNode(nodeText.slice(localIndex)));
                break;
              }
              
              const currentMask = expandedBits[globalIndex] ?? 0;
              let segmentEnd = localIndex;
              while (
                segmentEnd < nodeText.length &&
                globalIndex + (segmentEnd - localIndex) < expandedBits.length &&
                (expandedBits[globalIndex + (segmentEnd - localIndex)] ?? 0) ===
                  currentMask
              ) {
                segmentEnd += 1;
              }
              const segmentText = nodeText.slice(localIndex, segmentEnd);
              if (currentMask === 1) {
                const span = doc.createElement("span");
                span.className =
                  "line-through decoration-black bg-[#FD878950] decoration-1 opacity-80";
                span.textContent = segmentText;
                fragments.push(span);
                spansCreated++;
              } else {
                fragments.push(doc.createTextNode(segmentText));
              }
              globalIndex += segmentEnd - localIndex;
              localIndex = segmentEnd;
            }

            totalProcessed += nodeText.length;
            const fragment = doc.createDocumentFragment();
            fragments.forEach((node) => fragment.appendChild(node));
            currentNode.parentNode?.replaceChild(fragment, currentNode);
          }
        }


        // Get the processed HTML - if container is body, get its innerHTML, otherwise get container's outerHTML
        let processedHtml: string;
        if (container === doc.body) {
          processedHtml = container.innerHTML;
        } else {
          processedHtml = container.innerHTML;
        }
        
        
        // Scope the HTML content to prevent style leakage
        return scopeHtmlContent(processedHtml, "email-body-scoped");
      } catch (error) {
        return html;
      }
    },
    [bodyText, createMaskedHtmlFromPlainText, scopeHtmlContent]
  );


  // Create a string representation of bodyMaskBits to use as a dependency
  // This ensures useMemo recalculates when the array contents change
  const bodyMaskBitsKey = useMemo(() => {
    return bodyMaskBits.join(',');
  }, [bodyMaskBits]);

  const maskedBodyHtml = useMemo(() => {
    // Ensure bodyMaskBits has the correct length
    const bits = bodyMaskBits.length === bodyText.length 
      ? bodyMaskBits 
      : new Array(bodyText.length).fill(0);
    
    const bitsSum = bits.reduce((a, b) => a + b, 0);
    
    if (email.bodyHtml) {
      return createMaskedHtmlFromHtml(email.bodyHtml, bits);
    }
    return createMaskedHtmlFromPlainText(bodyText, bits);
  }, [
    email.bodyHtml,
    bodyText,
    bodyMaskBitsKey, // Use the string key instead of the array
    createMaskedHtmlFromPlainText,
    createMaskedHtmlFromHtml,
  ]);

  // Helper function to clear selection state
  const clearSelectionState = useCallback(() => {
    savedSelectionRangeRef.current = null;
    savedSelectionOffsetsRef.current = null;
    setShowMaskButton(false);
    setCurrentSelection(null);
    setHasActiveSelection(false);
  }, []);

  const handleMouseUpOnBody = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const container = bodyContainerRef.current;
    if (!container) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      clearSelectionState();
      return;
    }

    const range = selection.getRangeAt(0);
    const selectionText = range.toString();
    if (!selectionText.trim()) {
      clearSelectionState();
      return;
    }

    if (!container.contains(range.commonAncestorContainer)) {
      clearSelectionState();
      return;
    }

    // Set active selection state immediately for visual feedback
    setHasActiveSelection(true);

    // Calculate selection offsets by extracting text content from DOM
    // This works correctly even when HTML has masking spans inserted
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

    // Ensure selection is within bounds of original bodyText
    selectionStart = Math.max(0, Math.min(selectionStart, bodyText.length));
    selectionEnd = Math.max(0, Math.min(selectionEnd, bodyText.length));

    if (selectionStart === selectionEnd) {
      clearSelectionState();
      return;
    }

    // Ensure bodyMaskBits has the correct length
    const currentBodyMaskBits = bodyMaskBits.length === bodyText.length 
      ? bodyMaskBits 
      : new Array(bodyText.length).fill(0);

    const selectionBits = currentBodyMaskBits.slice(selectionStart, selectionEnd);
    if (selectionBits.length === 0) {
      clearSelectionState();
      return;
    }

    const allMasked = selectionBits.every((bit) => bit === 1);
    const allUnmasked = selectionBits.every((bit) => bit === 0);

    let maskStateForSelection: SelectionInfo["maskState"] = "partial";
    if (allMasked) {
      maskStateForSelection = "masked";
    } else if (allUnmasked) {
      maskStateForSelection = "unmasked";
    }

    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const x = rect.right - containerRect.left;
    const y = rect.bottom - containerRect.top + 6;

    // Save the Range and offsets before state update to restore selection after DOM update
    const clonedRange = range.cloneRange();
    savedSelectionRangeRef.current = clonedRange;
    savedSelectionOffsetsRef.current = { start: selectionStart, end: selectionEnd };

    setMaskButtonPosition({ x, y });
    setCurrentSelection({
      start: selectionStart,
      end: selectionEnd,
      maskState: maskStateForSelection,
    });
    setShowMaskButton(true);
  }, [bodyText, bodyMaskBits, clearSelectionState]);

  // Helper function to restore selection from text offsets
  const restoreSelectionFromOffsets = useCallback((start: number, end: number) => {
    const container = bodyContainerRef.current;
    if (!container) {
      return false;
    }

    try {
      // Create a range that selects the text content from start to end
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null
      );

      let currentOffset = 0;
      let startNode: Node | null = null;
      let startOffset = 0;
      let endNode: Node | null = null;
      let endOffset = 0;
      let nodeCount = 0;

      let node = walker.nextNode();
      while (node) {
        nodeCount++;
        const textLength = node.textContent?.length || 0;
        const nodeStart = currentOffset;
        const nodeEnd = currentOffset + textLength;

        // Check if start is within this node
        if (!startNode && start >= nodeStart && start <= nodeEnd) {
          startNode = node;
          startOffset = start - nodeStart;
        }

        // Check if end is within this node
        if (!endNode && end >= nodeStart && end <= nodeEnd) {
          endNode = node;
          endOffset = end - nodeStart;
        }

        if (startNode && endNode) break;

        currentOffset = nodeEnd;
        node = walker.nextNode();
      }

      if (startNode && endNode) {
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.setStart(startNode, startOffset);
          range.setEnd(endNode, endOffset);
          selection.removeAllRanges();
          selection.addRange(range);
          
          return true;
        }
      }
    } catch (error) {
      // Error restoring selection
    }
    return false;
  }, []);

  // Restore selection after DOM update when showMaskButton becomes true
  useLayoutEffect(() => {
    if (!showMaskButton || !savedSelectionRangeRef.current || !savedSelectionOffsetsRef.current) {
      return;
    }

    const container = bodyContainerRef.current;
    if (!container) {
      return;
    }

    // Use requestAnimationFrame to ensure DOM is fully updated
    requestAnimationFrame(() => {
      // Try to restore the saved Range first
      try {
        const savedRange = savedSelectionRangeRef.current;
        const selection = window.getSelection();
        if (selection) {
          // Check if the Range nodes are still valid (not detached)
          try {
            // Test if we can access the range properties without error
            const test = savedRange.startContainer;
            const isInContainer = test && container.contains(test);

            // Check if Range points to text nodes (nodeType 3) or if it's pointing to elements
            const isTextNode = savedRange.startContainer.nodeType === Node.TEXT_NODE;
            const isEndTextNode = savedRange.endContainer.nodeType === Node.TEXT_NODE;
            
            if (isInContainer && isTextNode && isEndTextNode) {
              selection.removeAllRanges();
              selection.addRange(savedRange);
              
              const restoredText = savedRange.toString();
              // Only consider it successful if we actually restored text content
              if (restoredText.length > 0) {
                return; // Successfully restored from saved Range
              }
            }
          } catch (e) {
            // Range nodes are stale, fall through to restore from offsets
          }
        }
      } catch (e) {
        // Range is invalid, fall through to restore from offsets
      }

      // If Range restoration failed, restore from text offsets
      const offsets = savedSelectionOffsetsRef.current;
      restoreSelectionFromOffsets(offsets.start, offsets.end);
    });
  }, [showMaskButton, restoreSelectionFromOffsets]);

  const handleMaskSelection = useCallback(() => {
    if (!currentSelection) {
      return;
    }
    const { start, end } = currentSelection;
    
    // Clear browser selection and our selection state when mask is applied
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    
    setBodyMaskBits((prev) => {
      // Always create a new array to ensure React detects the change
      const next =
        prev.length === bodyText.length
          ? [...prev]
          : new Array(bodyText.length).fill(0);
      const boundedStart = Math.max(0, Math.min(start, bodyText.length));
      const boundedEnd = Math.max(boundedStart, Math.min(end, bodyText.length));
      
      for (let i = boundedStart; i < boundedEnd; i++) {
        next[i] = 1;
      }
      
      // Save the NEW state to history after the change
      // Construct the new state with the updated bodyMaskBits
      const newState: MaskBitsState = {
        fromMaskBits: fromMaskBits.length === email.from.length ? [...fromMaskBits] : new Array(email.from.length).fill(0),
        toMaskBits: toMaskBits.length === email.to.length ? [...toMaskBits] : new Array(email.to.length).fill(0),
        timeMaskBits: timeMaskBits.length === email.time.length ? [...timeMaskBits] : new Array(email.time.length).fill(0),
        subjectMaskBits: subjectMaskBits.length === email.subject.length ? [...subjectMaskBits] : new Array(email.subject.length).fill(0),
        bodyMaskBits: next,
      };
      // Check if we should save (avoid duplicates and don't save during restoration)
      const stateKey = JSON.stringify(newState);
      if (!isRestoringFromHistoryRef.current && !isSavingHistoryRef.current && stateKey !== lastSavedStateRef.current) {
        // Use setTimeout to save after React processes the state update
        // saveToHistory will handle the flags internally
        setTimeout(() => {
          saveToHistory(newState);
        }, 0);
      }
      
      return next;
    });
    clearSelectionState();
  }, [currentSelection, bodyText, bodyMaskBits.length, fromMaskBits, toMaskBits, timeMaskBits, subjectMaskBits, email.from.length, email.to.length, email.time.length, email.subject.length, saveToHistory, clearSelectionState]);

  const handleUnmaskSelection = useCallback(() => {
    if (!currentSelection) {
      return;
    }
    const { start, end } = currentSelection;
    
    // Clear browser selection and our selection state when unmask is applied
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    
    setBodyMaskBits((prev) => {
      // Always create a new array to ensure React detects the change
      const next =
        prev.length === bodyText.length
          ? [...prev]
          : new Array(bodyText.length).fill(0);
      const boundedStart = Math.max(0, Math.min(start, bodyText.length));
      const boundedEnd = Math.max(boundedStart, Math.min(end, bodyText.length));
      
      for (let i = boundedStart; i < boundedEnd; i++) {
        next[i] = 0;
      }
      
      // Save the NEW state to history after the change
      // Construct the new state with the updated bodyMaskBits
      const newState: MaskBitsState = {
        fromMaskBits: fromMaskBits.length === email.from.length ? [...fromMaskBits] : new Array(email.from.length).fill(0),
        toMaskBits: toMaskBits.length === email.to.length ? [...toMaskBits] : new Array(email.to.length).fill(0),
        timeMaskBits: timeMaskBits.length === email.time.length ? [...timeMaskBits] : new Array(email.time.length).fill(0),
        subjectMaskBits: subjectMaskBits.length === email.subject.length ? [...subjectMaskBits] : new Array(email.subject.length).fill(0),
        bodyMaskBits: next,
      };
      // Check if we should save (avoid duplicates and don't save during restoration)
      const stateKey = JSON.stringify(newState);
      if (!isRestoringFromHistoryRef.current && !isSavingHistoryRef.current && stateKey !== lastSavedStateRef.current) {
        // Use setTimeout to save after React processes the state update
        // saveToHistory will handle the flags internally
        setTimeout(() => {
          saveToHistory(newState);
        }, 0);
      }
      
      return next;
    });
    clearSelectionState();
  }, [currentSelection, bodyText, bodyMaskBits.length, fromMaskBits, toMaskBits, timeMaskBits, subjectMaskBits, email.from.length, email.to.length, email.time.length, email.subject.length, saveToHistory, clearSelectionState]);

  // Map mask bits to original EML file positions
  const aggregatedMask = useMemo(() => {
    if (!email.originalEml) {
      // Fallback: reconstruct EML if original not available
      const zeroBits = (length: number) => new Array(length).fill(0);
      const segments = [
        { text: "From: ", bits: zeroBits("From: ".length) },
        { text: email.from, bits: fromMaskBits },
        { text: "\n", bits: [0] },
        { text: "To: ", bits: zeroBits("To: ".length) },
        { text: email.to, bits: toMaskBits },
        { text: "\n", bits: [0] },
        { text: "Date: ", bits: zeroBits("Date: ".length) },
        { text: email.time, bits: timeMaskBits },
        { text: "\n", bits: [0] },
        { text: "Subject: ", bits: zeroBits("Subject: ".length) },
        { text: email.subject, bits: subjectMaskBits },
        { text: "\n", bits: [0] },
        { text: "\n", bits: [0] },
        { text: bodyText, bits: bodyMaskBits },
      ];

      const eml = segments.map((segment) => segment.text).join("");
      const bits = segments.flatMap((segment) => {
        if (segment.bits.length === segment.text.length) {
          return segment.bits;
        }
        const fallback = zeroBits(segment.text.length);
        for (
          let i = 0;
          i < Math.min(segment.bits.length, fallback.length);
          i += 1
        ) {
          fallback[i] = segment.bits[i];
        }
        return fallback;
      });

      return {
        eml,
        bits,
        mask: bits.join(""),
      };
    }

    // Use original EML file - map field selections to original positions
    const originalEml = email.originalEml;
    const bits = new Array(originalEml.length).fill(0);

    // Helper to find and map field value in original EML
    const mapFieldToOriginal = (fieldValue: string, fieldBits: number[], fieldName: string) => {
      if (!fieldValue || fieldBits.length === 0) {
        return;
      }

      // Escape special regex characters in field value
      const escapedValue = fieldValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Find all occurrences of the field value in the original EML
      const regex = new RegExp(escapedValue, "g");
      const matches = [...originalEml.matchAll(regex)];


      for (const match of matches) {
        const start = match.index!;
        if (
          start !== undefined &&
          start + fieldValue.length <= originalEml.length
        ) {
          // Map the mask bits to this occurrence
          let bitsMapped = 0;
          for (
            let i = 0;
            i < Math.min(fieldBits.length, fieldValue.length);
            i++
          ) {
            if (start + i < bits.length) {
              const oldBit = bits[start + i];
              bits[start + i] = fieldBits[i] || 0;
              if (fieldBits[i] === 1) bitsMapped++;
            }
          }
          if (bitsMapped > 0) {
          }
        }
      }
    };

    // Map each field to original EML positions
    mapFieldToOriginal(email.from, fromMaskBits, 'from');
    mapFieldToOriginal(email.to, toMaskBits, 'to');
    mapFieldToOriginal(email.time, timeMaskBits, 'time');
    mapFieldToOriginal(email.subject, subjectMaskBits, 'subject');
    
    // For body, try multiple approaches to find it in the EML
    // 1. Try plain text bodyText first
    let bodyMapped = false;
    if (bodyText && bodyMaskBits.length > 0) {
      const bodyTextMatches = [...originalEml.matchAll(new RegExp(bodyText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))];
      if (bodyTextMatches.length > 0) {
        mapFieldToOriginal(bodyText, bodyMaskBits, 'body');
        bodyMapped = true;
      }
    }
    
    // 2. If not found, try HTML body content
    if (!bodyMapped && email.bodyHtml && bodyMaskBits.length > 0) {
      // Try to find HTML body in EML - look for a substring of the HTML
      const htmlSubstring = email.bodyHtml.substring(0, Math.min(500, email.bodyHtml.length));
      const htmlEscaped = htmlSubstring.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const htmlMatches = [...originalEml.matchAll(new RegExp(htmlEscaped, "g"))];
      
      if (htmlMatches.length > 0) {
        const matchStart = htmlMatches[0].index!;
        
        // Extract plain text from HTML to map positions
        // We need to map bodyMaskBits (which is for plain text) to HTML positions
        if (typeof window !== 'undefined' && window.DOMParser) {
          try {
            const parser = new window.DOMParser();
            const tempDoc = parser.parseFromString(`<div>${email.bodyHtml}</div>`, 'text/html');
            const tempDiv = tempDoc.querySelector('div');
            const htmlPlainText = tempDiv?.textContent || '';
            
            // Find where bodyText appears in htmlPlainText
            const bodyTextInHtmlPos = htmlPlainText.indexOf(bodyText);
            if (bodyTextInHtmlPos >= 0) {
              // Calculate the offset in the HTML string where the text content starts
              // This is approximate - we map based on character positions
              const htmlTextStart = matchStart + bodyTextInHtmlPos;
              
              // Map bodyMaskBits to the EML positions
              // Since we found the HTML, we need to map the plain text positions to HTML positions
              // This is a simplified approach - map directly if lengths match
              let bitsMapped = 0;
              for (let i = 0; i < Math.min(bodyMaskBits.length, bodyText.length); i++) {
                const emlPos = htmlTextStart + i;
                if (emlPos < bits.length) {
                  bits[emlPos] = bodyMaskBits[i] || 0;
                  if (bodyMaskBits[i] === 1) bitsMapped++;
                }
              }
              bodyMapped = true;
            }
          } catch (e) {
            // Error parsing HTML for body mapping
          }
        }
      }
    }
    
    // 3. If still not found, try to find body content by looking for common email body markers
    let fallbackBodyStart = -1;
    if (!bodyMapped && bodyMaskBits.length > 0) {
      // Look for common patterns that indicate the start of email body
      // Try to find "\r\n\r\n" or "\n\n" which often separates headers from body
      const bodySeparator = originalEml.indexOf('\r\n\r\n');
      const bodyStart = bodySeparator >= 0 ? bodySeparator + 4 : originalEml.indexOf('\n\n') + 2;
      fallbackBodyStart = bodyStart;
      
      if (bodyStart > 0 && bodyStart < originalEml.length) {
        // Try to map bodyMaskBits starting from bodyStart position
        // This is a fallback - map the first part of bodyMaskBits
        const mappingLength = Math.min(bodyMaskBits.length, originalEml.length - bodyStart);
        let bitsMapped = 0;
        for (let i = 0; i < mappingLength; i++) {
          if (bodyStart + i < bits.length) {
            bits[bodyStart + i] = bodyMaskBits[i] || 0;
            if (bodyMaskBits[i] === 1) bitsMapped++;
          }
        }
        if (bitsMapped > 0) {
          bodyMapped = true;
        }
      }
    }
    
    // Store the body mapping position for later extraction
    const bodyMappingPosition = fallbackBodyStart >= 0 ? fallbackBodyStart : -1;
    
    const totalBitsSet = bits.reduce((a, b) => a + b, 0);

    return {
      eml: originalEml,
      bits,
      mask: bits.join(""),
    };
  }, [
    email.originalEml,
    email.from,
    email.to,
    email.time,
    email.subject,
    bodyText,
    fromMaskBits,
    toMaskBits,
    timeMaskBits,
    subjectMaskBits,
    bodyMaskBits,
  ]);

  // Update header and body masks whenever mask bits change
  // Extract masks from aggregatedMask to preserve original EML file order
  useEffect(() => {
    if (!onMaskChange) return;

    // Use aggregatedMask which maps mask bits to original EML file positions
    const emlContent = email.originalEml || aggregatedMask.eml;
    const allBits = aggregatedMask.bits;

    // Find where the body starts in the EML (after header section)
    // Headers are separated from body by \r\n\r\n or \n\n
    const bodySeparator = emlContent.indexOf('\r\n\r\n');
    let bodyStart = -1;
    if (bodySeparator >= 0) {
      bodyStart = bodySeparator + 4;
    } else {
      const newlineSeparator = emlContent.indexOf('\n\n');
      if (newlineSeparator >= 0) {
        bodyStart = newlineSeparator + 2;
      }
    }

    // Extract header mask: everything before the body
    // If bodyStart is invalid, use all bits as header (fallback)
    const headerMask = bodyStart > 0 && bodyStart < allBits.length
      ? allBits.slice(0, bodyStart)
      : allBits;

    // Extract body mask: everything from body start to end
    // If bodyStart is invalid, use empty array (fallback)
    const bodyMask = bodyStart > 0 && bodyStart < allBits.length
      ? allBits.slice(bodyStart)
      : [];

    onMaskChange(headerMask, bodyMask);
  }, [
    aggregatedMask,
    email.originalEml,
    onMaskChange,
  ]);

  // Update emailMask state whenever aggregatedMask changes
  useEffect(() => {
    setEmailMask(aggregatedMask);
  }, [aggregatedMask]);

  // Extract and store body mask bits from emailMask for the ENTIRE body section in EML
  useEffect(() => {
    if (!emailMask || !email.originalEml) {
      setBodyMaskInfo(null);
      return;
    }
    
    // Find where the body starts in the EML
    const bodySeparator = email.originalEml.indexOf('\r\n\r\n');
    const bodyStart = bodySeparator >= 0 ? bodySeparator + 4 : email.originalEml.indexOf('\n\n') + 2;
    
    if (bodyStart > 0 && bodyStart < emailMask.bits.length) {
      // Extract bits for the ENTIRE body section (from bodyStart to end of EML)
      // This represents all mask bits for the body in the original EML file
      const bodyEnd = emailMask.bits.length;
      const bodyBits = emailMask.bits.slice(bodyStart, bodyEnd);
      const bodyBitsSum = bodyBits.reduce((a, b) => a + b, 0);
      
      setBodyMaskInfo({
        startPosition: bodyStart,
        bits: bodyBits,
        sum: bodyBitsSum,
        length: bodyBits.length,
        note: `Body mask bits for entire EML body section (${bodyBits.length} chars, from position ${bodyStart} to ${bodyEnd})`
      });
    } else {
      setBodyMaskInfo(null);
    }
  }, [emailMask, email.originalEml]);


  return (
    <div className="bg-[#EAEAEA] p-4 md:p-6 h-[calc(100vh-48px-64px)] md:h-[calc(100vh-104px)] overflow-auto">
      <div className="flex flex-col gap-4 md:gap-3">
        <EmailField
          label="From"
          value={email.from}
          isMasked={maskedFields.has("from")}
          onToggleMask={onToggleMask ? () => onToggleMask("from") : undefined}
          maskBits={fromMaskBits}
          onMaskBitsChange={setFromMaskBitsWithHistory}
          restrictToNameOnly={true}
        />

        <DashedBorder />

        <EmailField
          label="To"
          value={email.to}
          isMasked={maskedFields.has("to")}
          onToggleMask={onToggleMask ? () => onToggleMask("to") : undefined}
          maskBits={toMaskBits}
          onMaskBitsChange={setToMaskBitsWithHistory}
        />

        <DashedBorder />

        <EmailField
          label="Sent On"
          value={email.time}
          isMasked={maskedFields.has("time")}
          onToggleMask={onToggleMask ? () => onToggleMask("time") : undefined}
          maskBits={timeMaskBits}
          onMaskBitsChange={setTimeMaskBitsWithHistory}
        />

        <DashedBorder />

        <EmailField
          label="Subject"
          value={email.subject}
          isMasked={maskedFields.has("subject")}
          onToggleMask={
            onToggleMask ? () => onToggleMask("subject") : undefined
          }
          maskBits={subjectMaskBits}
          onMaskBitsChange={setSubjectMaskBitsWithHistory}
        />

        <DashedBorder />

        <div className="flex flex-col md:flex-row gap-4 md:gap-1 md:h-[200px] items-start relative">
          <div className="flex items-center justify-between md:justify-start md:w-30 w-full">
            <span className="w-auto">
              <span className="text-[#111314] bg-[#F5F3EF] text-base font-normal w-fit px-3 py-1 md:py-0.5 border border-[#F5F3EF]">
                Body
              </span>
            </span>
            {onToggleMask && (
              <button
                onClick={() => onToggleMask("body")}
                className="flex items-center gap-1 cursor-pointer p-0 md:hidden"
                type="button"
              >
                <div className="w-5 h-5 flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={maskedFields.has("body")}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (onToggleMask) {
                        onToggleMask("body");
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    className="w-5 h-5 cursor-pointer accent-[#3B3B3B]"
                  />
                </div>
                <span className="text-[#3B3B3B] text-base font-normal text-right">
                  {maskedFields.has("body") ? "Show all" : "Hide all"}
                </span>
              </button>
            )}
          </div>
          <div
            ref={bodyContainerRef}
            id="email-body-container"
            className="flex-1 w-full md:w-auto text-[#111314] text-base font-normal whitespace-pre-wrap relative select-text email-body-scoped"
            onMouseUp={handleMouseUpOnBody}
            onMouseDown={() => {
              // Clear selection when clicking elsewhere
              if (hasActiveSelection) {
                clearSelectionState();
              }
            }}
            style={
              {
                // Custom selection color
                "--selection-bg": "#5e6ad2",
                "--selection-color": "#ffffff",
                // CSS containment to prevent style leakage
                contain: "style layout",
                isolation: "isolate",
              } as React.CSSProperties
            }
            dangerouslySetInnerHTML={{ __html: maskedBodyHtml }}
          ></div>
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
                className={`text-left px-3 py-0.5 text-sm hover:bg-[#206AC2]hover:text-white rounded-lg transition-colors ${
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
          {onToggleMask && (
            <button
              onClick={() => onToggleMask("body")}
              className="hidden md:flex items-center gap-2 cursor-pointer p-0"
              type="button"
            >
              <div className="w-5 h-5 flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={maskedFields.has("body")}
                  onChange={(e) => {
                    e.stopPropagation();
                    if (onToggleMask) {
                      onToggleMask("body");
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className="w-5 h-5 cursor-pointer accent-[#3B3B3B]"
                />
              </div>
              <span className="text-[#3B3B3B] text-base font-normal text-right">
                {maskedFields.has("body") ? "Show all" : "Hide all"}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
