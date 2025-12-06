import { resolveOrphanPlacements } from '../gapResolver';
import {
  buildSequenceSummary,
  buildStructuralMap,
  createPageContent,
  createSequenceMarker,
  createContinuationHint,
} from './fixtures/heuristics';

describe('resolveOrphanPlacements', () => {
  it('orders pages using sequence markers and appends unresolved pages', () => {
    const pageContents = [
      createPageContent(0, 'Section 1'),
      createPageContent(1, 'Section 2'),
      createPageContent(2, 'Appendix'),
    ];

    const sequenceSummary = buildSequenceSummary([
      createSequenceMarker(0, 'section', 1, { patternLabel: 'Section 1' }),
      createSequenceMarker(1, 'section', 2, { patternLabel: 'Section 2' }),
    ]);

    const structuralMap = buildStructuralMap([
      { index: 0, scores: {} },
      { index: 1, scores: {} },
      { index: 2, scores: {} },
    ]);

    const result = resolveOrphanPlacements({
      pageContents,
      initialOrder: [0],
      sequenceSummary,
      structuralMap,
      continuationHints: [],
      logPrefix: '[test]',
    });

    expect(result.order).toEqual([0, 1, 2]);
    expect(result.placements).toEqual([
      expect.objectContaining({ pageIndex: 1, signal: 'sequence' }),
      expect.objectContaining({ pageIndex: 2, signal: 'fallback' }),
    ]);
    expect(result.anchoredCount).toBe(1);
    expect(result.heuristicCoverage).toBeCloseTo(0.5);
  });

  it('places continuation pages immediately after their source', () => {
    const pageContents = [
      createPageContent(0, 'Intro'),
      createPageContent(1, 'continued on next page'),
      createPageContent(2, 'Main body'),
    ];

    const continuationHints = [createContinuationHint(0, 1, 'Explicit continuation')];

    const result = resolveOrphanPlacements({
      pageContents,
      initialOrder: [0],
      sequenceSummary: buildSequenceSummary([]),
      structuralMap: buildStructuralMap([
        { index: 0, scores: {} },
        { index: 1, scores: {} },
        { index: 2, scores: {} },
      ]),
      continuationHints,
      logPrefix: '[test]',
    });

    expect(result.order.slice(0, 2)).toEqual([0, 1]);
    expect(result.placements.some(p => p.signal === 'continuation')).toBe(true);
  });

  it('sends signature/footer-like pages to the tail', () => {
    const pageContents = [
      createPageContent(0, 'Header'),
      createPageContent(1, 'Signature ________'),
    ];

    const result = resolveOrphanPlacements({
      pageContents,
      initialOrder: [0],
      sequenceSummary: buildSequenceSummary([]),
      structuralMap: buildStructuralMap([
        { index: 0, scores: {} },
        { index: 1, scores: { has_signature_space: 1, footer_like: 1 } },
      ]),
      continuationHints: [],
      logPrefix: '[test]',
    });

    expect(result.order).toEqual([0, 1]);
    expect(result.placements.find(p => p.pageIndex === 1)?.signal).toBe('structural');
  });

  it('breaks out when no placements are possible and appends via fallback', () => {
    const pageContents = [
      createPageContent(0, 'Page A'),
      createPageContent(1, 'Page B'),
    ];

    const result = resolveOrphanPlacements({
      pageContents,
      initialOrder: [],
      sequenceSummary: buildSequenceSummary([]),
      structuralMap: buildStructuralMap([]),
      continuationHints: [],
      logPrefix: '[test]',
    });

    expect(result.order).toEqual([0, 1]);
    expect(result.placements.every(p => p.signal === 'fallback' || p.signal === 'initial')).toBe(true);
  });

  it('picks a structural start page when nothing is anchored and still falls back for stragglers', () => {
    const pageContents = [
      createPageContent(0, 'TITLE PAGE'),
      createPageContent(1, 'Signature ________'),
      createPageContent(2, 'Main body content.'),
    ];

    const structuralMap = buildStructuralMap([
      { index: 0, scores: { has_title: 1 } },
      { index: 1, scores: { has_signature_space: 1, footer_like: 1 } },
      { index: 2, scores: {} },
    ]);

    const result = resolveOrphanPlacements({
      pageContents,
      initialOrder: [],
      sequenceSummary: buildSequenceSummary([]),
      structuralMap,
      continuationHints: [],
      logPrefix: '[test]',
    });

    expect(result.order).toEqual([0, 1, 2]);
    expect(result.placements[0]).toEqual(
      expect.objectContaining({ pageIndex: 0, signal: 'structural' }),
    );
    expect(result.placements.some(entry => entry.signal === 'fallback')).toBe(true);
    expect(result.heuristicCoverage).toBeGreaterThan(0.5);
  });
});
