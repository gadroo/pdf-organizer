/**
 * Azure Document Intelligence OCR Client
 * 
 * Features:
 * - Sends each page individually to Azure (stays under 4MB limit)
 * - Per-page caching to avoid repeated API calls
 * - Works with scanned PDFs
 * - Server-side compatible (Next.js API routes)
 */

import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

export interface AzureOCRConfig {
  endpoint?: string;
  key?: string;
  modelId?: string;
  locale?: string;
  pages?: number[];
  useCache?: boolean;
  cacheDir?: string;
}

export interface AzurePageResult {
  pageNumber: number;
  content: string;
  lines: string[];
  words: Array<{
    text: string;
    boundingBox: number[];
    confidence: number;
  }>;
  confidence: number;
  analysisTime: number;
  fromCache?: boolean;
  headerText?: string;
  footerText?: string;
  headerWordCount?: number;
  footerWordCount?: number;
  pageHeight?: number;
  pageWidth?: number;
}

export interface AzureAnalysisResult {
  pages: AzurePageResult[];
  totalAnalysisTime: number;
  modelUsed: string;
  requestSize: number;
  endpoint?: string;
  cacheHits?: number;
  cacheMisses?: number;
}

interface AzureAnalyzeWord {
  content?: string;
  boundingBox?: number[];
  polygon?: number[];
  confidence?: number;
}

interface AzureAnalyzeLine {
  content?: string;
}

interface AzureAnalyzePage {
  width?: number;
  height?: number;
  unit?: string;
  lines?: AzureAnalyzeLine[];
  words?: AzureAnalyzeWord[];
}

interface AzureAnalyzeResponse {
  status?: string;
  analyzeResult?: {
    pages?: AzureAnalyzePage[];
  };
  error?: {
    message?: string;
  };
}

interface OCRRequest {
  file: File | ArrayBuffer | Uint8Array;
}

// Cache key generation
function generateCacheKey(pdfHash: string, pageNumber: number): string {
  return `ocr_${pdfHash}_p${pageNumber}.json`;
}

// Simple hash function for PDF content
async function hashPDFContent(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  // Use first and last 1KB + size as a quick fingerprint
  const start = buffer.slice(0, 1024);
  const end = buffer.slice(-1024);
  const combined = new Uint8Array(start.length + end.length + 8);
  combined.set(start, 0);
  combined.set(end, start.length);
  
  // Add file size as bytes
  const size = buffer.length;
  const sizeView = new DataView(combined.buffer, start.length + end.length, 8);
  sizeView.setBigUint64(0, BigInt(size), true);
  
  // Simple hash
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash + combined[i]) | 0;
  }
  return `${Math.abs(hash).toString(16)}_${size}`;
}

/**
 * File-based OCR Cache (works on server side)
 */
class FileOCRCache {
  private cacheDir: string;
  private memoryCache: Map<string, { result: AzurePageResult; timestamp: number }> = new Map();

  constructor(cacheDir?: string) {
    // Default to .ocr-cache in project root or temp directory
    this.cacheDir = cacheDir || this.getDefaultCacheDir();
    this.ensureCacheDir();
  }

  private getDefaultCacheDir(): string {
    // Try to use project's .ocr-cache directory
    const projectCacheDir = path.join(process.cwd(), '.ocr-cache');
    return projectCacheDir;
  }

  private ensureCacheDir(): void {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
        console.log(`[OCR Cache] Created cache directory: ${this.cacheDir}`);
      }
    } catch (e) {
      console.warn('[OCR Cache] Could not create cache directory:', e);
    }
  }

  get(key: string): AzurePageResult | null {
    // Check memory cache first
    const memCached = this.memoryCache.get(key);
    if (memCached) {
      const age = Date.now() - memCached.timestamp;
      if (age < 24 * 60 * 60 * 1000) { // 24 hours
        return { ...memCached.result, fromCache: true };
      }
      this.memoryCache.delete(key);
    }

    // Check file cache
    try {
      const filePath = path.join(this.cacheDir, key);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const age = Date.now() - data.timestamp;
        
        if (age < 24 * 60 * 60 * 1000) { // 24 hours
          // Store in memory cache too
          this.memoryCache.set(key, data);
          return { ...data.result, fromCache: true };
        }
        
        // Expired, delete it
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      // Cache miss or error
    }
    
    return null;
  }

  set(key: string, result: AzurePageResult): void {
    const data = {
      result,
      timestamp: Date.now(),
    };

    // Store in memory
    this.memoryCache.set(key, data);

    // Store on disk
    try {
      const filePath = path.join(this.cacheDir, key);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.warn('[OCR Cache] Could not write cache file:', e);
    }
  }

  clear(): void {
    this.memoryCache.clear();
    
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.startsWith('ocr_') && file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      }
      console.log(`[OCR Cache] Cleared ${files.length} cache files`);
    } catch (e) {
      console.warn('[OCR Cache] Could not clear cache:', e);
    }
  }

  getCacheDir(): string {
    return this.cacheDir;
  }
}

