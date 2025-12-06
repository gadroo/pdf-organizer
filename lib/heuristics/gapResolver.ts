import type {
  ContinuationHint,
  GapResolverInput,
  GapResolverResult,
  PageContent,
  PlacementLog,
  PlacementSignal,
  SequenceDetectionSummary,
  SequenceMarker,
  StructuralPatternInfo,
} from './types';

const DEFAULT_LOG_PREFIX = '[GapResolver]';

// Simplified gap resolver: keep anchored pages, then place the rest via
// sequence markers, continuation hints, and structural anchors; append leftovers.
export function resolveOrphanPlacements({
  pageContents,
  initialOrder,
  sequenceSummary,
  structuralMap,
  continuationHints,
  logPrefix = DEFAULT_LOG_PREFIX,
}: GapResolverInput): GapResolverResult {
  const totalPages = pageContents.length;
  const order = [...initialOrder];
  const placements: PlacementLog[] = [];
  const placed = new Set(order);
  const pagePositions = new Map<number, number>();
  refreshPositions(order, pagePositions);

  const markersByPage = groupMarkersByPage(sequenceSummary);
  const placedMarkersBySystem = initializePlacedMarkers(order, markersByPage);
  const continuationMap = buildContinuationMap(continuationHints);
  const logger = (message: string) => console.log(`${logPrefix} ${message}`);

  // If nothing is anchored yet, choose a strong starting page
  if (order.length === 0 && totalPages > 0) {
    const starter = chooseStartPage(pageContents, structuralMap, markersByPage);
    order.push(starter.pageIndex);
    placements.push({
      pageIndex: starter.pageIndex,
      signal: starter.signal,
      reason: starter.reason,
    });
    placed.add(starter.pageIndex);
    refreshPositions(order, pagePositions);
    addPageMarkersToSystems(starter.pageIndex, markersByPage, placedMarkersBySystem);
  }

  const pending = new Set<number>(
    Array.from({ length: totalPages }, (_, i) => i).filter(i => !placed.has(i)),
  );

  let iteration = 0;
  const maxIterations = totalPages * 2;
  while (pending.size > 0 && iteration < maxIterations) {
    let progress = false;

    for (const pageIndex of Array.from(pending)) {
      const candidate = selectPlacementCandidate({
        pageIndex,
        order,
        pagePositions,
        markersByPage,
        placedMarkersBySystem,
        structuralMap,
        continuationMap,
      });

      if (!candidate || candidate.score < candidate.threshold) {
        continue;
      }

      order.splice(candidate.position, 0, pageIndex);
      placements.push({
        pageIndex,
        signal: candidate.signal,
        reason: candidate.reason,
      });

      placed.add(pageIndex);
      pending.delete(pageIndex);
      refreshPositions(order, pagePositions);
      addPageMarkersToSystems(pageIndex, markersByPage, placedMarkersBySystem);
      progress = true;
    }

    if (!progress) {
      break;
    }

    iteration += 1;
  }

  // Append any unresolved pages to the tail
  if (pending.size > 0) {
    const remaining = Array.from(pending).sort((a, b) => a - b);
    remaining.forEach((pageIndex) => {
      order.push(pageIndex);
      placements.push({
        pageIndex,
        signal: 'fallback',
        reason: 'Appended after unresolved heuristics',
      });
    });
  }

  const anchoredCount = initialOrder.length;
  const orphanCount = Math.max(0, totalPages - anchoredCount);
  const resolvedByHeuristics = placements.filter(p => p.signal !== 'fallback').length;
  const heuristicCoverage =
    orphanCount > 0 ? Math.min(1, resolvedByHeuristics / orphanCount) : 1;

  logger(`Placed ${placements.length} pages; heuristic coverage ${(heuristicCoverage * 100).toFixed(1)}%`);

  return {
    order,
    placements,
    heuristicCoverage,
    anchoredCount,
  };
}

