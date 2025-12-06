import { detectContinuationHints } from '../continuationDetection';
import { createPageContent } from './fixtures/heuristics';

describe('detectContinuationHints', () => {
  it('detects explicit continuation keywords between pages', () => {
    const pages = [
      createPageContent(0, 'First page ends here.'),
      createPageContent(1, 'Continued on next page\nNew section starts'),
    ];

    const hints = detectContinuationHints(pages);

    expect(hints).toEqual([
      {
        fromPage: 0,
        toPage: 1,
        confidence: 0.9,
        reason: 'Explicit continuation marker detected',
      },
    ]);
  });

  it('detects mid-sentence continuation when punctuation is missing', () => {
    const pages = [
      createPageContent(0, 'Clause continues without punctuation or ending'),
      createPageContent(1, 'still in the middle of the same sentence'),
    ];

    const hints = detectContinuationHints(pages);

    expect(hints).toEqual([
      expect.objectContaining({
        fromPage: 0,
        toPage: 1,
        confidence: 0.65,
        reason: 'Detected mid-sentence continuation across pages',
      }),
    ]);
  });

  it('detects continuation when page ends with a hyphenated word', () => {
    const pages = [
      createPageContent(0, 'The agree-'),
      createPageContent(1, 'ment shall continue'),
    ];

    const hints = detectContinuationHints(pages);

    expect(hints).toEqual([
      expect.objectContaining({
        fromPage: 0,
        toPage: 1,
        reason: 'Detected mid-sentence continuation across pages',
      }),
    ]);
  });

  it('detects uppercase continuation keywords', () => {
    const pages = [
      createPageContent(0, 'Prior content.'),
      createPageContent(1, 'CONTINUED ON NEXT PAGE'),
    ];

    const hints = detectContinuationHints(pages);

    expect(hints).toEqual([
      expect.objectContaining({
        fromPage: 0,
        toPage: 1,
        confidence: 0.9,
      }),
    ]);
  });

  it('ignores pages when content is already well-terminated', () => {
    const pages = [
      createPageContent(0, 'This section ends cleanly.'),
      createPageContent(1, 'Next section starts with a heading'),
    ];

    const hints = detectContinuationHints(pages);

    expect(hints).toHaveLength(0);
  });
});
