import type {
  OrderingResult,
  PageContent,
  BaseOrderingStrategy,
  DocumentConfig,
  SequenceDetectionSummary,
  StructuralPatternInfo,
  ContinuationHint,
  PlacementLog,
} from './types';

import { detectSequenceMarkers } from './sequenceMarkers';
import { detectContinuationHints } from './continuationDetection';
import { analyzeStructuralAnchors } from './structuralAnchors';
import { resolveOrphanPlacements } from './gapResolver';
import { detectExplicitPageNumbers } from './pageNumberDetection';

interface NumberSequenceStats {
  coverage: number;
  missingNumbers: number[];
  duplicateNumbers: number[];
  sequenceQuality: number;
}

interface ReasoningContext {
  anchoredCount: number;
  totalPages: number;
  coverage: number;
  sequenceQuality: number;
  heuristicCoverage: number;
  placements: PlacementLog[];
}

/**
 * PageNumberStrategy - Detects and orders pages based on explicit page numbers.
 * Ported from Python PageNumberStrategy in strategies.py lines 55-236
 */
export class PageNumberStrategy implements BaseOrderingStrategy {
  readonly name = 'PageNumberStrategy';
  readonly threshold = 0.8;
  private config: string[] = [];
  private static readonly GAP_LOG_PREFIX = '[GapResolver]';
  private static readonly FALLBACK_PATTERN_POOL = [
    '-(\\d+)-',
    '—(\\d+)—',
    '–(\\d+)–',
    '- (\\d+) -',
    '^\\s*-(\\d+)-\\s*$',
    'page\\s+(\\d+)',
    '(\\d+)\\s+of\\s+\\d+',
    '^\\s*(\\d+)\\s*$',
    'p\\.?\\s*(\\d+)',
  ];

  constructor(documentConfig?: DocumentConfig) {
    // Load patterns from config if available
    this.config = this.loadPageNumberPatterns(documentConfig);
  }

  /**
   * Load page number regex patterns from config if available.
   *
   * IMPORTANT: Keep this simple and robust. Ordering logic relies
   * on these patterns being stable; we avoid overfitting here.
   *
   * NOTE: The config file in this repo is named 'docRules.json'.
   * If that ever changes, this should be the *only* place that
   * needs updating for page-number patterns.
   */
  private loadPageNumberPatterns(documentConfig?: DocumentConfig): string[] {
    const patterns = documentConfig?.general_patterns?.page_number_patterns;

    if (patterns && Array.isArray(patterns)) {
      return patterns;
    }

    // Fallback patterns if config is not available
    return [
      '-(\d+)-',        // -7-, -20- pattern
      'page\s+(\d+)',    // Standard page notation
      '(\d+)\s+of\s+\d+', // X of Y format
      '^\s*(\d+)\s*$',  // Just a number on its line
      'p\.?\s*(\d+)',    // p.7 or p 7
    ];
  }

  /**
   * Check if this strategy can handle the given pages
   */
  canHandle(pageContents: PageContent[]): boolean {
    return pageContents.length > 0;
  }

  /**
   * Attempt to order pages based on detected page numbers
   */
  async attemptOrdering(pageContents: PageContent[]): Promise<OrderingResult> {
    const totalPages = pageContents.length;

    console.log(
      `\nTesting page number detection with ${this.config.length} page-number patterns...`,
    );

    const { pageNumbers, patternMatches } = detectExplicitPageNumbers(
      pageContents,
      this.buildPatternList(),
      (message) => console.log(message),
    );

    console.log(
      `Successfully detected page numbers for ${Object.keys(pageNumbers).length}/${totalPages} pages`,
    );

    const sequenceStats = this.summarizeNumberSequence(pageNumbers, totalPages);
    const {
      sequenceSummary,
      structuralMap,
      continuationHints,
    } = this.gatherPlacementSignals(pageContents);

    const {
      order,
      placements,
      heuristicCoverage,
      anchoredCount,
    } = resolveOrphanPlacements({
      pageContents,
      initialOrder: this.buildInitialOrder(pageNumbers),
      sequenceSummary,
      structuralMap,
      continuationHints,
      logPrefix: PageNumberStrategy.GAP_LOG_PREFIX,
    });

    const finalConfidence = this.computeConfidence(
      sequenceStats.coverage,
      sequenceStats.sequenceQuality,
      heuristicCoverage,
    );

    const reasoning = this.buildReasoning({
      anchoredCount,
      totalPages,
      coverage: sequenceStats.coverage,
      sequenceQuality: sequenceStats.sequenceQuality,
      heuristicCoverage,
      placements,
    });

    return {
      order,
      confidence: finalConfidence,
      reasoning,
      method: 'explicit_page_numbers',
      metadata: {
        pageNumbers,
        coverage: sequenceStats.coverage,
        sequenceQuality: sequenceStats.sequenceQuality,
        missingNumbers: sequenceStats.missingNumbers,
        duplicateNumbers: sequenceStats.duplicateNumbers,
        patternMatches: Object.values(patternMatches),
        placements,
      },
    };
  }