type PlacementInput = {
  pageIndex: number;
  order: number[];
  pagePositions: Map<number, number>;
  markersByPage: Map<number, SequenceMarker[]>;
  placedMarkersBySystem: Map<string, SequenceMarker[]>;
  structuralMap: Map<number, StructuralPatternInfo>;
  continuationMap: Map<number, ContinuationHint>;
};

type PlacementCandidate = {
  position: number;
  score: number;
  threshold: number;
  signal: PlacementSignal;
  reason: string;
};

function selectPlacementCandidate({
  pageIndex,
  order,
  pagePositions,
  markersByPage,
  placedMarkersBySystem,
  structuralMap,
  continuationMap,
}: PlacementInput): PlacementCandidate | null {
  const candidates: PlacementCandidate[] = [];

  const sequenceCandidate = buildSequencePlacement(
    pageIndex,
    order,
    pagePositions,
    markersByPage,
    placedMarkersBySystem,
  );
  if (sequenceCandidate) {
    candidates.push(sequenceCandidate);
  }

  const continuationCandidate = buildContinuationPlacement(
    pageIndex,
    pagePositions,
    continuationMap,
  );
  if (continuationCandidate) {
    candidates.push(continuationCandidate);
  }

  const structuralCandidate = buildStructuralPlacement(
    pageIndex,
    order.length,
    structuralMap,
  );
  if (structuralCandidate) {
    candidates.push(structuralCandidate);
  }

  if (!candidates.length) {
    return null;
  }

  return candidates.sort((a, b) => b.score - a.score)[0];
}

function buildSequencePlacement(
  pageIndex: number,
  order: number[],
  pagePositions: Map<number, number>,
  markersByPage: Map<number, SequenceMarker[]>,
  placedMarkersBySystem: Map<string, SequenceMarker[]>,
): PlacementCandidate | null {
  const markers = markersByPage.get(pageIndex);
  if (!markers?.length || !order.length) {
    return null;
  }

  let bestCandidate: PlacementCandidate | null = null;
  markers.forEach((marker) => {
    const placed = placedMarkersBySystem.get(marker.system);
    if (!placed?.length) {
      return;
    }

    const prev = [...placed].filter(item => item.ordinal <= marker.ordinal).pop();
    const next = placed.find(item => item.ordinal >= marker.ordinal && item.pageIndex !== prev?.pageIndex);

    let position: number | null = null;
    let score = 0;
    let reason = '';

    if (prev && next) {
      const prevPos = pagePositions.get(prev.pageIndex);
      const nextPos = pagePositions.get(next.pageIndex);
      if (prevPos !== undefined && nextPos !== undefined) {
        position = Math.min(nextPos, prevPos + 1);
        score = 0.9 * marker.confidence;
        reason = `${marker.patternLabel} slots between ${marker.system} markers`;
      }
    } else if (prev) {
      const prevPos = pagePositions.get(prev.pageIndex);
      if (prevPos !== undefined) {
        position = prevPos + 1;
        score = 0.75 * marker.confidence;
        reason = `${marker.patternLabel} follows previous ${marker.system}`;
      }
    } else if (next) {
      const nextPos = pagePositions.get(next.pageIndex);
      if (nextPos !== undefined) {
        position = nextPos;
        score = 0.7 * marker.confidence;
        reason = `${marker.patternLabel} precedes next ${marker.system}`;
      }
    }

    if (position !== null) {
      const candidate: PlacementCandidate = {
        position,
        score,
        threshold: 0.5,
        signal: 'sequence',
        reason,
      };

      if (!bestCandidate || candidate.score > bestCandidate.score) {
        bestCandidate = candidate;
      }
    }
  });

  return bestCandidate;
}

function buildContinuationPlacement(
  pageIndex: number,
  pagePositions: Map<number, number>,
  continuationMap: Map<number, ContinuationHint>,
): PlacementCandidate | null {
  const hint = continuationMap.get(pageIndex);
  if (!hint) {
    return null;
  }

  const fromPosition = pagePositions.get(hint.fromPage);
  if (fromPosition === undefined) {
    return null;
  }

  return {
    position: fromPosition + 1,
    score: Math.min(0.95, 0.7 + hint.confidence * 0.3),
    threshold: 0.5,
    signal: 'continuation',
    reason: hint.reason,
  };
}

