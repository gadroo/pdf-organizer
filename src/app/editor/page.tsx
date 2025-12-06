'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, ArrowLeft, Sparkles, Info } from 'lucide-react';
import Link from 'next/link';
import { usePdfStore } from '@/lib/store/pdfStore';
import { ThumbnailGrid } from '@/components/editor/ThumbnailGrid';
import { Toolbar } from '@/components/editor/Toolbar';
import { ExportModal } from '@/components/editor/ExportModal';
import { Button } from '@/components/ui/button';

/**
 * Editor Page
 *
 * Main page for viewing and reordering PDF pages.
 * Features drag-and-drop reordering, multi-select, undo/redo, and export.
 */
export default function EditorPage() {
  const router = useRouter();
  const {
    pdfBytes,
    filename,
    pageOrder,
    initialOrder,
    autoOrderChanged,
    orderingMeta,
    undo,
    redo,
    deleteSelected,
    selectAll,
    clearSelection,
    undoStack,
    redoStack,
    selectedIds,
  } = usePdfStore();

  const [showExportModal, setShowExportModal] = useState(false);
  const hasInitialOrder = initialOrder.length > 0;
  const matchesUploadOrder =
    hasInitialOrder &&
    initialOrder.length === pageOrder.length &&
    initialOrder.every((val, idx) => val === pageOrder[idx]);

  // Redirect to home if no PDF is loaded
  useEffect(() => {
    if (!pdfBytes || pdfBytes.length === 0) {
      router.push('/');
    }
  }, [pdfBytes, router]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl/Cmd + Z - Undo
      if (ctrlOrCmd && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (undoStack.length > 0) {
          undo();
        }
      }

      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y - Redo
      if (ctrlOrCmd && (e.key === 'z' && e.shiftKey) || (ctrlOrCmd && e.key === 'y')) {
        e.preventDefault();
        if (redoStack.length > 0) {
          redo();
        }
      }

      // Delete or Backspace - Delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        deleteSelected();
      }

      // Ctrl/Cmd + A - Select all
      if (ctrlOrCmd && e.key === 'a') {
        e.preventDefault();
        selectAll();
      }

      // Escape - Clear selection
      if (e.key === 'Escape') {
        e.preventDefault();
        clearSelection();
      }

      // Ctrl/Cmd + E - Export
      if (ctrlOrCmd && e.key === 'e') {
        e.preventDefault();
        setShowExportModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, deleteSelected, selectAll, clearSelection, undoStack, redoStack, selectedIds]);

  // Handle export button click
  const handleExportClick = useCallback(() => {
    setShowExportModal(true);
  }, []);

  // Show loading state if PDF not ready
  if (!pdfBytes || pdfBytes.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Left side - Logo and filename */}
            <div className="flex items-center gap-4 min-w-0">
              <Link href="/" className="flex items-center gap-2 flex-shrink-0">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <FileUp className="h-4 w-4 text-slate-900" />
                </div>
                <span className="text-lg font-semibold text-white hidden sm:block">
                  PDF Organizer
                </span>
              </Link>

              {/* Back button */}
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="text-slate-400 hover:text-white"
              >
                <Link href="/">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">New PDF</span>
                </Link>
              </Button>

              {/* Filename */}
              {filename && (
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-px h-6 bg-slate-700 hidden sm:block" />
                  <span className="text-sm text-slate-400 truncate max-w-[200px]">
                    {filename}
                  </span>
                </div>
              )}
            </div>

            {/* Right side - Toolbar */}
            <Toolbar onExport={handleExportClick} />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6">
        {/* Instructions */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-slate-400">
            Drag pages to reorder • Click to select • Shift+click for range selection
          </p>
          <div className="text-xs text-slate-500 hidden md:flex items-center gap-4">
            <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">⌘Z</kbd> Undo</span>
            <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">Del</kbd> Delete</span>
            <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">⌘E</kbd> Export</span>
          </div>
        </div>

        {/* Thumbnail grid */}
        <ThumbnailGrid />
      </main>

      {/* Export modal */}
      <ExportModal open={showExportModal} onOpenChange={setShowExportModal} />
    </div>
  );
}
