import type {
  OrderingResult,
  PageContent,
  BaseOrderingStrategy,
  StructuralPattern,
  StructuralPatternInfo,
} from './types';
import {
  analyzeStructuralAnchors,
  calculateStructuralOverallScore,
  calculateStructuralPriority,
} from './structuralAnchors';

export interface StructuralPatternConfig {
  priority: number;
  weight: number;
}

/**
 * Strategy to detect structural patterns like headers, footers, and layout elements
 * Orders pages based on document structure (title pages first, signatures last)
 */
export class StructuralPatternStrategy implements BaseOrderingStrategy {
  readonly name = 'StructuralPatternStrategy';
  readonly threshold = 0.5;
  private config: StructuralPatternConfig;

  constructor(config?: Partial<StructuralPatternConfig>) {
    this.config = {
      priority: 70,
      weight: 1.0,
      ...config,
    };
  }

  /**
   * Check if this strategy can handle the given pages
   */
  canHandle(pageContents: PageContent[]): boolean {
    return pageContents.length > 0;
  }

  /**
   * Attempt to order pages based on structural patterns
   */
  async attemptOrdering(pageContents: PageContent[]): Promise<OrderingResult> {
    const structuralScores: StructuralPatternInfo[] = [];

    console.log(`\nAnalyzing structural patterns across ${pageContents.length} pages...`);

    for (let i = 0; i < pageContents.length; i++) {
      const page = pageContents[i];
      const content = page.content;
      const lines = content.split('\n');

      const scoreFactors: StructuralPattern = {
        header_like: 0,
        footer_like: 0,
        content_density: lines.length > 0 ? content.split(/\s+/).length / Math.max(1, lines.length) : 0,
        has_title: 0,
        has_signature_space: 0,
      };

      // Check for header-like patterns (first 3 lines)
      if (lines.length > 0) {
        const firstLines = lines.slice(0, 3);
        for (const line of firstLines) {
          if (/^[A-Z][A-Z\s]+$/.test(line.trim())) {
            scoreFactors.header_like = (scoreFactors.header_like ?? 0) + 1;
          }
          if (/\b(application|report|document|agreement|contract)\b/i.test(line)) {
            scoreFactors.has_title = 1;
          }
        }
      }

      // Check for footer-like patterns (last 3 lines)
      if (lines.length > 0) {
        const lastLines = lines.slice(-3);
        for (const line of lastLines) {
          if (/page\s+\d+|signature|date.*signed/i.test(line)) {
            scoreFactors.footer_like = (scoreFactors.footer_like ?? 0) + 1;
          }
          if (/_+\s*(date|sign)/i.test(line)) {
            scoreFactors.has_signature_space = 1;
          }
        }
      }

      // Also check entire content for signature indicators
      if (/\b(witness whereof|common seal|signed and delivered)\b/i.test(content)) {
        scoreFactors.has_signature_space = 1;
      }

      const priority = calculateStructuralPriority(scoreFactors);
      const overallScore = calculateStructuralOverallScore(scoreFactors);

      structuralScores.push({
        index: i,
        content: content.slice(0, 100), // Sample for debugging
        scores: scoreFactors,
        priority,
        overallScore,
      });

      // Log significant findings
      if (scoreFactors.has_title) {
        console.log(`Page ${i + 1}: Title/header detected`);
      }
      if (scoreFactors.has_signature_space) {
        console.log(`Page ${i + 1}: Signature space detected`);
      }
    }

    // Sort by structural priority
    structuralScores.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    const order = structuralScores.map(item => item.index);

    // Calculate confidence based on how distinct the structural patterns are
    const priorities = structuralScores.map(item => item.priority ?? 0);
    const maxPriority = Math.max(...priorities);
    const minPriority = Math.min(...priorities);
    const priorityRange = maxPriority - minPriority;

    // Higher range = more distinct patterns = higher confidence
    const confidence = Math.min(0.8, (priorityRange / Math.max(1, maxPriority)) + 0.3);

    // Count significant structural features found
    const pagesWithHeaders = structuralScores.filter(s => (s.scores?.has_title ?? 0) > 0).length;
    const pagesWithSignatures = structuralScores.filter(s => (s.scores?.has_signature_space ?? 0) > 0).length;

    const reasoning = [
      'Ordered by structural patterns (headers, footers, layout)',
      `Found ${pagesWithHeaders} pages with title/header patterns`,
      `Found ${pagesWithSignatures} pages with signature patterns`,
      `Priority range: ${minPriority.toFixed(1)} to ${maxPriority.toFixed(1)}`,
    ];

    console.log(`Structural analysis complete. Confidence: ${(confidence * 100).toFixed(1)}%`);

    return {
      order,
      confidence,
      reasoning,
      method: 'structural_patterns',
      metadata: {
        structuralScores,
        pagesWithHeaders,
        pagesWithSignatures,
        priorityRange,
      },
    };
  }

  /**
   * Get confidence thresholds for this strategy
   */
  getConfidenceThresholds(): { high: number; medium: number; low: number } {
    return {
      high: 0.7,
      medium: 0.5,
      low: 0.3,
    };
  }
}

