import { PageNumberStrategy } from '../pageNumbers';
import { createPageContent } from './fixtures/heuristics';

describe('PageNumberStrategy – messy scanned mix', () => {
  it('orders detected numbers, keeps duplicates adjacent, and appends unnumbered in original order', async () => {
    const pages = [
      createPageContent(0, 'HEADER 1 of 3'),
      createPageContent(1, 'Unnumbered cover'),
      createPageContent(2, 'Footer text - 2 -'),
      createPageContent(3, 'Continues... 2 of 3'),
      createPageContent(4, 'Header 3 of 3'),
      createPageContent(5, 'Another unnumbered page'),
      createPageContent(6, '- 4 -'),
      createPageContent(7, 'Misc page no number'),
      createPageContent(8, '- 5 -'),
      createPageContent(9, 'Footer - 6 -'),
      createPageContent(10, 'Scan w/out number'),
      createPageContent(11, '7 of 7'),
    ];

    const strategy = new PageNumberStrategy();
    const result = await strategy.attemptOrdering(pages);

    // Numbered pages are sequenced with duplicates kept adjacent; unnumbered pages retain original relative order at the end
    expect(result.order).toEqual([0, 2, 3, 4, 6, 8, 9, 11, 1, 5, 7, 10]);

    // Duplicate flag shows up in metadata
    expect(result.metadata?.duplicateNumbers).toContain(2);

    // Confidence should be above the low bar since coverage is >60% and gaps resolved
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});

