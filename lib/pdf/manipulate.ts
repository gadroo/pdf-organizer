import { PDFDocument, PDFPage } from 'pdf-lib';

export interface PageOrder {
  originalIndex: number;
  displayIndex: number;
}

export interface ExportOptions {
  filename?: string;
  author?: string;
  title?: string;
  subject?: string;
  creator?: string;
  keywords?: string;
  creationDate?: Date;
  modificationDate?: Date;
}

export interface ReorderResult {
  success: boolean;
  newPDF: Uint8Array;
  pageMap: PageOrder[];
  error?: string;
}

export class PDFManipulator {
  private pdfDoc: PDFDocument | null = null;
  private originalPages: PDFPage[] = [];
  private totalPages: number = 0;

  constructor() {
    this.pdfDoc = null;
    this.originalPages = [];
    this.totalPages = 0;
  }

  /**
   * Load PDF from various input sources
   */
  async loadPDF(input: Uint8Array | ArrayBuffer | File): Promise<void> {
    try {
      let pdfBytes: Uint8Array;

      if (input instanceof File) {
        pdfBytes = new Uint8Array(await input.arrayBuffer());
      } else if (input instanceof ArrayBuffer) {
        pdfBytes = new Uint8Array(input);
      } else {
        pdfBytes = input;
      }

      this.pdfDoc = await PDFDocument.load(pdfBytes);
      this.originalPages = this.pdfDoc.getPages();
      this.totalPages = this.originalPages.length;
    } catch (error) {
      throw new Error(`Failed to load PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Reorder pages based on new order array
   */
  async reorderPages(newOrder: number[]): Promise<ReorderResult> {
    if (!this.pdfDoc) {
      return {
        success: false,
        newPDF: new Uint8Array(),
        pageMap: [],
        error: 'PDF not loaded',
      };
    }

    // Validate newOrder
    const isValidOrder = this.validateOrder(newOrder);
    if (!isValidOrder.valid) {
      return {
        success: false,
        newPDF: new Uint8Array(),
        pageMap: [],
        error: isValidOrder.error || 'Invalid page order',
      };
    }

    try {
      // Create new PDF document
      const newPDFDoc = await PDFDocument.create();

      // Copy all pages in the new order
      const copiedPages: PDFPage[] = [];
      for (const originalIndex of newOrder) {
        const [copiedPage] = await newPDFDoc.copyPages(this.pdfDoc, [originalIndex]);
        copiedPages.push(copiedPage);
        newPDFDoc.addPage(copiedPage);
      }

      // Create page map for tracking
      const pageMap: PageOrder[] = newOrder.map((originalIndex, displayIndex) => ({
        originalIndex,
        displayIndex,
      }));

      // Serialize the new PDF
      const newPDFBytes = await newPDFDoc.save();

      // Update internal state
      this.pdfDoc = newPDFDoc;
      this.originalPages = copiedPages;

      return {
        success: true,
        newPDF: newPDFBytes,
        pageMap,
      };
    } catch (error) {
      return {
        success: false,
        newPDF: new Uint8Array(),
        pageMap: [],
        error: `Failed to reorder pages: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Validate page order array
   */
  private validateOrder(order: number[]): { valid: boolean; error?: string } {
    // Check if order is empty
    if (order.length === 0) {
      return { valid: false, error: 'Page order cannot be empty' };
    }

    // Check if all indices are valid (0-based)
    const maxIndex = this.totalPages - 1;
    for (const index of order) {
      if (!Number.isInteger(index) || index < 0 || index > maxIndex) {
        return {
          valid: false,
          error: `Invalid page index: ${index}. Must be between 0 and ${maxIndex}`,
        };
      }
    }

    // Check for duplicates
    const uniqueIndices = new Set(order);
    if (uniqueIndices.size !== order.length) {
      return {
        valid: false,
        error: 'Page order contains duplicate indices',
      };
    }

    // Check if all pages are included
    const expectedIndices = Array.from({ length: this.totalPages }, (_, i) => i);
    const missingIndices = expectedIndices.filter(i => !uniqueIndices.has(i));
    if (missingIndices.length > 0) {
      return {
        valid: false,
        error: `Missing pages: ${missingIndices.join(', ')}`,
      };
    }

    return { valid: true };
  }

  /**
   * Add metadata to PDF
   */
  async addMetadata(options: ExportOptions): Promise<void> {
    if (!this.pdfDoc) {
      throw new Error('PDF not loaded');
    }

    if (options.title !== undefined) {
      this.pdfDoc.setTitle(options.title);
    }
    if (options.author !== undefined) {
      this.pdfDoc.setAuthor(options.author);
    }
    if (options.subject !== undefined) {
      this.pdfDoc.setSubject(options.subject);
    }
    if (options.creator !== undefined) {
      this.pdfDoc.setCreator(options.creator);
    }
    if (options.keywords !== undefined) {
      this.pdfDoc.setKeywords([options.keywords]);
    }
    if (options.creationDate) {
      this.pdfDoc.setCreationDate(options.creationDate);
    }
    if (options.modificationDate) {
      this.pdfDoc.setModificationDate(options.modificationDate || new Date());
    }
  }

  /**
   * Export PDF with current page order
   */
  async exportPDF(options: ExportOptions = {}): Promise<Uint8Array> {
    if (!this.pdfDoc) {
      throw new Error('PDF not loaded');
    }

    try {
      // Add metadata if provided
      await this.addMetadata(options);

      // Save and return PDF bytes
      return await this.pdfDoc.save();
    } catch (error) {
      throw new Error(`Failed to export PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Export PDF as Blob for download
   */
  async exportAsBlob(options: ExportOptions = {}): Promise<Blob> {
    const pdfBytes = await this.exportPDF(options);
    // Convert Uint8Array to ArrayBuffer to avoid SharedArrayBuffer issues
    const buffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
    return new Blob([buffer], { type: 'application/pdf' });
  }

  /**
   * Create download URL for PDF
   */
  async createDownloadURL(options: ExportOptions = {}): Promise<string> {
    const blob = await this.exportAsBlob(options);
    return URL.createObjectURL(blob);
  }

  /**
   * Download PDF directly to user's device
   */
  async downloadPDF(options: ExportOptions = {}): Promise<void> {
    const downloadURL = await this.createDownloadURL(options);
    const filename = options.filename || 'reordered-document.pdf';

    try {
      // Create temporary link element for download
      const link = document.createElement('a');
      link.href = downloadURL;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the URL
      URL.revokeObjectURL(downloadURL);
    } catch (error) {
      // Clean up URL on error as well
      URL.revokeObjectURL(downloadURL);
      throw new Error(`Failed to download PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.pdfDoc = null;
    this.originalPages = [];
    this.totalPages = 0;
  }
}