  private summarizeNumberSequence(
    pageNumbers: Record<number, number>,
    totalPages: number,
  ): NumberSequenceStats {
    const detectedNumbers = Object.values(pageNumbers);
    const coverage = totalPages > 0
      ? Math.min(1, detectedNumbers.length / totalPages)
      : 0;

    if (!detectedNumbers.length) {
      return {
        coverage,
        missingNumbers: [],
        duplicateNumbers: [],
        sequenceQuality: 0.5,
      };
    }

    const counts: Record<number, number> = {};
    detectedNumbers.forEach((num) => {
      counts[num] = (counts[num] || 0) + 1;
    });

    const maxNum = Math.max(...detectedNumbers);
    const missingNumbers: number[] = [];
    for (let n = 1; n <= maxNum + 1; n += 1) {
      if (!counts[n]) {
        missingNumbers.push(n);
      }
    }

    const duplicateNumbers = Object.entries(counts)
      .filter(([, count]) => count > 1)
      .map(([num]) => Number.parseInt(num, 10));

    const sortedNums = detectedNumbers.slice().sort((a, b) => a - b);
    const sequenceGaps = sortedNums
      .slice(1)
      .reduce((acc, current, idx) => {
        const previous = sortedNums[idx];
        return acc + (current - previous > 1 ? 1 : 0);
      }, 0);

    const sequenceQuality = sortedNums.length
      ? 1 - (sequenceGaps / sortedNums.length)
      : 0.5;

    return {
      coverage,
      missingNumbers,
      duplicateNumbers,
      sequenceQuality,
    };
  }

  private gatherPlacementSignals(pageContents: PageContent[]): {
    sequenceSummary: SequenceDetectionSummary;
    structuralMap: Map<number, StructuralPatternInfo>;
    continuationHints: ContinuationHint[];
  } {
    const sequenceSummary = detectSequenceMarkers(pageContents);
    const structuralInfos = analyzeStructuralAnchors(pageContents);
    const continuationHints = detectContinuationHints(pageContents);
    const structuralMap = new Map<number, StructuralPatternInfo>(
      structuralInfos.map(info => [info.index, info]),
    );

    return { sequenceSummary, structuralMap, continuationHints };
  }

  private buildInitialOrder(pageNumbers: Record<number, number>): number[] {
    return Object.entries(pageNumbers)
      .sort(([, a], [, b]) => a - b)
      .map(([pageIndex]) => Number.parseInt(pageIndex, 10));
  }

  private computeConfidence(
    coverage: number,
    sequenceQuality: number,
    heuristicCoverage: number,
  ): number {
    const minCoverage = 0.6;
    const baseConfidence = coverage >= minCoverage
      ? Math.min(coverage, 0.9)
      : Math.max(0.35, coverage * 0.7);
    const sequenceBonus = sequenceQuality * 0.1;
    const heuristicBonus = heuristicCoverage * 0.15;
    return Math.min(0.98, baseConfidence + sequenceBonus + heuristicBonus);
  }

  private buildReasoning({
    anchoredCount,
    totalPages,
    coverage,
    sequenceQuality,
    heuristicCoverage,
    placements,
  }: ReasoningContext): string[] {
    const reasoning = [
      `Detected explicit page numbers on ${anchoredCount}/${totalPages} pages (coverage ${(coverage * 100).toFixed(1)}%)`,
      `Sequence quality ${(sequenceQuality * 100).toFixed(1)}%; heuristic coverage ${(heuristicCoverage * 100).toFixed(1)}% for orphan pages`,
      placements.length
        ? `Resolved ${placements.length} pages without numbers using continuation, sequence markers, and structural anchors`
        : 'All pages already had explicit numbers',
    ];

    placements.slice(0, 5).forEach((placement) => {
      reasoning.push(
        `Page ${placement.pageIndex + 1}: ${placement.signal} → ${placement.reason}`,
      );
    });

    return reasoning;
  }

  private buildPatternList(): string[] {
    const patternPool = [
      ...this.config,
      ...PageNumberStrategy.FALLBACK_PATTERN_POOL,
    ];
    const normalized = patternPool
      .filter(pattern => typeof pattern === 'string')
      .map(pattern => pattern.trim())
      .filter(Boolean);
    return Array.from(new Set(normalized));
  }

  /**
   * Get confidence thresholds for this strategy
   */
  getConfidenceThresholds(): { high: number; medium: number; low: number } {
    return {
      high: 0.85,
      medium: 0.7,
      low: 0.5,
    };
  }
}
