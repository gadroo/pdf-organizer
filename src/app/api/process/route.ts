import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { HeuristicsOrchestrator } from '../../../../lib/heuristics/index';
import { AzureOCRClient } from '../../../../lib/ocr/azure';
import type { PageContent } from '../../../../lib/heuristics/types';

/**
 * POST /api/process
 *
 * Accepts a PDF file, extracts text from each page (via Tesseract.js OCR),
 * applies heuristics to determine page order, and returns the suggested reordering.
 *
 * Request: multipart/form-data with 'file' field containing PDF
 *
 * Response:
 * {
 *   pages: Array<{ index, ocrText, detectedPageNum, confidence }>,
 *   suggestedOrder: number[],
 *   heuristicUsed: string,
 *   processingTimeMs: number
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    // Validate file
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided', code: 'INVALID_FILE' },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'Only PDF files are accepted', code: 'INVALID_FILE' },
        { status: 400 }
      );
    }

    // Check file size (100MB limit)
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large (max 100MB)', code: 'FILE_TOO_LARGE' },
        { status: 400 }
      );
    }

    console.log(`Processing PDF: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    // Get file bytes
    const bytes = await file.arrayBuffer();
    const pdfBytes = new Uint8Array(bytes);

    // Load PDF to get page count
    let pageCount: number;
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      pageCount = pdfDoc.getPageCount();
      console.log(`PDF has ${pageCount} pages`);
    } catch {
      return NextResponse.json(
        { error: 'Could not read PDF file. It may be corrupted.', code: 'INVALID_FILE' },
        { status: 400 }
      );
    }

    if (pageCount === 0) {
      return NextResponse.json(
        { error: 'PDF has no pages', code: 'INVALID_FILE' },
        { status: 400 }
      );
    }

    // Extract text from pages
    const pageContents: PageContent[] = await extractPageContents(pdfBytes, pageCount);

    console.log(`Extracted text from ${pageContents.length} pages`);

    // Run heuristics to determine page order
    const orchestrator = new HeuristicsOrchestrator();
    const { finalResult, strategyResults, processingStats } = await orchestrator.processPages(pageContents);

    console.log(`Heuristics complete. Strategy: ${finalResult.method}, Confidence: ${(finalResult.confidence * 100).toFixed(1)}%`);

    const processingTimeMs = Date.now() - startTime;

    // Build response
    const pages = pageContents.map((page, index) => ({
      index,
      ocrText: page.content.slice(0, 500), // Truncate for response size
      detectedPageNum: page.detectedPageNum || null,
      confidence: page.confidence || 0.5,
    }));

    return NextResponse.json({
      pages,
      suggestedOrder: finalResult.order,
      heuristicUsed: finalResult.method,
      confidence: finalResult.confidence,
      reasoning: finalResult.reasoning,
      processingTimeMs,
      strategyResults: Object.keys(strategyResults).reduce((acc, key) => {
        acc[key] = {
          order: strategyResults[key].order,
          confidence: strategyResults[key].confidence,
          method: strategyResults[key].method,
        };
        return acc;
      }, {} as Record<string, { order: number[]; confidence: number; method: string }>),
    });
  } catch (error) {
    console.error('Processing error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Processing failed',
        code: 'OCR_FAILED',
      },
      { status: 500 }
    );
  }
}

/**
 * Extract text content from PDF pages using Azure OCR
 * Results are cached to avoid repeated API calls
 */
async function extractPageContents(
  pdfBytes: Uint8Array,
  pageCount: number
): Promise<PageContent[]> {
  console.log('Extracting text from PDF using Azure OCR...');

  try {
    const ocrClient = new AzureOCRClient({
      useCache: true, // Enable caching to avoid repeated API calls
    });

    // Check if Azure is configured
    if (!ocrClient.isReady()) {
      console.warn('Azure OCR not configured - using placeholder text');
      return Array.from({ length: pageCount }, (_, index) => ({
        index,
        content: `[Page ${index + 1} - Azure OCR not configured]`,
        ocrText: '',
        confidence: 0.1,
      }));
    }

    const result = await ocrClient.analyzePDF({ file: pdfBytes });

    if (result.pages.length > 0 && result.modelUsed !== 'failed') {
      console.log(`OCR successful using ${result.modelUsed}`);
      console.log(`Cache hits: ${result.cacheHits || 0}, API calls: ${result.cacheMisses || 0}`);
      
      return result.pages.map((page, index) => ({
        index,
        content: page.content,
        ocrText: page.content,
        confidence: page.confidence,
        metadata: {
          headerText: page.headerText || '',
          footerText: page.footerText || '',
          headerWordCount: page.headerWordCount || 0,
          footerWordCount: page.footerWordCount || 0,
          pageHeight: page.pageHeight || null,
          pageWidth: page.pageWidth || null,
          headerFooterSource: 'azure-bbox',
        },
      }));
    }
  } catch (error) {
    console.warn('Azure OCR failed:', error);
  }

  // Fallback: Return placeholder content for each page
  console.log('Using placeholder text as fallback.');
  return Array.from({ length: pageCount }, (_, index) => ({
    index,
    content: `Page ${index + 1}`,
    ocrText: '',
    confidence: 0.3,
  }));
}

/**
 * Health check endpoint
 */
export async function GET() {
  const ocrClient = new AzureOCRClient();
  const isConfigured = ocrClient.isReady();
  
  return NextResponse.json({
    status: 'ok',
    ocrEngine: 'azure-document-intelligence',
    ocrConfigured: isConfigured,
    cacheEnabled: true,
    endpoint: '/api/process',
    method: 'POST',
    accepts: 'multipart/form-data with file field',
    note: isConfigured 
      ? 'Azure OCR ready with caching enabled' 
      : 'Set AZURE_FORM_RECOGNIZER_ENDPOINT and AZURE_FORM_RECOGNIZER_KEY in .env.local',
  });
}
