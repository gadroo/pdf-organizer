import { PDFManipulator } from '../manipulate';
import { PDFDocument } from 'pdf-lib';

describe('PDFManipulator validate order', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
  });

  it('rejects empty order, duplicates, missing pages, and out-of-range indices', async () => {
    const manipulator = new PDFManipulator();
    const doc = await PDFDocument.create();
    doc.addPage(); doc.addPage(); doc.addPage();
    const bytes = await doc.save();
    await manipulator.loadPDF(bytes);

    await expect(manipulator.reorderPages([])).resolves.toMatchObject({
      success: false,
      error: 'Page order cannot be empty',
    });

    await expect(manipulator.reorderPages([0, 0, 1])).resolves.toMatchObject({
      success: false,
      error: 'Page order contains duplicate indices',
    });

    await expect(manipulator.reorderPages([0, 2])).resolves.toMatchObject({
      success: false,
      error: 'Missing pages: 1',
    });

    await expect(manipulator.reorderPages([0, 1, 3])).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Invalid page index'),
    });
  });

  it('accepts a complete valid order and returns a page map', async () => {
    const manipulator = new PDFManipulator();
    const doc = await PDFDocument.create();
    doc.addPage(); doc.addPage(); doc.addPage();
    const bytes = await doc.save();
    await manipulator.loadPDF(bytes);

    const result = await manipulator.reorderPages([2, 1, 0]);

    expect(result.success).toBe(true);
    expect(result.pageMap).toEqual([
      { originalIndex: 2, displayIndex: 0 },
      { originalIndex: 1, displayIndex: 1 },
      { originalIndex: 0, displayIndex: 2 },
    ]);
    expect(result.newPDF).toBeInstanceOf(Uint8Array);
  });
});
