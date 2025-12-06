export interface OrderingResult {
  order: number[];
  confidence: number;
  reasoning: string[];
  method: string;
  classifications?: PageClassification[];
  metadata?: { [key: string]: unknown };
}

/**
 * Per-page classification information
 */
export interface PageClassification {
  pageIndex: number;
  section?: DocumentSection;
  priority: number;
  confidence: number;
  score: number;
  matchedIndicators: string[];
}

/**
 * Document section configuration from docRules.json
 */
export interface DocumentSection {
  name: string;
  priority: number;
  weight: number;
  indicators: string[];
  required_any: string[];
  boost_patterns: string[];
}

/**
 * Document type configuration from docRules.json
 */
export interface DocumentType {
  name: string;
  sections: DocumentSection[];
}

/**
 * General patterns configuration from docRules.json
 */
export interface GeneralPatterns {
  first_page_indicators: string[];
  last_page_indicators: string[];
  continuation_patterns: string[];
  section_break_patterns: string[];
  page_number_patterns: string[];
}

/**
 * Document configuration from docRules.json
 */
export interface DocumentConfig {
  document_types: { [key: string]: DocumentType };
  general_patterns: GeneralPatterns;
  confidence_thresholds: {
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * Page content information for heuristics processing
 */
export interface PageContent {
  index: number;
  content: string;
  ocrText?: string;
  detectedPageNum?: number;
  confidence?: number;
  metadata?: { [key: string]: unknown };
}

export type TextRegion = 'header' | 'footer' | 'header_footer' | 'full_page' | 'body';

/**
 * Structural pattern interface for page analysis
 */
export interface StructuralPattern {
  header_like?: number; // 0-1 confidence score
  footer_like?: number; // 0-1 confidence score
  content_density?: number;
  has_title?: number; // 0-1 confidence score
  has_signature_space?: number; // 0-1 confidence score
}

/**
 * Page structural information
 */
export interface PageStructuralInfo {
  index: number;
  content: string;
  scores?: StructuralPattern;
}

/**
 * Structural pattern analysis result
 */
export interface StructuralPatternInfo {
  index: number;
  content: string;
  scores?: StructuralPattern;
  priority?: number;
  overallScore: number;
}

export type SequenceSystem =
  | 'article'
  | 'section'
  | 'schedule'
  | 'exhibit';

export type SequenceValueKind = 'roman' | 'numeric' | 'alphabetic' | 'alphanumeric';

export interface SequencePatternDefinition {
  system: SequenceSystem;
  label: string;
  pattern: RegExp;
  valueKind: SequenceValueKind;
  priority: number;
  weight: number;
  captureGroup?: number;
  regions?: TextRegion[];
  normalize?: (value: string) => string;
  ordinalExtractor?: (value: string) => number | null;
  description?: string;
}

export interface SequenceMarker {
  pageIndex: number;
  system: SequenceSystem;
  value: string;
  valueKind: SequenceValueKind;
  ordinal: number;
  raw: string;
  region: TextRegion;
  confidence: number;
  matchIndex?: number;
  patternLabel: string;
}

export interface SequenceDetectionSummary {
  markers: SequenceMarker[];
  markersBySystem: Partial<Record<SequenceSystem, SequenceMarker[]>>;
}

export interface ContinuationHint {
  fromPage: number;
  toPage: number;
  confidence: number;
  reason: string;
}

export type PlacementSignal =
  | 'sequence'
  | 'continuation'
  | 'structural'
  | 'original'
  | 'fallback'
  | 'initial';

export interface PlacementLog {
  pageIndex: number;
  signal: PlacementSignal;
  reason: string;
  gapId?: string;
}

export interface GapResolverInput {
  pageContents: PageContent[];
  initialOrder: number[];
  sequenceSummary: SequenceDetectionSummary;
  structuralMap: Map<number, StructuralPatternInfo>;
  continuationHints: ContinuationHint[];
  logPrefix?: string;
}

export interface GapResolverResult {
  order: number[];
  placements: PlacementLog[];
  heuristicCoverage: number;
  anchoredCount: number;
}

/**
 * Strategy interface base class
 */
export interface BaseOrderingStrategy {
  readonly name: string;
  readonly threshold: number;

  /**
   * Check if this strategy can handle the given pages
   */
  canHandle(pageContents: PageContent[]): boolean;

  /**
   * Attempt to order the pages using this strategy
   */
  attemptOrdering(pageContents: PageContent[]): Promise<OrderingResult>;
}

/**
 * Strategy factory configuration
 */
export interface StrategyConfig {
  name: string;
  priority: number; // Higher priority strategies run first
  enabled: boolean;
  threshold?: number; // Override default threshold if needed
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  strategies: StrategyConfig[];
  documentConfig?: DocumentConfig;
  fallbackMethod: 'original' | 'reverse' | 'none';
  requireMinConfidence: number;
}

/**
 * Page number detection result
 */
export interface PageNumberDetection {
  pageIndex: number;
  pageNumber: number;
  confidence: number;
  pattern: string;
  fullTextSample: string;
  region?: 'header' | 'footer' | 'header_footer' | 'full_page';
}

/**
 * Date detection result
 */
export interface DateDetection {
  pageIndex: number;
  dates: Date[];
  earliestDate?: Date;
  latestDate?: Date;
  confidence: number;
}

/**
 * Structural pattern detection result
 */
export interface StructuralDetection {
  pageIndex: number;
  scoreFactors: {
    header_like: number;
    footer_like: number;
    content_density: number;
    has_title: number;
    has_signature_space: number;
  };
  priority: number;
}

/**
 * Processing statistics for logging/debugging
 */
export interface ProcessingStats {
  totalStrategies: number;
  successfulStrategies: number;
  failedStrategies: number;
  processingTimeMs: number;
  strategyResults: { [strategyName: string]: OrderingResult };
  selectedStrategy: string;
  selectedConfidence: number;
}

/**
 * Strategy comparison result
 */
export interface StrategyComparison {
  strategies: Array<{
    name: string;
    confidence: number;
    reasoning: string[];
    order: number[];
  }>;
  winner: string;
  winningConfidence: number;
  winningOrder: number[];
}