function buildStructuralPlacement(
  pageIndex: number,
  orderLength: number,
  structuralMap: Map<number, StructuralPatternInfo>,
): PlacementCandidate | null {
  const info = structuralMap.get(pageIndex);
  if (!info?.scores) {
    return null;
  }

  if (info.scores.has_title) {
    return {
      position: 0,
      score: 0.65,
      threshold: 0.45,
      signal: 'structural',
      reason: 'Title/header indicators suggest leading placement',
    };
  }

  if (info.scores.has_signature_space || (info.scores.footer_like ?? 0) > 0) {
    return {
      position: orderLength,
      score: 0.6,
      threshold: 0.45,
      signal: 'structural',
      reason: 'Signature/footer markers suggest trailing placement',
    };
  }

  return null;
}

function chooseStartPage(
  pageContents: PageContent[],
  structuralMap: Map<number, StructuralPatternInfo>,
  markersByPage: Map<number, SequenceMarker[]>,
): { pageIndex: number; signal: PlacementSignal; reason: string } {
  let bestPage = 0;
  let bestScore = -Infinity;
  let bestReason = 'Initialized ordering with first page';
  let bestSignal: PlacementSignal = 'initial';

  pageContents.forEach((page, index) => {
    let score = 0;
    let reason = '';
    let signal: PlacementSignal = 'initial';

    const structural = structuralMap.get(index);
    if (structural?.scores?.has_title) { score += 2; signal = 'structural'; reason = 'Strong title/header indicators'; }
    else if (structural?.scores?.has_signature_space) { score -= 1; }

    const markers = markersByPage.get(index);
    if (markers?.length) { score += 1.5; signal = 'sequence'; reason = `Contains ${markers[0].patternLabel}`; }

    score -= index * 0.05; // Gentle bias toward earlier pages if no other signals

    if (score > bestScore) { bestScore = score; bestPage = index; bestReason = reason || 'Using earliest available page as anchor'; bestSignal = signal; }
  });

  return { pageIndex: bestPage, signal: bestSignal, reason: bestReason };
}

function refreshPositions(order: number[], map: Map<number, number>): void {
  map.clear();
  order.forEach((pageIndex, position) => map.set(pageIndex, position));
}

function addPageMarkersToSystems(
  pageIndex: number,
  markersByPage: Map<number, SequenceMarker[]>,
  placed: Map<string, SequenceMarker[]>,
): void {
  const markers = markersByPage.get(pageIndex);
  if (!markers?.length) return;

  markers.forEach((marker) => {
    const list = placed.get(marker.system) ?? [];
    list.push({ ...marker, pageIndex });
    list.sort((a, b) => (a.ordinal === b.ordinal ? a.pageIndex - b.pageIndex : a.ordinal - b.ordinal));
    placed.set(marker.system, list);
  });
}

function initializePlacedMarkers(
  initialOrder: number[],
  markersByPage: Map<number, SequenceMarker[]>,
): Map<string, SequenceMarker[]> {
  const placed = new Map<string, SequenceMarker[]>();
  initialOrder.forEach((pageIndex) => addPageMarkersToSystems(pageIndex, markersByPage, placed));
  return placed;
}

function buildContinuationMap(hints: ContinuationHint[]): Map<number, ContinuationHint> {
  const map = new Map<number, ContinuationHint>();
  hints.forEach((hint) => {
    const existing = map.get(hint.toPage);
    if (!existing || hint.confidence > existing.confidence) map.set(hint.toPage, hint);
  });
  return map;
}

function groupMarkersByPage(summary: SequenceDetectionSummary): Map<number, SequenceMarker[]> {
  const markersByPage = new Map<number, SequenceMarker[]>();
  summary.markers.forEach((marker) => {
    const list = markersByPage.get(marker.pageIndex) ?? [];
    list.push(marker);
    markersByPage.set(marker.pageIndex, list);
  });
  return markersByPage;
}
