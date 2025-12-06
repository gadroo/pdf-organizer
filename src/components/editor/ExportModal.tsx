'use client';

import { useState, useCallback } from 'react';
import { Download, Loader2, X, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePdfStore } from '@/lib/store/pdfStore';
import { PDFManipulator } from '../../../lib/pdf/manipulate';

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportModal({ open, onOpenChange }: ExportModalProps) {
  const { pdfBytes, filename, pageOrder, initialOrder, autoOrderChanged } = usePdfStore();

  // Generate default filename
  const defaultFilename = filename
    ? filename.replace(/\.pdf$/i, '') + '-reordered.pdf'
    : 'reordered-document.pdf';

  const [exportFilename, setExportFilename] = useState(defaultFilename);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matchesUploadOrder =
    initialOrder.length > 0 &&
    initialOrder.length === pageOrder.length &&
    initialOrder.every((val, idx) => val === pageOrder[idx]);

  // Reset state when modal opens
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen) {
      setExportFilename(defaultFilename);
      setError(null);
    }
    onOpenChange(newOpen);
  }, [defaultFilename, onOpenChange]);

  // Handle export
  const handleExport = useCallback(async () => {
    if (!pdfBytes || pageOrder.length === 0) {
      setError('No PDF loaded');
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      // Create manipulator and load PDF
      const manipulator = new PDFManipulator();
      await manipulator.loadPDF(pdfBytes);

      // Reorder pages according to current order
      const result = await manipulator.reorderPages(pageOrder);

      if (!result.success) {
        throw new Error(result.error || 'Failed to reorder pages');
      }

      // Ensure filename ends with .pdf
      let finalFilename = exportFilename.trim();
      if (!finalFilename.toLowerCase().endsWith('.pdf')) {
        finalFilename += '.pdf';
      }

      // Download the PDF
      await manipulator.downloadPDF({ filename: finalFilename });

      // Close modal on success
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [pdfBytes, pageOrder, exportFilename, handleOpenChange]);

  // Handle Enter key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !isExporting) {
        handleExport();
      }
    },
    [handleExport, isExporting]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileText className="h-5 w-5 text-amber-400" />
            Export PDF
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Download your reordered PDF with the new page arrangement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Filename input */}
          <div className="space-y-2">
            <label
              htmlFor="filename"
              className="text-sm font-medium text-slate-300"
            >
              Filename
            </label>
            <Input
              id="filename"
              value={exportFilename}
              onChange={(e) => setExportFilename(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter filename"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-amber-500 focus:ring-amber-500/20"
              disabled={isExporting}
            />
          </div>

          {/* Export summary */}
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Pages</span>
              <span className="text-white font-medium">{pageOrder.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-slate-400">Order changed</span>
              <span className={matchesUploadOrder ? 'text-slate-300 font-medium' : 'text-amber-400 font-medium'}>
                {matchesUploadOrder ? 'No (same as upload)' : 'Yes'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-slate-400">Auto-reorder</span>
              <span className="text-slate-300 font-medium">
                {autoOrderChanged ? 'Applied' : 'Skipped (already ordered)'}
              </span>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
              <X className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isExporting}
            className="border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || !exportFilename.trim()}
            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