// Global cache instance
const ocrCache = new FileOCRCache();

export class AzureOCRClient {
  private endpoint: string;
  private key: string;
  private modelId: string;
  private config: AzureOCRConfig;

  constructor(config: AzureOCRConfig = {}) {
    // Get credentials from environment or config
    this.endpoint = config.endpoint || 
      (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_AZURE_FORM_RECOGNIZER_ENDPOINT || process.env.AZURE_FORM_RECOGNIZER_ENDPOINT || '' : '');
    this.key = config.key || 
      (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_AZURE_FORM_RECOGNIZER_KEY || process.env.AZURE_FORM_RECOGNIZER_KEY || '' : '');
    this.modelId = config.modelId || 'prebuilt-read';
    this.config = {
      locale: 'en-US',
      useCache: true,
      ...config,
    };
  }

  /**
   * Test Azure connection
   */
  public async testConnection(): Promise<{
    success: boolean;
    error?: string;
    analysisTime?: number;
  }> {
    if (!this.endpoint || !this.key) {
      return {
        success: false,
        error: 'Azure credentials not configured. Set AZURE_FORM_RECOGNIZER_ENDPOINT and AZURE_FORM_RECOGNIZER_KEY environment variables.',
      };
    }

    const startTime = Date.now();

    try {
      // Test with a simple API call to check connectivity
      const response = await fetch(`${this.endpoint}/formrecognizer/documentModels?api-version=2023-07-31`, {
        method: 'GET',
        headers: {
          'Ocp-Apim-Subscription-Key': this.key,
        },
      });

      if (response.ok) {
        return {
          success: true,
          analysisTime: Date.now() - startTime,
        };
      } else {
        const errorText = await response.text();
        return {
          success: false,
          error: `Azure API error: ${response.status} - ${errorText}`,
          analysisTime: Date.now() - startTime,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        analysisTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Extract retry-after time from Azure error response
   */
  private parseRetryAfter(errorText: string): number {
    try {
      // Try to parse JSON error response
      const errorJson = JSON.parse(errorText);
      const message = errorJson?.error?.message || '';
      
      // Look for "retry after X seconds" pattern
      const match = message.match(/retry after (\d+) seconds?/i);
      if (match) {
        return parseInt(match[1], 10) * 1000; // Convert to milliseconds
      }
    } catch {
      // Not JSON, try regex on plain text
      const match = errorText.match(/retry after (\d+) seconds?/i);
      if (match) {
        return parseInt(match[1], 10) * 1000;
      }
    }
    
    // Default: exponential backoff starting at 5 seconds
    return 5000;
  }

  /**
   * Extract a single page from PDF using pdf-lib
   */
  private async extractSinglePage(pdfBytes: Uint8Array, pageIndex: number): Promise<Uint8Array> {
    const sourcePdf = await PDFDocument.load(pdfBytes);
    const singlePagePdf = await PDFDocument.create();
    
    const [copiedPage] = await singlePagePdf.copyPages(sourcePdf, [pageIndex]);
    singlePagePdf.addPage(copiedPage);
    
    return await singlePagePdf.save();
  }

  /**
   * Send a single page PDF to Azure and get OCR results
   */
  private async analyzeSinglePage(pageData: Uint8Array, pageNumber: number): Promise<AzurePageResult> {
    const startTime = Date.now();

    if (!this.endpoint || !this.key) {
      throw new Error('Azure credentials not configured');
    }

    const pageSizeKB = (pageData.length / 1024).toFixed(1);
    console.log(`[Azure OCR] Sending page ${pageNumber} to Azure (${pageSizeKB} KB)...`);

    // Start document analysis with retry logic
    const analyzeUrl = `${this.endpoint}/formrecognizer/documentModels/${this.modelId}:analyze?api-version=2023-07-31`;
    const bodyData = Buffer.from(pageData);
    
    let analyzeResponse: Response | null = null;
    let retryCount = 0;
    const maxRetries = 5;
    
    // Retry loop for rate limit errors
    while (retryCount <= maxRetries) {
      analyzeResponse = await fetch(analyzeUrl, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.key,
          'Content-Type': 'application/pdf',
        },
        body: bodyData,
      });

      if (analyzeResponse.ok) {
        break; // Success, exit retry loop
      }

      // Handle rate limit errors (429)
      if (analyzeResponse.status === 429) {
        const errorText = await analyzeResponse.text();
        const retryAfter = this.parseRetryAfter(errorText);
        const waitTime = Math.min(retryAfter, 30000); // Cap at 30 seconds
        
        retryCount++;
        if (retryCount > maxRetries) {
          throw new Error(`Azure analyze request failed after ${maxRetries} retries: ${analyzeResponse.status} - ${errorText}`);
        }
        
        console.log(`[Azure OCR] Page ${pageNumber} - Rate limit hit, waiting ${waitTime}ms before retry ${retryCount}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue; // Retry the request
      }

      // For other errors, throw immediately
      const errorText = await analyzeResponse.text();
      throw new Error(`Azure analyze request failed: ${analyzeResponse.status} - ${errorText}`);
    }

    if (!analyzeResponse || !analyzeResponse.ok) {
      const errorText = analyzeResponse ? await analyzeResponse.text() : 'No response received';
      throw new Error(`Azure analyze request failed: ${analyzeResponse?.status || 'unknown'} - ${errorText}`);
    }

    // Get operation location for polling
    const operationLocation = analyzeResponse.headers.get('Operation-Location');
    if (!operationLocation) {
      throw new Error('No operation location returned from Azure');
    }

    // Poll for results with retry logic for rate limits
    let result: AzureAnalyzeResponse | null = null;
    let attempts = 0;
    const maxAttempts = 60; // Max 60 seconds per page
    const maxPollRetries = 5;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

      let resultResponse: Response | null = null;
      let pollAttempt = 0;
      
      // Retry loop for polling rate limit errors
      while (pollAttempt <= maxPollRetries) {
        resultResponse = await fetch(operationLocation, {
          method: 'GET',
          headers: {
            'Ocp-Apim-Subscription-Key': this.key,
          },
        });

        if (resultResponse.ok) {
          break; // Success, exit retry loop
        }

        // Handle rate limit errors (429) during polling
        if (resultResponse.status === 429) {
          const errorText = await resultResponse.text();
          const retryAfter = this.parseRetryAfter(errorText);
          const waitTime = Math.min(retryAfter, 30000); // Cap at 30 seconds
          
          pollAttempt++;
          if (pollAttempt > maxPollRetries) {
            throw new Error(`Failed to get analysis result after ${maxPollRetries} retries: ${resultResponse.status}`);
          }
          
          console.log(`[Azure OCR] Page ${pageNumber} - Polling rate limit hit, waiting ${waitTime}ms before retry ${pollAttempt}/${maxPollRetries}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue; // Retry the poll request
        }

        // For other errors, throw immediately
        throw new Error(`Failed to get analysis result: ${resultResponse.status}`);
      }

      if (!resultResponse || !resultResponse.ok) {
        throw new Error(`Failed to get analysis result: ${resultResponse?.status || 'unknown'}`);
      }

      result = (await resultResponse.json()) as AzureAnalyzeResponse;

      // Some responses briefly omit status while processing; keep polling
      if (!result || !result.status) {
        continue;
      }

      if (result.status === 'succeeded') {
        break;
      } else if (result.status === 'failed') {
        throw new Error(`Analysis failed: ${result.error?.message || 'Unknown error'}`);
      }
      
      // Still running, continue polling (log every 5 seconds)
      if (attempts % 5 === 0) {
        console.log(`[Azure OCR] Page ${pageNumber} - processing (${attempts}s)...`);
      }
    }

    if (!result || result.status !== 'succeeded') {
      throw new Error('Analysis timed out');
    }

    // Extract text from result
    const analyzeResult = result.analyzeResult;
    const pageData2: AzureAnalyzePage = analyzeResult?.pages?.[0] || {};
    
    // Extract words
    const words: AzurePageResult['words'] = [];
    if (pageData2.words) {
      for (const word of pageData2.words) {
        words.push({
          text: word.content || '',
          boundingBox: word.polygon || word.boundingBox || [],
          confidence: word.confidence || 0.9,
        });
      }
    }
    const headerFooterInfo = this.extractHeaderFooterText(
      pageData2,
      words
    );
    const { content, lines } = this.buildFullPageText(
      words,
      headerFooterInfo.pageHeight,
    );
    const analysisTime = Date.now() - startTime;
    
    console.log(`[Azure OCR] Page ${pageNumber} completed in ${analysisTime}ms - ${words.length} words`);

    return {
      pageNumber,
      content,
      lines,
      words,
      confidence: words.length > 0 ? 0.9 : 0.1,
      analysisTime,
      fromCache: false,
      headerText: headerFooterInfo.headerText,
      footerText: headerFooterInfo.footerText,
      headerWordCount: headerFooterInfo.headerWordCount,
      footerWordCount: headerFooterInfo.footerWordCount,
      pageHeight: headerFooterInfo.pageHeight,
      pageWidth: headerFooterInfo.pageWidth,
    };
  }

  /**
   * Extract header/footer text using bounding boxes to focus on regions
   */
  private extractHeaderFooterText(
    pageData: AzureAnalyzePage | undefined,
    words: Array<{ text: string; boundingBox: number[] }>
  ): {
    headerText: string;
    footerText: string;
    headerWordCount: number;
    footerWordCount: number;
    pageHeight?: number;
    pageWidth?: number;
  } {
    if (!words || words.length === 0) {
      return {
        headerText: '',
        footerText: '',
        headerWordCount: 0,
        footerWordCount: 0,
      };
    }

    const pageHeight =
      typeof pageData?.height === 'number' && pageData.height > 0
        ? pageData.height
        : undefined;
    const pageWidth =
      typeof pageData?.width === 'number' && pageData.width > 0
        ? pageData.width
        : undefined;

    const yValues: number[] = [];
    for (const word of words) {
      const box = word.boundingBox;
      if (!box || box.length < 2) continue;
      for (let i = 1; i < box.length; i += 2) {
        const y = box[i];
        if (typeof y === 'number' && !Number.isNaN(y)) {
          yValues.push(y);
        }
      }
    }

    const computedHeight =
      pageHeight ??
      (yValues.length > 0 ? Math.max(...yValues) : undefined);

    if (!computedHeight || computedHeight <= 0) {
      return {
        headerText: '',
        footerText: '',
        headerWordCount: 0,
        footerWordCount: 0,
        pageHeight: pageHeight,
        pageWidth: pageWidth,
      };
    }

    const getWordMetrics = (box: number[]) => {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i < box.length; i += 2) {
        const x = box[i];
        const y = box[i + 1];
        if (typeof x === 'number' && !Number.isNaN(x)) {
          xs.push(x);
        }
        if (typeof y === 'number' && !Number.isNaN(y)) {
          ys.push(y);
        }
      }
      const avg = (arr: number[]) =>
        arr.length === 0
          ? 0
          : arr.reduce((sum, val) => sum + val, 0) / arr.length;
      return {
        avgX: avg(xs),
        avgY: avg(ys),
      };
    };

    const headerCutoffRatio = 0.18;
    const footerCutoffRatio = 0.82;
    const headerWords: Array<{ text: string; avgX: number; avgY: number }> = [];
    const footerWords: Array<{ text: string; avgX: number; avgY: number }> = [];

    for (const word of words) {
      const box = word.boundingBox;
      if (!box || box.length < 4) continue;
      const metrics = getWordMetrics(box);
      const yRatio = metrics.avgY / computedHeight;

      if (!Number.isFinite(yRatio)) continue;

      if (yRatio <= headerCutoffRatio) {
        headerWords.push({ text: word.text, avgX: metrics.avgX, avgY: metrics.avgY });
      } else if (yRatio >= footerCutoffRatio) {
        footerWords.push({ text: word.text, avgX: metrics.avgX, avgY: metrics.avgY });
      }
    }

    const sortWords = (
      list: Array<{ text: string; avgX: number; avgY: number }>
    ) =>
      list
        .sort((a, b) => {
          if (a.avgY !== b.avgY) {
            return a.avgY - b.avgY;
          }
          return a.avgX - b.avgX;
        })
        .map(item => item.text)
        .join(' ')
        .trim();

    return {
      headerText: sortWords(headerWords),
      footerText: sortWords(footerWords),
      headerWordCount: headerWords.length,
      footerWordCount: footerWords.length,
      pageHeight: pageHeight ?? computedHeight,
      pageWidth,
    };
  }

  /**
   * Build full-page text/lines from OCR word data so downstream heuristics can
   * analyze body content (not just header/footer snippets).
   */
  private buildFullPageText(
    words: Array<{ text: string; boundingBox: number[] }>,
    pageHeight?: number,
  ): { content: string; lines: string[] } {
    if (!words || words.length === 0) {
      return { content: '', lines: [] };
    }

    const enrichWord = (word: { text: string; boundingBox: number[] }) => {
      const box = word.boundingBox || [];
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i < box.length; i += 2) {
        const x = box[i];
        const y = box[i + 1];
        if (typeof x === 'number' && !Number.isNaN(x)) {
          xs.push(x);
        }
        if (typeof y === 'number' && !Number.isNaN(y)) {
          ys.push(y);
        }
      }
      const avg = (values: number[]) =>
        values.length === 0
          ? Number.NaN
          : values.reduce((sum, val) => sum + val, 0) / values.length;
      return {
        text: (word.text || '').trim(),
        avgX: avg(xs),
        avgY: avg(ys),
      };
    };

    const enriched = words
      .map(enrichWord)
      .filter(
        (item) =>
          item.text.length > 0 &&
          Number.isFinite(item.avgX) &&
          Number.isFinite(item.avgY),
      );

    if (!enriched.length) {
      return { content: '', lines: [] };
    }

    const effectiveHeight =
      pageHeight && Number.isFinite(pageHeight) && pageHeight > 0
        ? pageHeight
        : Math.max(...enriched.map((item) => item.avgY)) || 1;

    const lineThreshold = Math.max(effectiveHeight * 0.02, 0.05);

    enriched.sort((a, b) => {
      if (Math.abs(a.avgY - b.avgY) <= lineThreshold) {
        return a.avgX - b.avgX;
      }
      return a.avgY - b.avgY;
    });

    const lines: string[] = [];
    let currentWords: string[] = [];
    let currentY: number | null = null;

    enriched.forEach((word) => {
      if (currentY === null || Math.abs(word.avgY - currentY) <= lineThreshold) {
        currentWords.push(word.text);
        if (currentY === null) {
          currentY = word.avgY;
        } else {
          currentY =
            (currentY * (currentWords.length - 1) + word.avgY) /
            currentWords.length;
        }
        return;
      }

      if (currentWords.length) {
        lines.push(currentWords.join(' ').trim());
      }
      currentWords = [word.text];
      currentY = word.avgY;
    });

    if (currentWords.length) {
      lines.push(currentWords.join(' ').trim());
    }

    const content = lines.join('\n').trim();
    return { content, lines };
  }

