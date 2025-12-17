"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import EmailField from "./EmailField";
import DashedBorder from "./DashedBorder";

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
  email: {
    from: string;
    to: string;
    time: string;
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    originalEml?: string; // Original EML file content
    dkimCanonicalizedHeaders?: string; // DKIM-canonicalized headers for accurate header masking
    dkimCanonicalizedBody?: string; // DKIM-canonicalized body for accurate body masking
    ranges?: {
      from?: { rawStart: number; displayOffset: number; displayLength: number };
      to?: { rawStart: number; displayOffset: number; displayLength: number };
      time?: { rawStart: number; displayOffset: number; displayLength: number };
      subject?: { rawStart: number; displayOffset: number; displayLength: number };
    };
  };
  isMasked?: boolean;
  onToggleMask?: (field: string) => void;
  resetTrigger?: number; // When this changes, reset all mask bits
  maskedFields?: Set<string>; // Set of field names that are masked
  onUndoRedoStateChange?: (canUndo: boolean, canRedo: boolean) => void; // Callback to update undo/redo button states
  onUndoRedoHandlersReady?: (handlers: { undo: () => void; redo: () => void }) => void; // Callback to provide undo/redo handlers
  onMaskChange?: (headerMask: number[], bodyMask: number[]) => void; // Callback to update header and body masks
  onHasMaskedContentChange?: (hasMasked: boolean) => void; // Callback to indicate if any content is masked in UI
  onMaskedFieldsSync?: (fields: Set<string>) => void; // Callback to sync maskedFields when maskBits change
  disableSelectionMasking?: boolean; // If true, disable text selection masking functionality
  useBlackMask?: boolean; // If true, use solid black mask instead of semi-transparent red
  initialMaskBits?: {
    fromMaskBits?: number[];
    toMaskBits?: number[];
    timeMaskBits?: number[];
    subjectMaskBits?: number[];
    bodyMaskBits?: number[];
  }; // Initial mask bits to use (for verify page)
}

