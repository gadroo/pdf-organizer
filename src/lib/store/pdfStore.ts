"use client";

import { create } from "zustand";

/**
 * Metadata returned from heuristics about the ordering decision.
 */
export interface OrderingMetadata {
  heuristicUsed?: string;
  confidence?: number;
  reasoning?: string[];
  processingTimeMs?: number;
}

/**
 * Represents a single PDF page in the editor.
 */
export interface PDFPage {
  /** Original page index (0-based) from the uploaded PDF */
  originalIndex: number;

  /** Current position in the reordered list */
  currentIndex: number;

  /** Thumbnail data URL (base64) */
  thumbnail: string | null;

  /** Detected page number from OCR (if found) */
  detectedPageNum: number | null;

  /** Confidence score for this page's ordering */
  confidence: number;

  /** Extracted text content */
  ocrText: string;
}

/**
 * State snapshot for undo/redo functionality.
 */
interface HistoryState {
  pageOrder: number[];
}

interface PDFStore {
  // === PDF Data ===
  /** Original PDF file bytes */
  pdfBytes: Uint8Array | null;

  /** Original filename */
  filename: string | null;

  /** Original order of pages as uploaded */
  initialOrder: number[];

  /** Suggested order returned by heuristics */
  suggestedOrder: number[];

  /** Whether the suggested order differs from the upload sequence */
  autoOrderChanged: boolean;

  /** Metadata about the ordering heuristic */
  orderingMeta: OrderingMetadata | null;

  /** All pages with their metadata */
  pages: PDFPage[];

  /** Current page order (indices into pages array) */
  pageOrder: number[];

  // === Selection ===
  /** Currently selected page indices */
  selectedIds: Set<number>;

  // === History ===
  /** Undo stack */
  undoStack: HistoryState[];

  /** Redo stack */
  redoStack: HistoryState[];

  // === Processing State ===
  /** Whether we're currently processing a PDF */
  isProcessing: boolean;

  /** Processing progress (0-100) */
  progress: number;

  /** Error message if processing failed */
  error: string | null;

  // === Actions ===
  /** Initialize store with uploaded PDF */
  setPdf: (bytes: Uint8Array, filename: string) => void;

  /** Set pages after OCR processing */
  setPages: (pages: PDFPage[], suggestedOrder: number[], meta?: OrderingMetadata | null) => void;

  /** Reorder pages (drag and drop) */
  reorderPages: (fromIndex: number, toIndex: number) => void;

  /** Delete selected pages */
  deleteSelected: () => void;

  /** Toggle page selection */
  toggleSelection: (index: number, shiftKey?: boolean) => void;

  /** Select all pages */
  selectAll: () => void;

  /** Clear selection */
  clearSelection: () => void;

  /** Undo last action */
  undo: () => void;

  /** Redo last undone action */
  redo: () => void;

  /** Set processing state */
  setProcessing: (isProcessing: boolean, progress?: number) => void;

  /** Set error state */
  setError: (error: string | null) => void;

  /** Reset store to initial state */
  reset: () => void;
}

const initialState = {
  pdfBytes: null,
  filename: null,
  initialOrder: [] as number[],
  suggestedOrder: [] as number[],
  autoOrderChanged: false,
  orderingMeta: null as OrderingMetadata | null,
  pages: [],
  pageOrder: [],
  selectedIds: new Set<number>(),
  undoStack: [],
  redoStack: [],
  isProcessing: false,
  progress: 0,
  error: null,
};

export const usePdfStore = create<PDFStore>((set, get) => ({
  ...initialState,

  setPdf: (bytes, filename) => {
    set({
      pdfBytes: bytes,
      filename,
      initialOrder: [],
      suggestedOrder: [],
      autoOrderChanged: false,
      orderingMeta: null,
      pages: [],
      pageOrder: [],
      selectedIds: new Set(),
      undoStack: [],
      redoStack: [],
      error: null,
    });
  },

  setPages: (pages, suggestedOrder, meta = null) => {
    const initialOrder = pages.map((_, i) => i);
    const normalizedSuggested = suggestedOrder.length === pages.length
      ? suggestedOrder
      : initialOrder;
    const autoOrderChanged = normalizedSuggested.some((pageIndex, idx) => pageIndex !== initialOrder[idx]);

    set({
      pages,
      pageOrder: normalizedSuggested,
      initialOrder,
      suggestedOrder: normalizedSuggested,
      autoOrderChanged,
      orderingMeta: meta,
      // Save original order to undo stack
      undoStack: [{ pageOrder: initialOrder }],
      redoStack: [],
      isProcessing: false,
      progress: 100,
    });
  },

  reorderPages: (fromIndex, toIndex) => {
    const { pageOrder, undoStack } = get();
    const newOrder = [...pageOrder];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);

    set({
      pageOrder: newOrder,
      undoStack: [...undoStack, { pageOrder }],
      redoStack: [],
    });
  },

  deleteSelected: () => {
    const { pageOrder, selectedIds, undoStack } = get();
    if (selectedIds.size === 0) return;

    const newOrder = pageOrder.filter((_, i) => !selectedIds.has(i));

    set({
      pageOrder: newOrder,
      selectedIds: new Set(),
      undoStack: [...undoStack, { pageOrder }],
      redoStack: [],
    });
  },

  toggleSelection: (index, shiftKey = false) => {
    const { selectedIds, pageOrder } = get();
    const newSelected = new Set(selectedIds);

    if (shiftKey && selectedIds.size > 0) {
      // Range selection
      const lastSelected = Math.max(...Array.from(selectedIds));
      const start = Math.min(lastSelected, index);
      const end = Math.max(lastSelected, index);
      for (let i = start; i <= end; i++) {
        if (i < pageOrder.length) {
          newSelected.add(i);
        }
      }
    } else {
      // Toggle single selection
      if (newSelected.has(index)) {
        newSelected.delete(index);
      } else {
        newSelected.add(index);
      }
    }

    set({ selectedIds: newSelected });
  },

  selectAll: () => {
    const { pageOrder } = get();
    set({ selectedIds: new Set(pageOrder.map((_, i) => i)) });
  },

  clearSelection: () => {
    set({ selectedIds: new Set() });
  },

  undo: () => {
    const { undoStack, redoStack, pageOrder } = get();
    if (undoStack.length === 0) return;

    const previousState = undoStack[undoStack.length - 1];
    set({
      pageOrder: previousState.pageOrder,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, { pageOrder }],
    });
  },

  redo: () => {
    const { undoStack, redoStack, pageOrder } = get();
    if (redoStack.length === 0) return;

    const nextState = redoStack[redoStack.length - 1];
    set({
      pageOrder: nextState.pageOrder,
      undoStack: [...undoStack, { pageOrder }],
      redoStack: redoStack.slice(0, -1),
    });
  },

  setProcessing: (isProcessing, progress = 0) => {
    set({ isProcessing, progress });
  },

  setError: (error) => {
    set({ error, isProcessing: false });
  },

  reset: () => {
    set(initialState);
  },
}));