  /**
   * Analyze PDF with Azure OCR - page by page with caching
   */
  async analyzePDF(request: OCRRequest): Promise<AzureAnalysisResult> {
    const startTime = Date.now();
    const fileSize = this.getFileSize(request.file);

    console.log(`[Azure OCR] Starting PDF analysis (${(fileSize / 1024).toFixed(1)} KB)...`);
    console.log(`[Azure OCR] Cache directory: ${ocrCache.getCacheDir()}`);

    // Check if Azure is configured
    if (!this.endpoint || !this.key) {
      console.error('[Azure OCR] Not configured - missing credentials');
      return {
        pages: [],
        totalAnalysisTime: Date.now() - startTime,
        modelUsed: 'not-configured',
        requestSize: fileSize,
        endpoint: this.endpoint,
      };
    }

    try {
      // Convert file to Uint8Array
      const pdfBytes = await this.fileToUint8Array(request.file);
      const pdfHash = await hashPDFContent(pdfBytes);
      
      console.log(`[Azure OCR] PDF hash: ${pdfHash}`);

      // Load PDF to get page count
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pageCount = pdfDoc.getPageCount();

      console.log(`[Azure OCR] PDF has ${pageCount} pages`);

      const pages: AzurePageResult[] = [];
      let cacheHits = 0;
      let cacheMisses = 0;

      // Process each page individually
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        const pageNumber = pageIndex + 1;
        const cacheKey = generateCacheKey(pdfHash, pageNumber);

        // Check cache first
        if (this.config.useCache) {
          const cached = ocrCache.get(cacheKey);
          if (cached) {
            console.log(`[Azure OCR] Page ${pageNumber} - CACHE HIT ✓`);
            pages.push({ ...cached, pageNumber });
            cacheHits++;
            continue;
          }
        }

        // Cache miss - need to call Azure
        cacheMisses++;
        console.log(`[Azure OCR] Page ${pageNumber} - Cache miss, calling Azure...`);

        try {
          // Extract single page as separate PDF
          const singlePagePdf = await this.extractSinglePage(pdfBytes, pageIndex);
          
          // Rate limiting: Add delay between requests to avoid hitting rate limits
          // Azure F0 tier has strict rate limits, so we add a small delay between requests
          if (cacheMisses > 1) {
            // Add 1 second delay between requests (except for the first one)
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          // Send to Azure
          const pageResult = await this.analyzeSinglePage(singlePagePdf, pageNumber);

          // Cache the result
          if (this.config.useCache) {
            ocrCache.set(cacheKey, pageResult);
            console.log(`[Azure OCR] Page ${pageNumber} - Cached ✓`);
          }

          pages.push(pageResult);
        } catch (pageError) {
          console.error(`[Azure OCR] Page ${pageNumber} failed:`, pageError);
          pages.push({
            pageNumber,
            content: `[Page ${pageNumber} - OCR failed: ${pageError instanceof Error ? pageError.message : 'Unknown error'}]`,
            lines: [],
            words: [],
            confidence: 0,
            analysisTime: 0,
          });
        }
      }

      const totalAnalysisTime = Date.now() - startTime;
      console.log(`[Azure OCR] ========================================`);
      console.log(`[Azure OCR] Completed in ${totalAnalysisTime}ms`);
      console.log(`[Azure OCR] Cache hits: ${cacheHits}, API calls: ${cacheMisses}`);
      console.log(`[Azure OCR] ========================================`);

      return {
        pages,
        totalAnalysisTime,
        modelUsed: this.modelId,
        requestSize: fileSize,
        endpoint: this.endpoint,
        cacheHits,
        cacheMisses,
      };
    } catch (error) {
      console.error('[Azure OCR] Analysis failed:', error);
      return {
        pages: [],
        totalAnalysisTime: Date.now() - startTime,
        modelUsed: 'failed',
        requestSize: fileSize,
        endpoint: this.endpoint,
      };
    }
  }