export default function EmailCard({
  email,
  onToggleMask,
  resetTrigger,
  maskedFields = new Set(),
  onUndoRedoStateChange,
  onUndoRedoHandlersReady,
  onMaskChange,
  onHasMaskedContentChange,
  onMaskedFieldsSync,
  disableSelectionMasking = false,
  useBlackMask = false,
  initialMaskBits,
}: EmailCardProps) {
  const bodyText = email.bodyText ?? "";

  // Track which context menu (if any) is currently active: one of the header fields or "body"
  const [activeContext, setActiveContext] = useState<"from" | "to" | "time" | "subject" | "body" | null>(null);

  // Mask bits for all fields - use useMemo to compute initial values
  // Circuit-aligned semantics: 1 = reveal, 0 = mask
  const initialFromBits = useMemo(
    () => new Array(email.from.length).fill(1),
    [email.from.length]
  );
  const initialToBits = useMemo(
    () => new Array(email.to.length).fill(1),
    [email.to.length]
  );
  const initialTimeBits = useMemo(
    () => new Array(email.time.length).fill(1),
    [email.time.length]
  );
  const initialSubjectBits = useMemo(
    () => new Array(email.subject.length).fill(1),
    [email.subject.length]
  );
  const initialBodyBits = useMemo(
    () => new Array(bodyText.length).fill(1),
    [bodyText.length]
  );

  const [fromMaskBits, setFromMaskBits] = useState<number[]>(
    initialMaskBits?.fromMaskBits && initialMaskBits.fromMaskBits.length === email.from.length
      ? initialMaskBits.fromMaskBits
      : initialFromBits
  );
  const [toMaskBits, setToMaskBits] = useState<number[]>(
    initialMaskBits?.toMaskBits && initialMaskBits.toMaskBits.length === email.to.length
      ? initialMaskBits.toMaskBits
      : initialToBits
  );
  const [timeMaskBits, setTimeMaskBits] = useState<number[]>(
    initialMaskBits?.timeMaskBits && initialMaskBits.timeMaskBits.length === email.time.length
      ? initialMaskBits.timeMaskBits
      : initialTimeBits
  );
  const [subjectMaskBits, setSubjectMaskBits] = useState<number[]>(
    initialMaskBits?.subjectMaskBits && initialMaskBits.subjectMaskBits.length === email.subject.length
      ? initialMaskBits.subjectMaskBits
      : initialSubjectBits
  );
  const [bodyMaskBits, setBodyMaskBits] = useState<number[]>(
    initialMaskBits?.bodyMaskBits && initialMaskBits.bodyMaskBits.length === bodyText.length
      ? initialMaskBits.bodyMaskBits
      : initialBodyBits
  );

  // Track previous maskedFields so we only touch the field that changed
  const prevMaskedFieldsRef = useRef<Set<string>>(new Set());

  // Update mask bits when a field's masked/unmasked toggle changes
  // Avoid overwriting user selections on other fields.
  useEffect(() => {
    // Skip if initialMaskBits is provided (verify page uses initialMaskBits directly)
    if (initialMaskBits) {
      return;
    }

    const prev = prevMaskedFieldsRef.current;
    const updateField = (
      fieldKey: string,
      length: number,
      setter: (bits: number[]) => void
    ) => {
      const wasMasked = prev.has(fieldKey);
      const isMaskedNow = maskedFields.has(fieldKey);
      if (wasMasked === isMaskedNow) return;
      // Circuit-aligned: 0 = hide, 1 = reveal
      setter(new Array(length).fill(isMaskedNow ? 0 : 1));
    };

    updateField("from", email.from.length, setFromMaskBits);
    updateField("to", email.to.length, setToMaskBits);
    updateField("time", email.time.length, setTimeMaskBits);
    updateField("subject", email.subject.length, setSubjectMaskBits);
    updateField("body", bodyText.length, setBodyMaskBits);

    prevMaskedFieldsRef.current = new Set(maskedFields);
  }, [maskedFields, email.from.length, email.to.length, email.time.length, email.subject.length, bodyText.length, initialMaskBits]);

  // Update mask bits when initialMaskBits changes (for verify page)
  useEffect(() => {
    if (!initialMaskBits) return;

    if (initialMaskBits.fromMaskBits && initialMaskBits.fromMaskBits.length === email.from.length) {
      setFromMaskBits(initialMaskBits.fromMaskBits);
    }
    if (initialMaskBits.toMaskBits && initialMaskBits.toMaskBits.length === email.to.length) {
      setToMaskBits(initialMaskBits.toMaskBits);
    }
    if (initialMaskBits.timeMaskBits && initialMaskBits.timeMaskBits.length === email.time.length) {
      setTimeMaskBits(initialMaskBits.timeMaskBits);
    }
    if (initialMaskBits.subjectMaskBits && initialMaskBits.subjectMaskBits.length === email.subject.length) {
      setSubjectMaskBits(initialMaskBits.subjectMaskBits);
    }
    if (initialMaskBits.bodyMaskBits && initialMaskBits.bodyMaskBits.length === bodyText.length) {
      setBodyMaskBits(initialMaskBits.bodyMaskBits);
    }
  }, [initialMaskBits, email.from.length, email.to.length, email.time.length, email.subject.length, bodyText.length]);

  // Debug: Log masking state
  useEffect(() => {
  }, [useBlackMask, maskedFields, initialMaskBits, fromMaskBits, toMaskBits, timeMaskBits, subjectMaskBits, bodyMaskBits]);

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
      // Circuit-aligned semantics: 1 = reveal (all revealed by default)
      const resetState: MaskBitsState = {
        fromMaskBits: new Array(email.from.length).fill(1),
        toMaskBits: new Array(email.to.length).fill(1),
        timeMaskBits: new Array(email.time.length).fill(1),
        subjectMaskBits: new Array(email.subject.length).fill(1),
        bodyMaskBits: new Array(bodyText.length).fill(1),
      };
      setTimeout(() => {
        setFromMaskBits(resetState.fromMaskBits);
        setToMaskBits(resetState.toMaskBits);
        setTimeMaskBits(resetState.timeMaskBits);
        setSubjectMaskBits(resetState.subjectMaskBits);
        setBodyMaskBits(resetState.bodyMaskBits);
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
    // Circuit-aligned: default to revealed (1) if length mismatch
    return {
      fromMaskBits: fromMaskBits.length === email.from.length ? [...fromMaskBits] : new Array(email.from.length).fill(1),
      toMaskBits: toMaskBits.length === email.to.length ? [...toMaskBits] : new Array(email.to.length).fill(1),
      timeMaskBits: timeMaskBits.length === email.time.length ? [...timeMaskBits] : new Array(email.time.length).fill(1),
      subjectMaskBits: subjectMaskBits.length === email.subject.length ? [...subjectMaskBits] : new Array(email.subject.length).fill(1),
      bodyMaskBits: bodyMaskBits.length === bodyText.length ? [...bodyMaskBits] : new Array(bodyText.length).fill(1),
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
    // Calculate what the new bits will be (default to revealed=1 if length mismatch)
    const newBits = typeof bits === 'function'
      ? bits(fromMaskBits.length === email.from.length ? [...fromMaskBits] : new Array(email.from.length).fill(1))
      : bits;
    // Mark that we need to save history after the state updates
    pendingHistorySaveRef.current = { field: 'from', newBits };
  }, [fromMaskBits, email.from.length]);

  const setToMaskBitsWithHistory = useCallback((bits: number[] | ((prev: number[]) => number[])) => {
    setToMaskBits(bits);
    const newBits = typeof bits === 'function'
      ? bits(toMaskBits.length === email.to.length ? [...toMaskBits] : new Array(email.to.length).fill(1))
      : bits;
    pendingHistorySaveRef.current = { field: 'to', newBits };
  }, [toMaskBits, email.to.length]);

  const setTimeMaskBitsWithHistory = useCallback((bits: number[] | ((prev: number[]) => number[])) => {
    setTimeMaskBits(bits);
    const newBits = typeof bits === 'function'
      ? bits(timeMaskBits.length === email.time.length ? [...timeMaskBits] : new Array(email.time.length).fill(1))
      : bits;
    pendingHistorySaveRef.current = { field: 'time', newBits };
  }, [timeMaskBits, email.time.length]);

  const setSubjectMaskBitsWithHistory = useCallback((bits: number[] | ((prev: number[]) => number[])) => {
    setSubjectMaskBits(bits);
    const newBits = typeof bits === 'function'
      ? bits(subjectMaskBits.length === email.subject.length ? [...subjectMaskBits] : new Array(email.subject.length).fill(1))
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
      // Reset all mask bits to initial state (all ones = revealed)
      // Circuit-aligned semantics: 1 = reveal
      const resetState: MaskBitsState = {
        fromMaskBits: new Array(email.from.length).fill(1),
        toMaskBits: new Array(email.to.length).fill(1),
        timeMaskBits: new Array(email.time.length).fill(1),
        subjectMaskBits: new Array(email.subject.length).fill(1),
        bodyMaskBits: new Array(bodyText.length).fill(1),
      };
      setTimeout(() => {
        setFromMaskBits(resetState.fromMaskBits);
        setToMaskBits(resetState.toMaskBits);
        setTimeMaskBits(resetState.timeMaskBits);
        setSubjectMaskBits(resetState.subjectMaskBits);
        setBodyMaskBits(resetState.bodyMaskBits);
        // Clear any active selections
        const sel = window.getSelection();
        if (sel) sel.removeAllRanges();
        // Note: clearSelectionState will be called, but we need to clear refs manually here
        // since clearSelectionState might not be accessible in this effect
        savedSelectionRangeRef.current = null;
        savedSelectionOffsetsRef.current = null;
        setShowMaskButton(false);
        setCurrentSelection(null);
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
  const bodyMenuRef = useRef<HTMLDivElement | null>(null);
  const savedSelectionRangeRef = useRef<Range | null>(null);
  const savedSelectionOffsetsRef = useRef<{ start: number; end: number } | null>(null);
  const [showMaskButton, setShowMaskButton] = useState(false);
  const [maskButtonPosition, setMaskButtonPosition] = useState<{
    x: number;
    y: number;
  }>({ x: 0, y: 0 });
  const [currentSelection, setCurrentSelection] =
    useState<SelectionInfo | null>(null);
  const [clearTrigger, setClearTrigger] = useState(0);

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
        if (currentMask === 0) {
          if (useBlackMask) {
            // Solid black mask - completely hides the text
            // Use inline styles to ensure the black background is applied
            result += `<span style="background-color: #000000; color: #000000; display: inline;">${escapedSegment}</span>`;
          } else {
            // Semi-transparent red mask with line-through (original style)
          result += `<span class="line-through decoration-black bg-[#92929280] decoration-1 opacity-80">${escapedSegment}</span>`;
          }
        } else {
          result += escapedSegment;
        }
        index = end;
      }

      return result;
    },
    [escapeHtml, useBlackMask]
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
      } catch {
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

        // If still not found, try aligning by leading whitespace difference
        // htmlPlainText might have leading whitespace that bodyText doesn't have
        if (bodyTextStartPos < 0 && bodyText.length > 0) {
          // Count leading whitespace in htmlPlainText
          let htmlLeadingWs = 0;
          while (htmlLeadingWs < htmlPlainText.length &&
                 (htmlPlainText[htmlLeadingWs] === ' ' ||
                  htmlPlainText[htmlLeadingWs] === '\n' ||
                  htmlPlainText[htmlLeadingWs] === '\r' ||
                  htmlPlainText[htmlLeadingWs] === '\t')) {
            htmlLeadingWs++;
          }

          // Count leading whitespace in bodyText
          let bodyLeadingWs = 0;
          while (bodyLeadingWs < bodyText.length &&
                 (bodyText[bodyLeadingWs] === ' ' ||
                  bodyText[bodyLeadingWs] === '\n' ||
                  bodyText[bodyLeadingWs] === '\r' ||
                  bodyText[bodyLeadingWs] === '\t')) {
            bodyLeadingWs++;
          }

          // If htmlPlainText has more leading whitespace, that's our offset
          if (htmlLeadingWs > bodyLeadingWs) {
            bodyTextStartPos = htmlLeadingWs - bodyLeadingWs;
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
          // Default to revealed (1) for unmatched positions
          expandedBits = new Array(htmlTextLength).fill(1);

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
              if (currentMask === 0) {
                const span = doc.createElement("span");
                if (useBlackMask) {
                  span.style.backgroundColor = "#000000";
                  span.style.color = "#000000";
                  span.style.display = "inline";
                } else {
                  span.className = "line-through decoration-black bg-[#92929280] decoration-1 opacity-80";
                }
                span.textContent = segmentText;
                fragments.push(span);
              } else {
                fragments.push(doc.createTextNode(segmentText));
              }
              globalIndex += segmentEnd - localIndex;
              localIndex = segmentEnd;
            }

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
      } catch {
        return html;
      }
    },
    [bodyText, createMaskedHtmlFromPlainText, scopeHtmlContent, useBlackMask]
  );


  // Create a string representation of bodyMaskBits to use as a dependency
  // This ensures useMemo recalculates when the array contents change
  const bodyMaskBitsKey = useMemo(() => {
    return bodyMaskBits.join(',');
  }, [bodyMaskBits]);

  const maskedBodyHtml = useMemo(() => {
    // Ensure bodyMaskBits has the correct length
    // Default to revealed (1) if length mismatch
    const bits = bodyMaskBits.length === bodyText.length
      ? bodyMaskBits
      : new Array(bodyText.length).fill(1);

    // Prioritize plain text rendering to avoid coordinate space mismatch
    // between HTML content and bodyText (used for mask bits).
    // For multipart emails, bodyText and bodyHtml are independent MIME parts
    // with potentially different content, causing selection offset issues.
    if (bodyText) {
      return createMaskedHtmlFromPlainText(bodyText, bits);
    }
    if (email.bodyHtml) {
      return createMaskedHtmlFromHtml(email.bodyHtml, bits);
    }
    return '';
  }, [
    email.bodyHtml,
    bodyText,
    bodyMaskBitsKey, // Use the string key instead of the array
    createMaskedHtmlFromPlainText,
    createMaskedHtmlFromHtml,
    useBlackMask,
  ]);

  // Helper function to clear selection state
  const clearSelectionState = useCallback(() => {
    savedSelectionRangeRef.current = null;
    savedSelectionOffsetsRef.current = null;
    setShowMaskButton(false);
    setCurrentSelection(null);
  }, []);

  // Trigger to clear all popups (body + all header fields)
  const triggerClearAllPopups = useCallback(() => {
    setClearTrigger(prev => prev + 1);
    clearSelectionState();
    setActiveContext(null);
  }, [clearSelectionState]);

  const handleMouseUpOnBody = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // If selection masking is disabled, don't show mask buttons
    if (disableSelectionMasking) {
      return;
    }
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

    // Fix: Account for leading whitespace difference between container DOM and bodyText
    // The container's textContent may have leading newlines from HTML structure
    // that don't exist in the original bodyText
    const containerText = container.textContent || '';
    let leadingOffset = 0;
    // Count leading whitespace in container that doesn't exist in bodyText
    while (leadingOffset < containerText.length &&
           leadingOffset < selectionStart &&
           (containerText[leadingOffset] === '\n' || containerText[leadingOffset] === '\r') &&
           (leadingOffset >= bodyText.length || containerText[leadingOffset] !== bodyText[leadingOffset])) {
      leadingOffset++;
    }

    // Adjust selection positions by subtracting the leading offset
    selectionStart = selectionStart - leadingOffset;
    selectionEnd = selectionEnd - leadingOffset;

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
    // Default to revealed (1) if length mismatch
    const currentBodyMaskBits = bodyMaskBits.length === bodyText.length
      ? bodyMaskBits
      : new Array(bodyText.length).fill(1);

    const selectionBits = currentBodyMaskBits.slice(selectionStart, selectionEnd);
    if (selectionBits.length === 0) {
      clearSelectionState();
      return;
    }

    const allMasked = selectionBits.every((bit) => bit === 0);
    const allUnmasked = selectionBits.every((bit) => bit === 1);

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

    // Activate body context menu and deactivate header menus
    setActiveContext("body");

    setMaskButtonPosition({ x, y });
    setCurrentSelection({
      start: selectionStart,
      end: selectionEnd,
      maskState: maskStateForSelection,
    });
    setShowMaskButton(true);
  }, [bodyText, bodyMaskBits, clearSelectionState, disableSelectionMasking]);

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
      let node = walker.nextNode();
      while (node) {
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
    } catch {
      // Error restoring selection
    }
    return false;
  }, []);

  // Restore selection after DOM update when showMaskButton becomes true
  useLayoutEffect(() => {
    const savedRange = savedSelectionRangeRef.current;
    const offsets = savedSelectionOffsetsRef.current;

    if (!showMaskButton || !savedRange || !offsets) {
      return;
    }

    const container = bodyContainerRef.current;
    if (!container) {
      return;
    }

    // Use requestAnimationFrame to ensure DOM is fully updated
    requestAnimationFrame(() => {
      const selection = window.getSelection();
      if (selection) {
        try {
          const isStartInContainer =
            !!savedRange.startContainer &&
            container.contains(savedRange.startContainer);
          const isEndInContainer =
            !!savedRange.endContainer &&
            container.contains(savedRange.endContainer);
          const isTextNode =
            savedRange.startContainer?.nodeType === Node.TEXT_NODE &&
            savedRange.endContainer?.nodeType === Node.TEXT_NODE;

          if (isStartInContainer && isEndInContainer && isTextNode) {
            selection.removeAllRanges();
            selection.addRange(savedRange);
            if (savedRange.toString().length > 0) {
              return;
            }
          }
        } catch {
          // Fall through to offset-based restoration
        }
      }

      restoreSelectionFromOffsets(offsets.start, offsets.end);
    });
  }, [showMaskButton, restoreSelectionFromOffsets]);

  // Close body context menu when clicking outside
  useEffect(() => {
    if (!showMaskButton) return;

    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside the menu and outside the body container
      const target = event.target as Node;
      const isClickInsideMenu = bodyMenuRef.current?.contains(target);
      const isClickInsideBody = bodyContainerRef.current?.contains(target);

      if (!isClickInsideMenu && !isClickInsideBody) {
        clearSelectionState();
      }
    };

    // Use capture phase to catch clicks before they bubble
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showMaskButton, clearSelectionState]);

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
      // Default to revealed (1) if length mismatch
      const next =
        prev.length === bodyText.length
          ? [...prev]
          : new Array(bodyText.length).fill(1);
      const boundedStart = Math.max(0, Math.min(start, bodyText.length));
      const boundedEnd = Math.max(boundedStart, Math.min(end, bodyText.length));

      // Circuit-aligned: 0 = mask/hide
      for (let i = boundedStart; i < boundedEnd; i++) {
        next[i] = 0;
      }

      // Save the NEW state to history after the change
      // Construct the new state with the updated bodyMaskBits
      const newState: MaskBitsState = {
        fromMaskBits: fromMaskBits.length === email.from.length ? [...fromMaskBits] : new Array(email.from.length).fill(1),
        toMaskBits: toMaskBits.length === email.to.length ? [...toMaskBits] : new Array(email.to.length).fill(1),
        timeMaskBits: timeMaskBits.length === email.time.length ? [...timeMaskBits] : new Array(email.time.length).fill(1),
        subjectMaskBits: subjectMaskBits.length === email.subject.length ? [...subjectMaskBits] : new Array(email.subject.length).fill(1),
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
      // Default to revealed (1) if length mismatch
      const next =
        prev.length === bodyText.length
          ? [...prev]
          : new Array(bodyText.length).fill(1);
      const boundedStart = Math.max(0, Math.min(start, bodyText.length));
      const boundedEnd = Math.max(boundedStart, Math.min(end, bodyText.length));

      // Circuit-aligned: 1 = reveal/unmask
      for (let i = boundedStart; i < boundedEnd; i++) {
        next[i] = 1;
      }

      // Save the NEW state to history after the change
      // Construct the new state with the updated bodyMaskBits
      const newState: MaskBitsState = {
        fromMaskBits: fromMaskBits.length === email.from.length ? [...fromMaskBits] : new Array(email.from.length).fill(1),
        toMaskBits: toMaskBits.length === email.to.length ? [...toMaskBits] : new Array(email.to.length).fill(1),
        timeMaskBits: timeMaskBits.length === email.time.length ? [...timeMaskBits] : new Array(email.time.length).fill(1),
        subjectMaskBits: subjectMaskBits.length === email.subject.length ? [...subjectMaskBits] : new Array(email.subject.length).fill(1),
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

  /**
   * Removes all soft line breaks (=\r\n and =\n) from text while maintaining
   * a position map from cleaned positions back to original positions.
   *
   * @param text - The text to clean
   * @returns Object with cleaned text and position map
   */
  function removeAllSoftLineBreaks(text: string): {
    cleaned: string;
    positionMap: Map<number, number>; // cleaned position -> original position
  } {
    const positionMap = new Map<number, number>();
    let cleaned = '';
    let originalPos = 0;
    let cleanedPos = 0;

    while (originalPos < text.length) {
      // Check for =\r\n soft break (3 chars)
      if (
        originalPos + 2 < text.length &&
        text[originalPos] === '=' &&
        text[originalPos + 1] === '\r' &&
        text[originalPos + 2] === '\n'
      ) {
        originalPos += 3; // Skip the soft line break
      }
      // Check for =\n soft break (2 chars)
      else if (
        originalPos + 1 < text.length &&
        text[originalPos] === '=' &&
        text[originalPos + 1] === '\n'
      ) {
        originalPos += 2; // Skip the soft line break
      }
      else {
        positionMap.set(cleanedPos, originalPos);
        cleaned += text[originalPos];
        cleanedPos++;
        originalPos++;
      }
    }

    return { cleaned, positionMap };
  }

  /**
   * Generates search variants for a text string to handle encoding differences
   * between displayed text and canonicalized body.
   *
   * @param text - The text to generate variants for
   * @returns Array of search variants (original, HTML-encoded, etc.)
   */
  function generateSearchVariants(text: string): string[] {
    const variants: string[] = [text];

    // HTML entity encoding variant
    const htmlEncoded = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    if (htmlEncoded !== text) {
      variants.push(htmlEncoded);
    }

    return variants;
  }

  /**
   * Searches for text in canonicalized body content, handling soft line breaks.
   * Returns all positions where the text is found.
   *
   * @param searchText - The text to search for
   * @param canonicalizedBody - The DKIM-canonicalized body
   * @returns Array of { start, length } for each match
   */
  function findAllOccurrences(
    searchText: string,
    canonicalizedBody: string
  ): Array<{ start: number; length: number }> {
    const results: Array<{ start: number; length: number }> = [];

    // Check if body uses quoted-printable (has soft line breaks)
    const hasQuotedPrintable = canonicalizedBody.includes('=\r\n') || canonicalizedBody.includes('=\n');

    // Generate all search variants
    const variants = generateSearchVariants(searchText);

    for (const variant of variants) {
      if (hasQuotedPrintable) {
        // Clean-then-search: remove soft breaks and use position mapping
        const { cleaned: cleanedBody, positionMap } = removeAllSoftLineBreaks(canonicalizedBody);
        const cleanedVariant = removeAllSoftLineBreaks(variant).cleaned;

        let searchPos = 0;
        while (searchPos < cleanedBody.length) {
          const foundInCleaned = cleanedBody.indexOf(cleanedVariant, searchPos);
          if (foundInCleaned === -1) break;

          // Map back to original positions
          const originalStart = positionMap.get(foundInCleaned);
          if (originalStart !== undefined) {
            // Calculate actual length in original (may include soft breaks)
            const endInCleaned = foundInCleaned + cleanedVariant.length - 1;
            const originalEnd = positionMap.get(endInCleaned);
            const matchLength = originalEnd !== undefined
              ? originalEnd - originalStart + 1
              : variant.length;

            results.push({ start: originalStart, length: matchLength });
          }

          searchPos = foundInCleaned + cleanedVariant.length;
        }
      } else {
        // Direct search
        let searchPos = 0;
        while (searchPos < canonicalizedBody.length) {
          const found = canonicalizedBody.indexOf(variant, searchPos);
          if (found === -1) break;

          results.push({ start: found, length: variant.length });
          searchPos = found + variant.length;
        }
      }
    }

    return results;
  }

  // Map mask bits to original EML file positions
  const aggregatedMask = useMemo(() => {
    if (!email.originalEml) {
      // Fallback: reconstruct EML if original not available
      // Circuit-aligned: 1 = reveal (labels should be revealed, not masked)
      const revealBits = (length: number) => new Array(length).fill(1);
      const segments = [
        { text: "From: ", bits: revealBits("From: ".length) },
        { text: email.from, bits: fromMaskBits },
        { text: "\n", bits: [1] },
        { text: "To: ", bits: revealBits("To: ".length) },
        { text: email.to, bits: toMaskBits },
        { text: "\n", bits: [1] },
        { text: "Date: ", bits: revealBits("Date: ".length) },
        { text: email.time, bits: timeMaskBits },
        { text: "\n", bits: [1] },
        { text: "Subject: ", bits: revealBits("Subject: ".length) },
        { text: email.subject, bits: subjectMaskBits },
        { text: "\n", bits: [1] },
        { text: "\n", bits: [1] },
        { text: bodyText, bits: bodyMaskBits },
      ];

      const eml = segments.map((segment) => segment.text).join("");
      const bits = segments.flatMap((segment) => {
        if (segment.bits.length === segment.text.length) {
          return segment.bits;
        }
        const fallback = revealBits(segment.text.length);
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
    // Circuit-aligned: 1 = reveal (start with everything revealed)
    const bits = new Array(originalEml.length).fill(1);

    // Helper to find and map field value in original EML
    // IMPORTANT: This function maps mask bits to the raw EML positions
    // For From and To fields, it searches for the email within angle brackets <email@example.com>
    // For other fields, it uses the header line pattern
    const mapFieldToOriginal = (fieldValue: string, fieldBits: number[], fieldName: string) => {
      if (!fieldValue || fieldBits.length === 0) {
        return;
      }

      // Find where the body starts (header separator)
      const bodySeparator = originalEml.indexOf('\r\n\r\n');
      const bodyStart = bodySeparator >= 0 ? bodySeparator : originalEml.indexOf('\n\n');
      const headersSection = bodyStart >= 0 ? originalEml.slice(0, bodyStart) : originalEml;

      // Map field name to header name (e.g., "time" -> "Date")
      let headerFieldName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
      if (fieldName === 'time') {
        headerFieldName = 'Date';
      }

      let actualValueStart = -1;
      let found = false;

      // Special handling for From and To fields (email addresses)
      if (fieldName === 'from' || fieldName === 'to') {
        // If we have ranges information, use it for exact positioning
        const rangeKey = fieldName as 'from' | 'to';
        if (email.ranges && email.ranges[rangeKey]) {
          const range = email.ranges[rangeKey];
          // rawStart is position after colon, displayOffset accounts for leading whitespace
          // The actual field value starts at rawStart + displayOffset
          actualValueStart = range.rawStart + range.displayOffset;
          found = true;
        } else {
          // Fallback: search for the header line
          const headerLinePattern = new RegExp(`^${headerFieldName}\\s*:.*$`, 'im');
          const headerLineMatch = headerLinePattern.exec(headersSection);

          if (headerLineMatch) {
            const lineStart = headerLineMatch.index;
            const line = headerLineMatch[0];
            const colonIndex = line.indexOf(':');

            if (colonIndex >= 0) {
              // Get everything after the colon
              const valueSection = line.slice(colonIndex + 1);

              // Look for angle brackets first - emails are often in <email@example.com> format
              const angleBracketStart = valueSection.indexOf('<');
              const angleBracketEnd = angleBracketStart >= 0 ? valueSection.indexOf('>', angleBracketStart) : -1;

              if (angleBracketStart >= 0 && angleBracketEnd > angleBracketStart) {
                // There are angle brackets, check if email is inside
                const contentInsideBrackets = valueSection.slice(angleBracketStart + 1, angleBracketEnd);
                const emailIndexInBrackets = contentInsideBrackets.indexOf(fieldValue);

                if (emailIndexInBrackets >= 0) {
                  // Email is inside brackets - position is after the <
                  actualValueStart = lineStart + colonIndex + 1 + angleBracketStart + 1 + emailIndexInBrackets;
                  found = true;
                } else {
                  // Email not found inside brackets, try direct search
                  const emailIndex = valueSection.indexOf(fieldValue);
                  if (emailIndex >= 0) {
                    actualValueStart = lineStart + colonIndex + 1 + emailIndex;
                    found = true;
                  }
                }
              } else {
                // No angle brackets, look for the email directly in the value section
                const emailIndex = valueSection.indexOf(fieldValue);
                if (emailIndex >= 0) {
                  // Skip leading whitespace
                  const leadingWhitespaceMatch = valueSection.slice(0, emailIndex).match(/\s*$/);
                  const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0].length : 0;
                  actualValueStart = lineStart + colonIndex + 1 + emailIndex - leadingWhitespace;
                  found = true;
                }
              }
            }
          }
        }
      } else {
        // For other fields (time, subject), use the header line pattern approach
        // Escape special regex characters in field value
        const escapedValue = fieldValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        // Search for header line: "HeaderName: value" (allowing for whitespace)
        const headerPattern = new RegExp(
          `^${headerFieldName}\\s*:\\s*${escapedValue}`,
          'im'
        );
        const headerMatch = headerPattern.exec(headersSection);

        if (headerMatch) {
          // Find the colon to get the start of the value
          const lineStart = headerMatch.index;
          const line = headerMatch[0];
          const colonIndex = line.indexOf(':');
          if (colonIndex >= 0) {
            // Get the value part (after colon and any whitespace)
            const valueStartInLine = colonIndex + 1;
            // Skip leading whitespace
            const leadingWhitespaceMatch = line.slice(valueStartInLine).match(/^\s*/);
            const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0].length : 0;
            actualValueStart = lineStart + colonIndex + 1 + leadingWhitespace;
            found = true;
          }
        } else {
          // Fallback: search for header line and then find value within it
          const headerLinePattern = new RegExp(`^${headerFieldName}\\s*:.*$`, 'im');
          const headerLineMatch = headerLinePattern.exec(headersSection);

          if (headerLineMatch) {
            const lineStart = headerLineMatch.index;
            const line = headerLineMatch[0];
            const colonIndex = line.indexOf(':');
            if (colonIndex >= 0) {
              // Get everything after the colon
              const valueSection = line.slice(colonIndex + 1);
              // Find the field value within this section
              const valueIndex = valueSection.indexOf(fieldValue);
              if (valueIndex >= 0) {
                // Skip leading whitespace before the value
                const leadingWhitespaceMatch = valueSection.slice(0, valueIndex).match(/\s*$/);
                const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0].length : 0;
                actualValueStart = lineStart + colonIndex + 1 + valueIndex - leadingWhitespace;
                found = true;
              }
            }
          }
        }
      }

      // Map the mask bits to the found position
      if (found && actualValueStart >= 0) {
        const minLength = Math.min(fieldBits.length, fieldValue.length);
        for (let i = 0; i < minLength; i++) {
          if (actualValueStart + i < bits.length && actualValueStart + i >= 0) {
            bits[actualValueStart + i] = fieldBits[i] || 0;
          }
        }
      } else if (fieldName === 'from' || fieldName === 'to') {
        console.warn(`[EmailCard] Failed to map "${fieldName}" into original EML – not found or invalid position`);
      }
    };

    // Header masking: create a separate mask array for canonicalized headers
    // The circuit receives canonicalized headers, so the mask must align with those positions
    const canonicalizedHeaders = email.dkimCanonicalizedHeaders;
    let canonicalHeaderBits: number[] | null = null;

    if (canonicalizedHeaders) {
      // Create header mask array sized to canonicalized headers (not original EML)
      canonicalHeaderBits = new Array(canonicalizedHeaders.length).fill(1);

      // Helper to find the range of a specific header line in canonicalized headers
      // Returns { start, end } where start is after "fieldname:" and end is before next header
      // IMPORTANT: Must match header name at line start to avoid matching substrings
      // (e.g., "to:" should not match inside "reply-to:")
      const findHeaderLineRange = (headerName: string): { start: number; end: number } | null => {
        // Canonicalized headers use lowercase header names
        const headerPrefix = headerName.toLowerCase() + ':';

        // Search for header at start of string or after newline to avoid substring matches
        let headerStart = -1;

        if (canonicalizedHeaders.startsWith(headerPrefix)) {
          headerStart = 0;
        } else {
          // Search for header after newline
          const patterns = ['\r\n' + headerPrefix, '\n' + headerPrefix];
          for (const pattern of patterns) {
            const pos = canonicalizedHeaders.indexOf(pattern);
            if (pos >= 0) {
              headerStart = pos + pattern.length - headerPrefix.length;
              break;
            }
          }
        }

        if (headerStart < 0) {
          console.warn(
            `[EmailCard] Header "${headerName}" prefix "${headerPrefix}" not found in canonicalized headers`,
          );
          return null;
        }

        // Start of value is after the colon
        const valueStart = headerStart + headerPrefix.length;

        // End is at the next line break (\r\n or \n) or end of headers
        // NOTE: Line breaks are the correct approach per RFC 5322 (email format) and RFC 6376 (DKIM).
        // Email headers are line-delimited by spec. We can't split upfront because we need
        // exact byte positions for mask bit mapping.
        let valueEnd = canonicalizedHeaders.indexOf('\r\n', valueStart);
        if (valueEnd < 0) {
          // Try just \n (some systems use LF only)
          valueEnd = canonicalizedHeaders.indexOf('\n', valueStart);
        }
        if (valueEnd < 0) {
          valueEnd = canonicalizedHeaders.length;
        }
        return { start: valueStart, end: valueEnd };
      };

      // Text-search approach: find the exact field value in the header line, then apply mask bits
      const mapHeaderFieldMask = (fieldValue: string, fieldBits: number[], fieldName: string) => {
        if (!fieldValue || fieldBits.length === 0 || !canonicalHeaderBits) return;
        if (!fieldBits.some(bit => bit === 0)) return; // No masking needed

        // Map field name to header name
        let headerName = fieldName;
        if (fieldName === 'time') headerName = 'date';

        // Find the range of this specific header line
        const headerRange = findHeaderLineRange(headerName);
        if (!headerRange) {
          console.warn(`[HEADER MASK] ${fieldName}: header line "${headerName}:" not found in canonicalized headers`);
          return;
        }

        // Get the header line content for searching
        const headerLineContent = canonicalizedHeaders.slice(headerRange.start, headerRange.end);

        // Robust search: try multiple strategies to find the field value
        // These are FALLBACK strategies - each is only tried if the previous one failed.
        // This handles variations in how email addresses appear in headers:
        // - Exact match works for simple cases
        // - Case-insensitive handles DKIM canonicalization lowercasing
        // - Angle brackets handles "Display Name" <email@example.com> format
        let fieldValuePos = -1;
        let actualValueInHeader = fieldValue;

        // Strategy 1: Exact match (always tried first)
        fieldValuePos = headerLineContent.indexOf(fieldValue);

        // Strategy 2: Case-insensitive match (for email addresses)
        if (fieldValuePos < 0 && (fieldName === 'from' || fieldName === 'to')) {
          const lowerHeaderContent = headerLineContent.toLowerCase();
          const lowerFieldValue = fieldValue.toLowerCase();
          const lowerPos = lowerHeaderContent.indexOf(lowerFieldValue);
          if (lowerPos >= 0) {
            // Found case-insensitive match - use the original position
            fieldValuePos = lowerPos;
            // Get the actual value from the header (with original case)
            actualValueInHeader = headerLineContent.slice(lowerPos, lowerPos + fieldValue.length);
          }
        }

        // Strategy 3: Search for email within angle brackets
        if (fieldValuePos < 0 && (fieldName === 'from' || fieldName === 'to')) {
          // Look for <email@domain.com> pattern
          const angleBracketStart = headerLineContent.indexOf('<');
          const angleBracketEnd = angleBracketStart >= 0 ? headerLineContent.indexOf('>', angleBracketStart) : -1;
          if (angleBracketStart >= 0 && angleBracketEnd > angleBracketStart) {
            const emailInBrackets = headerLineContent.slice(angleBracketStart + 1, angleBracketEnd);
            // Case-insensitive comparison for email
            if (emailInBrackets.toLowerCase() === fieldValue.toLowerCase()) {
              fieldValuePos = angleBracketStart + 1;
              actualValueInHeader = emailInBrackets;
            }
          }
        }

        if (fieldValuePos < 0) {
          console.warn(
            `[EmailCard] Header mask: "${fieldName}" value "${fieldValue}" not found in canonicalized header line`,
          );
          return;
        }

        // Apply mask bits directly at the field value position
        // fieldBits[i] corresponds to fieldValue[i], which is at headerLineContent[fieldValuePos + i]
        const absoluteFieldStart = headerRange.start + fieldValuePos;

        for (let i = 0; i < Math.min(fieldBits.length, actualValueInHeader.length); i++) {
          if (fieldBits[i] === 0) {
            const absolutePos = absoluteFieldStart + i;
            if (absolutePos < canonicalHeaderBits.length) {
              canonicalHeaderBits[absolutePos] = 0;
            }
          }
        }
      };

      // Map each header field using text-search in canonicalized headers
      mapHeaderFieldMask(email.from, fromMaskBits, 'from');
      mapHeaderFieldMask(email.to, toMaskBits, 'to');
      mapHeaderFieldMask(email.time, timeMaskBits, 'time');
      mapHeaderFieldMask(email.subject, subjectMaskBits, 'subject');
    } else {
      // Fallback to position-based approach if no canonicalized headers available
      console.warn('[EmailCard] Header mask: no canonicalized headers available, falling back to position-based mapping');
      mapFieldToOriginal(email.from, fromMaskBits, 'from');
      mapFieldToOriginal(email.to, toMaskBits, 'to');
      mapFieldToOriginal(email.time, timeMaskBits, 'time');
      mapFieldToOriginal(email.subject, subjectMaskBits, 'subject');
    }

    // Body masking: create a separate mask array for canonicalized body
    // The circuit receives canonicalized body, so the mask must align with those positions
    const canonicalizedBody = email.dkimCanonicalizedBody;
    let canonicalBodyBits: number[] | null = null;

    if (canonicalizedBody) {
      // Create body mask array sized to canonicalized body (not raw EML body)
      canonicalBodyBits = new Array(canonicalizedBody.length).fill(1);
    }

    // Body masking: search directly in canonicalized body (no offset adjustments needed)
    // This mirrors the header masking approach that works reliably
    if (canonicalizedBody && canonicalBodyBits && bodyMaskBits.some(bit => bit === 0)) {
      // Extract masked text segments from displayed bodyText
      const maskedSegments: Array<{ text: string; displayStart: number; displayEnd: number }> = [];
      let i = 0;
      while (i < bodyMaskBits.length && i < bodyText.length) {
        if (bodyMaskBits[i] === 0) {
          const segmentStart = i;
          while (i < bodyMaskBits.length && bodyMaskBits[i] === 0) {
            i++;
          }
          const segmentEnd = i;
          const maskedText = bodyText.slice(segmentStart, segmentEnd);
          if (maskedText.length > 0) {
            maskedSegments.push({
              text: maskedText,
              displayStart: segmentStart,
              displayEnd: segmentEnd,
            });
          }
        } else {
          i++;
        }
      }

      // For each masked segment, find ALL occurrences in canonicalized body
      for (const segment of maskedSegments) {
        const occurrences = findAllOccurrences(segment.text, canonicalizedBody);

        // Mark ALL occurrences as masked in canonicalBodyBits
        for (const { start, length } of occurrences) {
          for (let j = 0; j < length; j++) {
            if (start + j < canonicalBodyBits.length) {
              canonicalBodyBits[start + j] = 0; // Circuit-aligned: 0 = mask/hide
            }
          }
        }
      }
    } else if (!canonicalizedBody && bodyMaskBits.some(bit => bit === 0)) {
      // Fallback: use old approach with raw EML if no canonicalized body
      console.warn('[EmailCard] Body mask: no canonicalized body available, falling back to raw EML search');

      const bodySeparator = originalEml.indexOf('\r\n\r\n');
      const bodyStart = bodySeparator >= 0 ? bodySeparator + 4 : originalEml.indexOf('\n\n') + 2;

      if (bodyStart > 0 && bodyStart < originalEml.length) {
        const rawBody = originalEml.slice(bodyStart);

        // Extract masked text segments from bodyText and search for them in rawBody
        let i = 0;
        while (i < bodyMaskBits.length && i < bodyText.length) {
          if (bodyMaskBits[i] === 0) {
            const segmentStart = i;
            while (i < bodyMaskBits.length && bodyMaskBits[i] === 0) {
              i++;
            }
            const maskedText = bodyText.slice(segmentStart, i);

            if (maskedText.length > 0) {
              const foundPos = rawBody.indexOf(maskedText, 0);
              if (foundPos !== -1) {
                const adjustedFoundPos = foundPos > 0 ? foundPos - 1 : foundPos;
                const absolutePos = bodyStart + adjustedFoundPos;
                for (let j = 0; j < maskedText.length; j++) {
                  if (absolutePos + j < bits.length) {
                    bits[absolutePos + j] = 0;
                  }
                }
              }
            }
          } else {
            i++;
          }
        }
      }
    }

    // Store the body mapping position for later extraction
    return {
      eml: originalEml,
      bits,
      mask: bits.join(""),
      canonicalHeaderBits, // Separate header mask for canonicalized headers (null if not available)
      canonicalBodyBits, // Separate body mask for canonicalized body (null if not available)
    };
  }, [
    email.originalEml,
    email.dkimCanonicalizedHeaders,
    email.dkimCanonicalizedBody,
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

    // Header mask: use canonicalHeaderBits if available (for DKIM-canonicalized headers)
    // Otherwise fall back to extracting from the combined bits array
    let headerMask: number[];
    if (aggregatedMask.canonicalHeaderBits) {
      // Use the separate header mask that's aligned with canonicalized headers
      headerMask = aggregatedMask.canonicalHeaderBits;
    } else {
      // Fallback: extract from combined bits (legacy behavior)
      headerMask = bodyStart > 0 && bodyStart < allBits.length
        ? allBits.slice(0, bodyStart)
        : allBits;
    }

    // Body mask: use canonicalBodyBits if available (for DKIM-canonicalized body)
    // Otherwise fall back to extracting from the combined bits array
    let bodyMask: number[];
    if (aggregatedMask.canonicalBodyBits) {
      // Use the separate body mask that's aligned with canonicalized body
      bodyMask = aggregatedMask.canonicalBodyBits;
    } else {
      // Fallback: extract from combined bits (legacy behavior)
      bodyMask = bodyStart > 0 && bodyStart < allBits.length
        ? allBits.slice(bodyStart)
        : [];
    }

    onMaskChange(headerMask, bodyMask);
  }, [
    aggregatedMask,
    email.originalEml,
    onMaskChange,
  ]);

  // Notify parent when any content is masked in the UI (directly from mask bit arrays)
  // This bypasses canonicalization issues and reflects actual UI state
  useEffect(() => {
    if (!onHasMaskedContentChange) return;

    const hasMasked =
      fromMaskBits.some(bit => bit === 0) ||
      toMaskBits.some(bit => bit === 0) ||
      timeMaskBits.some(bit => bit === 0) ||
      subjectMaskBits.some(bit => bit === 0) ||
      bodyMaskBits.some(bit => bit === 0);

    onHasMaskedContentChange(hasMasked);
  }, [
    fromMaskBits,
    toMaskBits,
    timeMaskBits,
    subjectMaskBits,
    bodyMaskBits,
    onHasMaskedContentChange,
  ]);

  // Sync maskedFields checkboxes based on whether all bits in a field are masked
  useEffect(() => {
    if (!onMaskedFieldsSync) return;

    const syncedFields = new Set<string>();
    if (fromMaskBits.length > 0 && fromMaskBits.every(bit => bit === 0)) {
      syncedFields.add("from");
    }
    if (toMaskBits.length > 0 && toMaskBits.every(bit => bit === 0)) {
      syncedFields.add("to");
    }
    if (timeMaskBits.length > 0 && timeMaskBits.every(bit => bit === 0)) {
      syncedFields.add("time");
    }
    if (subjectMaskBits.length > 0 && subjectMaskBits.every(bit => bit === 0)) {
      syncedFields.add("subject");
    }
    onMaskedFieldsSync(syncedFields);
  }, [fromMaskBits, toMaskBits, timeMaskBits, subjectMaskBits, onMaskedFieldsSync]);

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
          disableSelectionMasking={disableSelectionMasking}
          useBlackMask={useBlackMask}
          clearTrigger={clearTrigger}
          onFieldInteraction={triggerClearAllPopups}
          isActive={activeContext === "from"}
          onActivate={() => {
            // When a header field becomes active, clear body selection/menu
            clearSelectionState();
            setActiveContext("from");
          }}
        />

        <DashedBorder />

        <EmailField
          label="To"
          value={email.to}
          isMasked={maskedFields.has("to")}
          onToggleMask={onToggleMask ? () => onToggleMask("to") : undefined}
          maskBits={toMaskBits}
          onMaskBitsChange={setToMaskBitsWithHistory}
          disableSelectionMasking={disableSelectionMasking}
          useBlackMask={useBlackMask}
          clearTrigger={clearTrigger}
          onFieldInteraction={triggerClearAllPopups}
          isActive={activeContext === "to"}
          onActivate={() => {
            clearSelectionState();
            setActiveContext("to");
          }}
        />

        <DashedBorder />

        <EmailField
          label="Sent On"
          value={email.time}
          isMasked={maskedFields.has("time")}
          onToggleMask={onToggleMask ? () => onToggleMask("time") : undefined}
          maskBits={timeMaskBits}
          onMaskBitsChange={setTimeMaskBitsWithHistory}
          disableSelectionMasking={disableSelectionMasking}
          useBlackMask={useBlackMask}
          clearTrigger={clearTrigger}
          onFieldInteraction={triggerClearAllPopups}
          isActive={activeContext === "time"}
          onActivate={() => {
            clearSelectionState();
            setActiveContext("time");
          }}
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
          disableSelectionMasking={disableSelectionMasking}
          useBlackMask={useBlackMask}
          clearTrigger={clearTrigger}
          onFieldInteraction={triggerClearAllPopups}
          isActive={activeContext === "subject"}
          onActivate={() => {
            clearSelectionState();
            setActiveContext("subject");
          }}
        />

        <DashedBorder />

        <div className="flex flex-col md:flex-row gap-4 md:gap-1 md:h-[200px] items-start relative">
          <div className="flex items-center justify-between md:justify-start md:w-30 w-full">
            <span className="w-auto">
              <span className="text-[#111314] bg-[#F5F3EF] text-base font-normal w-fit px-3 py-1 md:py-0.5 border border-[#F5F3EF]">
                BODY
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
            onMouseDown={triggerClearAllPopups}
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
              ref={bodyMenuRef}
              className="absolute z-10 bg-[#F5F3EF] border flex flex-col border-[#D4D4D4] text-sm rounded-lg shadow-lg p-1 min-w-[60px] w-fit transition-all duration-150 hover:shadow-xl"
              style={{
                left: `${maskButtonPosition.x}px`,
                top: `${maskButtonPosition.y}px`,
              }}
              onClick={(e) => {
                // Stop propagation to prevent click-outside from closing menu immediately
                // The button onClick handlers will close the menu after action
                e.stopPropagation();
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleMaskSelection();
                  // Menu will close via handleMaskSelection clearing state
                }}
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
                onClick={(e) => {
                  e.stopPropagation();
                  handleUnmaskSelection();
                  // Menu will close via handleUnmaskSelection clearing state
                }}
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
