'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { usePdfStore, PDFPage } from '@/lib/store/pdfStore';
import { ThumbnailItem } from './ThumbnailItem';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
// PDFRenderer is dynamically imported client-side only to avoid SSR issues
import type { PDFRenderer } from '../../../lib/pdf/render';

interface ThumbnailGridProps {
  onPageSelect?: (index: number) => void;
}

export function ThumbnailGrid({ onPageSelect }: ThumbnailGridProps) {
  const {
    pdfBytes,
    pages,
    pageOrder,
    selectedIds,
    reorderPages,
    toggleSelection,
    clearSelection,
  } = usePdfStore();

  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const rendererRef = useRef<PDFRenderer | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{
    orderIndex: number;
    originalIndex: number;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Initialize sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load PDF and generate thumbnails
  useEffect(() => {
    if (!pdfBytes || pdfBytes.length === 0) {
      setIsLoading(false);
      return;
    }

    const loadThumbnails = async () => {
      setIsLoading(true);
      try {
        // Dynamically import PDFRenderer only on client-side to avoid SSR issues with pdfjs-dist
        const { PDFRenderer } = await import('../../../lib/pdf/render');
        const pdfRenderer = new PDFRenderer();
        // Create a copy of the bytes to avoid "ArrayBuffer is already detached" error
        // (pdfjs-dist transfers the ArrayBuffer to its worker, detaching it)
        const bytesCopy = new Uint8Array(pdfBytes);
        await pdfRenderer.loadPDF(bytesCopy);
        rendererRef.current = pdfRenderer;

        const pageCount = pdfRenderer.getPageCount();
        const newThumbnails = new Map<number, string>();

        // Generate thumbnails in batches for performance
        const batchSize = 4;
        for (let i = 0; i < pageCount; i += batchSize) {
          const batch = Array.from(
            { length: Math.min(batchSize, pageCount - i) },
            (_, idx) => i + idx + 1 // 1-based page numbers for pdfjs
          );

          const results = await pdfRenderer.renderMultiplePages(batch, {
            scale: 0.3,
            quality: 0.8,
            format: 'jpeg',
          });

          results.forEach((result) => {
            // Store with 0-based index
            newThumbnails.set(result.pageNumber - 1, result.dataURL);
          });

          // Update state progressively for better UX
          setThumbnails(new Map(newThumbnails));
        }
      } catch (error) {
        console.error('Failed to generate thumbnails:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThumbnails();

    return () => {
      rendererRef.current?.dispose();
    };
  }, [pdfBytes]);

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  }, []);

  // Handle drag end - reorder pages
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (over && active.id !== over.id) {
        const oldIndex = pageOrder.indexOf(active.id as number);
        const newIndex = pageOrder.indexOf(over.id as number);

        if (oldIndex !== -1 && newIndex !== -1) {
          reorderPages(oldIndex, newIndex);
        }
      }
    },
    [pageOrder, reorderPages]
  );

  // Handle page click for selection
  const handlePageClick = useCallback(
    (index: number, event: React.MouseEvent) => {
      event.stopPropagation();
      toggleSelection(index, event.shiftKey);
      onPageSelect?.(index);
    },
    [toggleSelection, onPageSelect]
  );

  // Clear selection when clicking grid background
  const handleGridClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handlePreviewOpenChange = useCallback((open: boolean) => {
    setIsPreviewOpen(open);
    if (!open) {
      setPreviewMeta(null);
      setPreviewImage(null);
      setPreviewError(null);
      setIsPreviewLoading(false);
    }
  }, []);

  const handlePreviewRequest = useCallback(
    async (orderIndex: number, event?: React.MouseEvent) => {
      event?.stopPropagation();

      const originalIndex = pageOrder[orderIndex];
      if (typeof originalIndex === 'undefined') {
        return;
      }

      setPreviewMeta({ orderIndex, originalIndex });
      setPreviewError(null);
      setIsPreviewOpen(true);
      setPreviewImage(thumbnails.get(originalIndex) ?? null);
      setIsPreviewLoading(true);

      try {
        if (!rendererRef.current) {
          if (!pdfBytes) {
            throw new Error('PDF data unavailable');
          }

          const { PDFRenderer } = await import('../../../lib/pdf/render');
          const pdfRenderer = new PDFRenderer();
          const bytesCopy = new Uint8Array(pdfBytes);
          await pdfRenderer.loadPDF(bytesCopy);
          rendererRef.current = pdfRenderer;
        }

        const highRes = await rendererRef.current.renderPageAsDataURL(
          originalIndex + 1,
          {
            scale: 1.2,
            quality: 0.95,
            format: 'jpeg',
          }
        );

        setPreviewImage(highRes);
      } catch (error) {
        console.error('Failed to open preview:', error);
        setPreviewError('Unable to load high-quality preview. Please try again.');
      } finally {
        setIsPreviewLoading(false);
      }
    },
    [pageOrder, thumbnails, pdfBytes]
  );

  const showAdjacentPreview = useCallback(
    (direction: 1 | -1) => {
      if (!previewMeta) return;
      const nextIndex = previewMeta.orderIndex + direction;
      if (nextIndex < 0 || nextIndex >= pageOrder.length) {
        return;
      }
      handlePreviewRequest(nextIndex);
    },
    [previewMeta, pageOrder, handlePreviewRequest]
  );

  const handlePreviousPreview = useCallback(
    () => showAdjacentPreview(-1),
    [showAdjacentPreview]
  );

  const handleNextPreview = useCallback(
    () => showAdjacentPreview(1),
    [showAdjacentPreview]
  );

  useEffect(() => {
    if (!isPreviewOpen) {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handlePreviousPreview();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        handleNextPreview();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isPreviewOpen, handlePreviousPreview, handleNextPreview]);

  // Get the page data for a given order index
  const getPageAtOrderIndex = (orderIndex: number): PDFPage | undefined => {
    const pageIndex = pageOrder[orderIndex];
    return pages.find((p) => p.originalIndex === pageIndex);
  };

  const canShowPrevious = previewMeta ? previewMeta.orderIndex > 0 : false;
  const canShowNext = previewMeta
    ? previewMeta.orderIndex < pageOrder.length - 1
    : false;
  const navButtonBase =
    'absolute top-1/2 -translate-y-1/2 z-50 bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 shadow-md p-2 transition-opacity';

  if (isLoading && thumbnails.size === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400">Generating thumbnails...</p>
        </div>
      </div>
    );
  }

  if (pageOrder.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">No pages to display</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        onClick={handleGridClick}
        className="p-6 min-h-[calc(100vh-12rem)]"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 text-xs text-slate-400">
          <span>Drag thumbnails to reorder pages.</span>
          <span>Double-click any page to open a high-quality preview.</span>
        </div>
        <SortableContext items={pageOrder} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {pageOrder.map((pageIndex, orderIndex) => {
              const page = pages.find((p) => p.originalIndex === pageIndex);
              const thumbnail = thumbnails.get(pageIndex);
              const isSelected = selectedIds.has(orderIndex);

              return (
                <ThumbnailItem
                  key={pageIndex}
                  id={pageIndex}
                  orderIndex={orderIndex}
                  originalIndex={pageIndex}
                  thumbnail={thumbnail || null}
                  isSelected={isSelected}
                  onClick={(e) => handlePageClick(orderIndex, e)}
                  onDoubleClick={(e) => handlePreviewRequest(orderIndex, e)}
                />
              );
            })}
          </div>
        </SortableContext>
      </div>

      {/* Drag overlay for smooth dragging */}
      <DragOverlay>
        {activeId !== null ? (
          <div className="w-32 h-40 bg-slate-700 rounded-lg border-2 border-amber-400 shadow-2xl opacity-90 flex items-center justify-center">
            {thumbnails.get(activeId) ? (
              <img
                src={thumbnails.get(activeId)}
                alt="Dragging page"
                className="max-w-full max-h-full object-contain rounded"
              />
            ) : (
              <span className="text-slate-400">Page {activeId + 1}</span>
            )}
          </div>
        ) : null}
      </DragOverlay>

      <Dialog open={isPreviewOpen} onOpenChange={handlePreviewOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="max-w-[100vw] max-h-[100vh] p-0 border-none bg-transparent shadow-none flex items-center justify-center"
        >
          <DialogTitle className="sr-only">
            {previewMeta
              ? `Previewing reordered page ${previewMeta.orderIndex + 1}`
              : 'Previewing PDF page'}
          </DialogTitle>
          <div className="relative flex w-full items-center justify-center">
            <div className="relative inline-flex max-h-[94vh] max-w-[100vw] items-start justify-start">
              <button
                type="button"
                onClick={handlePreviousPreview}
                disabled={!canShowPrevious}
                aria-label="Previous page"
                className={`${navButtonBase} -left-12 rounded-none`}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <DialogClose className="absolute -top-12 left-0 z-50 rounded-full bg-gray-100 p-2 text-gray-700 border border-gray-300 transition hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400">
                <X className="h-3 w-3" />
                <span className="sr-only">Close preview</span>
              </DialogClose>
              {previewImage ? (
                <img
                  src={previewImage}
                  alt={
                    previewMeta
                      ? `Preview of page ${previewMeta.originalIndex + 1}`
                      : 'Page preview'
                  }
                  className={`max-h-[94vh] max-w-[100vw] object-contain drop-shadow-2xl ${
                    isPreviewLoading ? 'opacity-60 blur-[0.5px]' : 'opacity-100'
                  }`}
                />
              ) : null}
              {isPreviewLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-100">
                  <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-slate-100">
                    Rendering high-quality preview...
                  </span>
                </div>
              )}
              {!isPreviewLoading && !previewImage && (
                <p className="text-sm text-slate-200">Select a page to preview.</p>
              )}
              {previewError && (
                <p className="absolute bottom-8 text-sm text-destructive bg-black/70 px-3 py-1 rounded">
                  {previewError}
                </p>
              )}
              <button
                type="button"
                onClick={handleNextPreview}
                disabled={!canShowNext}
                aria-label="Next page"
                className={`${navButtonBase} -right-12 rounded-none`}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}

