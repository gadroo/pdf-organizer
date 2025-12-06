'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { usePdfStore } from '@/lib/store/pdfStore';
import { Progress } from '@/components/ui/progress';

interface DropZoneProps {
  maxSizeMB?: number;
  onUploadStart?: () => void;
  onUploadComplete?: () => void;
  onUploadError?: (error: string) => void;
}

type UploadStatus = 'idle' | 'validating' | 'uploading' | 'processing' | 'success' | 'error';

export function DropZone({
  maxSizeMB = 100,
  onUploadStart,
  onUploadComplete,
  onUploadError,
}: DropZoneProps) {
  const router = useRouter();
  const { setPdf, setPages, setProcessing, setError } = usePdfStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const validateFile = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return 'Please upload a PDF file';
    }
    if (file.size > maxSizeBytes) {
      return `File too large (max ${maxSizeMB}MB)`;
    }
    if (file.size === 0) {
      return 'File is empty';
    }
    return null;
  };

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isReselecting, setIsReselecting] = useState(false);

  const processFile = useCallback(async (file: File) => {
    // Validate file
    setStatus('validating');
    setProgress(10);
    const validationError = validateFile(file);

    if (validationError) {
      setStatus('error');
      setErrorMessage(validationError);
      onUploadError?.(validationError);
      return;
    }

    setFileName(file.name);
    setStatus('uploading');
    setProgress(20);
    onUploadStart?.();

    try {
      // Read file bytes
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      setProgress(40);

      // Store PDF in zustand
      setPdf(bytes, file.name);
      setUploadedFile(file);
      setProgress(100);
      setStatus('success');
      onUploadComplete?.();

      // Don't navigate automatically - wait for user confirmation
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setStatus('error');
      setErrorMessage(message);
      setError(message);
      setProcessing(false);
      onUploadError?.(message);
    }
  }, [setPdf, router, maxSizeBytes, onUploadStart, onUploadComplete, onUploadError]);

  const processPdfForReorganization = useCallback(async () => {
    if (!uploadedFile) return;

    try {
      setStatus('processing');
      setProcessing(true, 40);

      // Send to API for processing
      const formData = new FormData();
      formData.append('file', uploadedFile);

      setProgress(50);

      const response = await fetch('/api/process', {
        method: 'POST',
        body: formData,
      });

      setProgress(80);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Processing failed');
      }

      const result = await response.json();
      setProgress(90);

      // Convert API response to PDFPage format for the store
      const pages = result.pages.map((page: { index: number; ocrText: string; detectedPageNum: number | null; confidence: number }, idx: number) => ({
        originalIndex: page.index,
        currentIndex: idx,
        thumbnail: null, // Will be rendered client-side
        detectedPageNum: page.detectedPageNum,
        confidence: page.confidence,
        ocrText: page.ocrText || '',
      }));

      const orderingMeta = {
        heuristicUsed: result.heuristicUsed as string | undefined,
        confidence: typeof result.confidence === 'number' ? result.confidence : undefined,
        reasoning: Array.isArray(result.reasoning) ? result.reasoning : undefined,
        processingTimeMs: typeof result.processingTimeMs === 'number' ? result.processingTimeMs : undefined,
      };

      // Set pages with suggested order
      setPages(pages, result.suggestedOrder, orderingMeta);
      setProgress(100);
      setProcessing(false, 100);

      // Navigate to editor after processing
      router.push('/editor');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Processing failed';
      setStatus('error');
      setErrorMessage(message);
      setError(message);
      setProcessing(false);
    }
  }, [uploadedFile, setPages, setProcessing, setError, router]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Allow dragging even in success state to enable reselect
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // Allow dropping in success state (reselect behavior)
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setIsReselecting(false);
      processFile(files[0]);
    }
  }, [processFile]);

  const handleClick = () => {
    // Always allow clicking to select a file, except when processing or reselecting
    if (status !== 'processing' && status !== 'validating' && status !== 'uploading' && !isReselecting) {
      fileInputRef.current?.click();
    }
  };

  const handleRetry = () => {
    setIsReselecting(false);
    setStatus('idle');
    setErrorMessage(null);
    setProgress(0);
    setFileName(null);
    setUploadedFile(null);
    // Clear file input to allow re-selecting the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleReselect = (e?: React.MouseEvent) => {
    // Prevent event bubbling to avoid triggering the main click handler
    e?.stopPropagation();
    e?.preventDefault();

    setIsReselecting(true);
    setStatus('idle');
    setErrorMessage(null);
    setProgress(0);
    setFileName(null);
    setUploadedFile(null);
    // Clear file input to allow re-selecting the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Use a small timeout to ensure the state update is processed before opening file picker
    setTimeout(() => {
      fileInputRef.current?.click();
      setIsReselecting(false);
    }, 0);
  };

  const getStatusContent = () => {
    switch (status) {
      case 'validating':
        return (
          <>
            <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
            <h3 className="text-xl font-semibold text-white mt-4">Validating file...</h3>
          </>
        );
      case 'uploading':
        return (
          <>
            <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
            <h3 className="text-xl font-semibold text-white mt-4">Uploading {fileName}...</h3>
            <Progress value={progress} className="w-48 mt-4" />
          </>
        );
      case 'processing':
        return (
          <>
            <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
            <h3 className="text-xl font-semibold text-white mt-4">Processing PDF...</h3>
            <p className="text-slate-400 mt-2">Running OCR and page analysis</p>
            <Progress value={progress} className="w-48 mt-4" />
          </>
        );
      case 'success':
        return (
          <>
            <CheckCircle2 className="h-8 w-8 text-green-400" />
            <h3 className="text-xl font-semibold text-white mt-4">PDF uploaded successfully!</h3>
            <div className="mt-4 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
              <p className="text-amber-400 font-medium mb-2">{fileName}</p>
              <p className="text-slate-400 text-sm">Ready to reorganize pages</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-6 justify-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  processPdfForReorganization();
                }}
                className="px-6 py-3 bg-amber-500 text-slate-900 rounded-lg font-medium hover:bg-amber-400 transition-colors flex items-center justify-center gap-2"
              >
                <FileUp className="h-4 w-4" />
                Reorganize PDF
              </button>
              <button
                onClick={handleReselect}
                className="px-6 py-3 bg-slate-600 text-white rounded-lg font-medium hover:bg-slate-500 transition-colors"
              >
                Reselect PDF
              </button>
            </div>
          </>
        );
      case 'error':
        return (
          <>
            <AlertCircle className="h-8 w-8 text-red-400" />
            <h3 className="text-xl font-semibold text-white mt-4">Upload failed</h3>
            <p className="text-red-400 mt-2">{errorMessage}</p>
            <button
              onClick={handleRetry}
              className="mt-4 px-4 py-2 bg-amber-500 text-slate-900 rounded-lg font-medium hover:bg-amber-400 transition-colors"
            >
              Try again
            </button>
          </>
        );
      default:
        return (
          <>
            <div className={`mx-auto mb-6 transition-all duration-300 group-hover:transform group-hover:-translate-y-2 group-hover:scale-125 flex justify-center`}>
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${
                isDragging ? 'bg-amber-500/30' : 'bg-slate-700 group-hover:bg-amber-500/20'
              }`}>
                <FileUp className={`h-8 w-8 transition-colors ${
                  isDragging ? 'text-amber-400' : 'text-slate-400 group-hover:text-amber-400'
                }`} />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {isDragging ? 'Drop your PDF' : 'Drop your PDF here'}
            </h3>
            <p className="text-slate-400 mb-4">
              or click to browse (max {maxSizeMB}MB)
            </p>
            <p className="text-xs text-slate-500">
              Supports .pdf files only
            </p>
          </>
        );
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-2xl p-12 text-center backdrop-blur-sm
          transition-all duration-300 group cursor-pointer
          ${isDragging
            ? 'border-amber-400 bg-amber-500/10'
            : status === 'error'
            ? 'border-red-500/50 bg-red-500/5'
            : status === 'success'
            ? 'border-green-500/50 bg-green-500/5'
            : 'border-slate-600 bg-slate-800/50 hover:border-amber-500/50 hover:bg-slate-800/70'
          }
        `}
      >
        {getStatusContent()}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileInput}
        className="hidden"
      />
    </div>
  );
}
