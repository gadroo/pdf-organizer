'use client';

import { useCallback } from 'react';
import { Undo2, Redo2, Trash2, Download, CheckSquare, XSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePdfStore } from '@/lib/store/pdfStore';
import { cn } from '@/lib/utils';

interface ToolbarProps {
  onExport: () => void;
  className?: string;
}

export function Toolbar({ onExport, className }: ToolbarProps) {
  const {
    selectedIds,
    undoStack,
    redoStack,
    pageOrder,
    undo,
    redo,
    deleteSelected,
    selectAll,
    clearSelection,
  } = usePdfStore();

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;
  const hasSelection = selectedIds.size > 0;
  const allSelected = selectedIds.size === pageOrder.length && pageOrder.length > 0;

  const handleUndo = useCallback(() => {
    if (canUndo) undo();
  }, [canUndo, undo]);

  const handleRedo = useCallback(() => {
    if (canRedo) redo();
  }, [canRedo, redo]);

  const handleDelete = useCallback(() => {
    if (hasSelection) {
      deleteSelected();
    }
  }, [hasSelection, deleteSelected]);

  const handleToggleSelectAll = useCallback(() => {
    if (allSelected) {
      clearSelection();
    } else {
      selectAll();
    }
  }, [allSelected, selectAll, clearSelection]);

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 bg-slate-800/80 backdrop-blur-sm rounded-lg border border-slate-700/50',
        className
      )}
    >
      {/* Undo/Redo group */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleUndo}
          disabled={!canUndo}
          className="h-8 px-2 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRedo}
          disabled={!canRedo}
          className="h-8 px-2 text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-40"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-slate-600" />

      {/* Selection group */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggleSelectAll}
          className="h-8 px-2 text-slate-300 hover:text-white hover:bg-slate-700"
          title={allSelected ? 'Deselect All' : 'Select All (Ctrl+A)'}
        >
          {allSelected ? (
            <XSquare className="h-4 w-4" />
          ) : (
            <CheckSquare className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={!hasSelection}
          className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40"
          title="Delete Selected (Delete)"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Selection info */}
      {hasSelection && (
        <>
          <div className="w-px h-6 bg-slate-600" />
          <span className="text-xs text-slate-400 px-2">
            {selectedIds.size} selected
          </span>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Page count */}
      <span className="text-xs text-slate-400 px-2">
        {pageOrder.length} pages
      </span>

      {/* Divider */}
      <div className="w-px h-6 bg-slate-600" />

      {/* Export button */}
      <Button
        onClick={onExport}
        size="sm"
        className="h-8 px-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium"
      >
        <Download className="h-4 w-4 mr-1.5" />
        Export
      </Button>
    </div>
  );
}

