import type {
  ContinuationHint,
  PageContent,
  SequenceDetectionSummary,
  SequenceMarker,
  SequenceSystem,
  StructuralPattern,
  StructuralPatternInfo,
} from '../../types';

export function createPageContent(
  index: number,
  content: string,
  metadata?: Record<string, unknown>,
): PageContent {
  return {
    index,
    content,
    ocrText: content,
    confidence: 0.5,
    metadata,
  };
}

export function createSequenceMarker(
  pageIndex: number,
  system: SequenceSystem,
  ordinal: number,
  overrides: Partial<SequenceMarker> = {},
): SequenceMarker {
  return {
    pageIndex,
    system,
    ordinal,
    value: overrides.value ?? ordinal.toString(),
    valueKind: overrides.valueKind ?? 'numeric',
    raw: overrides.raw ?? ordinal.toString(),
    region: overrides.region ?? 'full_page',
    confidence: overrides.confidence ?? 0.9,
    patternLabel: overrides.patternLabel ?? `sequence-${ordinal}`,
    ...overrides,
  };
}

export function buildSequenceSummary(markers: SequenceMarker[]): SequenceDetectionSummary {
  const markersBySystem: SequenceDetectionSummary['markersBySystem'] = {};

  markers.forEach((marker) => {
    const list = markersBySystem[marker.system] ?? [];
    list.push(marker);
    markersBySystem[marker.system] = list;
  });

  Object.values(markersBySystem).forEach((list) => {
    list.sort((a, b) => (a.ordinal === b.ordinal ? a.pageIndex - b.pageIndex : a.ordinal - b.ordinal));
  });

  return { markers, markersBySystem };
}

export function buildStructuralMap(
  entries: Array<{
    index: number;
    scores: StructuralPattern;
    priority?: number;
    overallScore?: number;
    content?: string;
  }>,
): Map<number, StructuralPatternInfo> {
  return new Map(
    entries.map(({ index, scores, priority = 50, overallScore = 0, content = '' }) => [
      index,
      {
        index,
        scores,
        priority,
        overallScore,
        content,
      },
    ]),
  );
}

export function createContinuationHint(
  fromPage: number,
  toPage: number,
  reason: string,
  confidence = 0.9,
): ContinuationHint {
  return { fromPage, toPage, reason, confidence };
}
