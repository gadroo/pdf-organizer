import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

// Configure PDF.js worker with reliable CDN
if (typeof window !== 'undefined') {
  // Use jsDelivr CDN with HTTPS (more reliable than unpkg)
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export interface RenderOptions {
  scale?: number;
  quality?: number;
  format?: 'png' | 'jpeg';
  maintainAspectRatio?: boolean;
}

export interface PageInfo {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
}

export class PDFRenderer {
  private pdfDocument: PDFDocumentProxy | null = null;
  private totalPages: number = 0;

  constructor() {
    this.pdfDocument = null;
    this.totalPages = 0;
  }

  /**
   * Load PDF from ArrayBuffer or Uint8Array
   */
  async loadPDF(arrayBuffer: ArrayBuffer | Uint8Array): Promise<void> {
    try {
      this.pdfDocument = await pdfjsLib.getDocument({
        data: arrayBuffer,
        // Optimize for thumbnail generation
        disableAutoFetch: true,
        disableStream: true,
      }).promise;

      this.totalPages = this.pdfDocument.numPages;
    } catch (error) {
      throw new Error(`Failed to load PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get total number of pages
   */
  getPageCount(): number {
    return this.totalPages;
  }

  /**
   * Get basic page information without rendering
   */
  async getPageInfo(pageNumber: number): Promise<PageInfo> {
    if (!this.pdfDocument) {
      throw new Error('PDF not loaded');
    }

    if (pageNumber < 1 || pageNumber > this.totalPages) {
      throw new Error(`Invalid page number: ${pageNumber}`);
    }

    const page = await this.pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.0 });

    return {
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      rotation: viewport.rotation,
    };
  }

  /**
   * Render page thumbnail as canvas
   */
  async renderPageAsCanvas(
    pageNumber: number,
    options: RenderOptions = {}
  ): Promise<HTMLCanvasElement> {
    if (!this.pdfDocument) {
      throw new Error('PDF not loaded');
    }

    if (pageNumber < 1 || pageNumber > this.totalPages) {
      throw new Error(`Invalid page number: ${pageNumber}`);
    }

    const {
      scale = 0.3, // Default scale for thumbnails
      quality = 0.8,
      format = 'png',
      maintainAspectRatio = true,
    } = options;

    try {
      const page: PDFPageProxy = await this.pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale });

      // Create canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Could not get 2D context');
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Render PDF page into canvas context
      await page.render({
        canvasContext: context,
        viewport,
        canvas,
      }).promise;

      return canvas;
    } catch (error) {
      throw new Error(`Failed to render page ${pageNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Render page thumbnail as data URL
   */
  async renderPageAsDataURL(
    pageNumber: number,
    options: RenderOptions = {}
  ): Promise<string> {
    const canvas = await this.renderPageAsCanvas(pageNumber, options);

    const {
      quality = 0.8,
      format = 'png',
    } = options;

    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';

    return canvas.toDataURL(mimeType, quality);
  }

  /**
   * Render multiple pages in parallel
   */
  async renderMultiplePages(
    pageNumbers: number[],
    options: RenderOptions = {}
  ): Promise<{ pageNumber: number; dataURL: string; info: PageInfo }[]> {
    if (!this.pdfDocument) {
      throw new Error('PDF not loaded');
    }

    // Filter valid page numbers
    const validPageNumbers = pageNumbers.filter(
      pageNum => pageNum >= 1 && pageNum <= this.totalPages
    );

    if (validPageNumbers.length === 0) {
      return [];
    }

    // Render pages in parallel with concurrency limit
    const concurrencyLimit = 4; // Limit to avoid browser overload
    const results: { pageNumber: number; dataURL: string; info: PageInfo }[] = [];

    for (let i = 0; i < validPageNumbers.length; i += concurrencyLimit) {
      const batch = validPageNumbers.slice(i, i + concurrencyLimit);

      const batchResults = await Promise.all(
        batch.map(async (pageNumber) => {
          const [dataURL, info] = await Promise.all([
            this.renderPageAsDataURL(pageNumber, options),
            this.getPageInfo(pageNumber),
          ]);

          return { pageNumber, dataURL, info };
        })
      );

      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.pdfDocument = null;
    this.totalPages = 0;
  }
}
