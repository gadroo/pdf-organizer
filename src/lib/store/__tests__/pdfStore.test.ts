import { usePdfStore } from '../pdfStore';

const createPages = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    originalIndex: index,
    currentIndex: index,
    thumbnail: null,
    detectedPageNum: null,
    confidence: 0.9,
    ocrText: `Page ${index + 1}`,
  }));

describe('usePdfStore', () => {
  beforeEach(() => {
    usePdfStore.getState().reset();
  });

  it('reorders pages and supports undo/redo', () => {
    const store = usePdfStore.getState();
    store.setPdf(new Uint8Array([1, 2, 3]), 'sample.pdf');
    store.setPages(createPages(3), [0, 1, 2]);

    expect(usePdfStore.getState().autoOrderChanged).toBe(false);

    store.reorderPages(0, 2);
    expect(usePdfStore.getState().pageOrder).toEqual([1, 2, 0]);
    expect(usePdfStore.getState().undoStack).toHaveLength(2);

    store.undo();
    expect(usePdfStore.getState().pageOrder).toEqual([0, 1, 2]);
    expect(usePdfStore.getState().redoStack).toHaveLength(1);

    store.redo();
    expect(usePdfStore.getState().pageOrder).toEqual([1, 2, 0]);
  });

  it('selects ranges when shift is held', () => {
    const store = usePdfStore.getState();
    store.setPages(createPages(4), [0, 1, 2, 3]);

    store.toggleSelection(1);
    store.toggleSelection(3, true);

    expect(Array.from(usePdfStore.getState().selectedIds).sort()).toEqual([1, 2, 3]);
  });

  it('deletes selected indices and records history', () => {
    const store = usePdfStore.getState();
    store.setPages(createPages(4), [0, 1, 2, 3]);

    store.toggleSelection(1);
    store.toggleSelection(3);
    store.deleteSelected();

    const state = usePdfStore.getState();
    expect(state.pageOrder).toEqual([0, 2]);
    expect(state.selectedIds.size).toBe(0);
    expect(state.undoStack[state.undoStack.length - 1].pageOrder).toEqual([0, 1, 2, 3]);
    expect(state.redoStack).toHaveLength(0);
  });

  it('tracks when auto-ordering changes the upload sequence', () => {
    const store = usePdfStore.getState();
    store.setPages(createPages(3), [2, 0, 1]);

    const state = usePdfStore.getState();
    expect(state.initialOrder).toEqual([0, 1, 2]);
    expect(state.suggestedOrder).toEqual([2, 0, 1]);
    expect(state.autoOrderChanged).toBe(true);
  });

  it('stores heuristic metadata and recognizes already-ordered PDFs', () => {
    const store = usePdfStore.getState();
    store.setPages(createPages(2), [0, 1], {
      heuristicUsed: 'explicit_page_numbers',
      confidence: 0.91,
      processingTimeMs: 1200,
    });

    const state = usePdfStore.getState();
    expect(state.autoOrderChanged).toBe(false);
    expect(state.pageOrder).toEqual([0, 1]);
    expect(state.orderingMeta?.heuristicUsed).toBe('explicit_page_numbers');
    expect(state.orderingMeta?.confidence).toBeCloseTo(0.91);
  });

  it('setPdf clears prior state and initializes metadata', () => {
    const store = usePdfStore.getState();
    store.setPages(createPages(2), [0, 1]);
    store.toggleSelection(1);
    store.setPdf(new Uint8Array([9]), 'new.pdf');

    const state = usePdfStore.getState();
    expect(state.filename).toBe('new.pdf');
    expect(state.pages).toEqual([]);
    expect(state.pageOrder).toEqual([]);
    expect(state.selectedIds.size).toBe(0);
    expect(state.initialOrder).toEqual([]);
    expect(state.autoOrderChanged).toBe(false);
    expect(state.orderingMeta).toBeNull();
  });

  it('reset restores initial values', () => {
    const store = usePdfStore.getState();
    store.setPages(createPages(2), [0, 1]);
    store.setProcessing(true, 50);
    store.setError('Oops');
    store.reset();

    const state = usePdfStore.getState();
    expect(state.pages).toEqual([]);
    expect(state.pageOrder).toEqual([]);
    expect(state.isProcessing).toBe(false);
    expect(state.error).toBeNull();
    expect(state.undoStack).toEqual([]);
    expect(state.redoStack).toEqual([]);
    expect(state.initialOrder).toEqual([]);
    expect(state.orderingMeta).toBeNull();
  });

  it('setProcessing and setError update status flags', () => {
    usePdfStore.getState().setProcessing(true, 25);
    let state = usePdfStore.getState();
    expect(state.isProcessing).toBe(true);
    expect(state.progress).toBe(25);

    usePdfStore.getState().setError('failed');
    state = usePdfStore.getState();
    expect(state.error).toBe('failed');
    expect(state.isProcessing).toBe(false);
  });
});