  /**
   * Get file size from various input types
   */
  private getFileSize(file: File | ArrayBuffer | Uint8Array): number {
    if (file instanceof File) return file.size;
    if (file instanceof ArrayBuffer) return file.byteLength;
    if (file instanceof Uint8Array) return file.length;
    return 0;
  }

  /**
   * Convert file to Uint8Array
   */
  private async fileToUint8Array(file: File | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
    if (file instanceof Uint8Array) {
      return file;
    }
    if (file instanceof ArrayBuffer) {
      return new Uint8Array(file);
    }
    if (file instanceof File) {
      const arrayBuffer = await file.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }
    throw new Error('Unsupported file type');
  }

  /**
   * Get client configuration
   */
  getConfig(): AzureOCRConfig {
    return { ...this.config };
  }

  /**
   * Update client configuration
   */
  updateConfig(newConfig: Partial<AzureOCRConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.endpoint) this.endpoint = newConfig.endpoint;
    if (newConfig.key) this.key = newConfig.key;
    if (newConfig.modelId) this.modelId = newConfig.modelId;
  }

  /**
   * Check if client is ready (has credentials)
   */
  isReady(): boolean {
    return Boolean(this.endpoint && this.key);
  }

  /**
   * Clear the OCR cache
   */
  clearCache(): void {
    ocrCache.clear();
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    // No cleanup needed
  }
}

/**
 * Default OCR client instance
 */
export const defaultAzureOCRClient = new AzureOCRClient();

/**
 * Utility function to analyze PDF with Azure
 */
export async function analyzePDFWithAzure(
  file: File,
  config?: Partial<AzureOCRConfig>
): Promise<AzureAnalysisResult> {
  const client = new AzureOCRClient(config);

  try {
    return await client.analyzePDF({ file });
  } finally {
    client.dispose();
  }
}

/**
 * Utility function to test Azure connection
 */
export async function testAzureConnection(config?: Partial<AzureOCRConfig>): Promise<{ 
  success: boolean; 
  error?: string; 
  analysisTime?: number 
}> {
  const client = new AzureOCRClient(config);
  return client.testConnection();
}

/**
 * Clear all cached OCR results
 */
export function clearOCRCache(): void {
  ocrCache.clear();
}

