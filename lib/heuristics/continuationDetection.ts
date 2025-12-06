import type { ContinuationHint, PageContent } from './types';

export const CONTINUATION_KEYWORDS: string[] = [
  'continued on',
  'continued from',
  '(continued)',
  'continuation of',
];

export function detectContinuationHints(pageContents: PageContent[]): ContinuationHint[] {
  const hints: ContinuationHint[] = [];

  for (let i = 0; i < pageContents.length - 1; i += 1) {
    const current = (pageContents[i].content || '').trim();
    const next = (pageContents[i + 1].content || '').trim();
    if (!current || !next) {
      continue;
    }

    const nextFirstLine = next.split('\n')[0].trim();
    const explicitContinuation = CONTINUATION_KEYWORDS.some(keyword =>
      nextFirstLine.toLowerCase().includes(keyword.toLowerCase()),
    );

    if (explicitContinuation) {
      hints.push({
        fromPage: i,
        toPage: i + 1,
        confidence: 0.9,
        reason: 'Explicit continuation marker detected',
      });
      continue;
    }

    const lastChar = current.slice(-1);
    const endsWithPunctuation = /[.!?]/.test(lastChar);
    const endsWithHyphen = current.endsWith('-');
    const endsWithConjunction = /\b(and|or|to|of|with|for|from|by|that|which|if)\s*$/i.test(current);
    const nextStartsLower = /^[a-z]/.test(nextFirstLine);

    if ((!endsWithPunctuation || endsWithHyphen || endsWithConjunction) && nextStartsLower) {
      hints.push({
        fromPage: i,
        toPage: i + 1,
        confidence: 0.65,
        reason: 'Detected mid-sentence continuation across pages',
      });
    }
  }

  return hints;
}

