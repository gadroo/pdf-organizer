/**
 * Heuristics Orchestrator - Main orchestrator for strategy selection
 * Ported from Python strategies.py and implements strategy coordination
 */

import type {
  OrderingResult,
  PageContent,
  BaseOrderingStrategy,
  OrchestratorConfig,
  ProcessingStats,
  StrategyComparison,
  DocumentConfig,
} from './types';

import { PageNumberStrategy } from './pageNumbers';
import { StructuralPatternStrategy } from './structure';

// Import the configuration
import { createLogger } from '../logging';
import docRules from '../../config/docRules.json';

/**
 * Main orchestrator for running multiple heuristics strategies
 */
export class HeuristicsOrchestrator {
  private config: OrchestratorConfig;
  private strategies: Map<string, BaseOrderingStrategy> = new Map();
  private documentConfig: DocumentConfig;
  private logger = createLogger('HeuristicsOrchestrator', { structured: false });

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = {
      strategies: [
        { name: 'page_numbers', priority: 100, enabled: true },
        { name: 'structural_patterns', priority: 70, enabled: true },
      ],
      fallbackMethod: 'original',
      requireMinConfidence: 0.6,
      ...config,
    };

    this.documentConfig = this.config.documentConfig || docRules;
    this.initializeStrategies();
  }

  /**
   * Initialize all available strategies
   */
  private initializeStrategies(): void {
    // Initialize PageNumberStrategy
    const pageNumberStrategy = new PageNumberStrategy(this.documentConfig);
    this.strategies.set('page_numbers', pageNumberStrategy);

    // Initialize StructuralPatternStrategy
    const structuralPatternStrategy = new StructuralPatternStrategy({
      priority: 70,
      weight: 1.0,
    });
    this.strategies.set('structural_patterns', structuralPatternStrategy);


  }

  /**
   * Run all enabled strategies and select the best result
   */
  async processPages(
    pageContents: PageContent[]
  ): Promise<{
    finalResult: OrderingResult;
    strategyResults: { [strategyName: string]: OrderingResult };
    comparison: StrategyComparison;
    processingStats: ProcessingStats;
  }> {
    const startTime = Date.now();
    const enabledStrategies = this.config.strategies
      .filter(strategyConfig => strategyConfig.enabled)
      .sort((a, b) => b.priority - a.priority); // Higher priority first

    const strategyResults: { [strategyName: string]: OrderingResult } = {};
    const strategyComparisons: Array<{
      name: string;
      confidence: number;
      reasoning: string[];
      order: number[];
    }> = [];

    this.logger.section('Heuristics orchestrator');
    this.logger.info(
      `Running ${enabledStrategies.length} heuristic strategy(ies)`,
      enabledStrategies.map((strategy) => strategy.name).join(', '),
    );

    // Run each enabled strategy
    for (const strategyConfig of enabledStrategies) {
      const strategyName = strategyConfig.name;
      const strategy = this.strategies.get(strategyName);

      if (!strategy) {
        this.logger.warn(`Strategy '${strategyName}' not initialized`);
        continue;
      }

      if (!strategy.canHandle(pageContents)) {
        this.logger.info(`Skipping '${strategyName}' (cannot handle these pages)`);
        continue;
      }

      this.logger.info(`Running '${strategyName}' strategy...`);
      const result = await strategy.attemptOrdering(pageContents);

      strategyResults[strategyName] = result;
      strategyComparisons.push({
        name: strategyName,
        confidence: result.confidence,
        reasoning: result.reasoning,
        order: result.order,
      });

      this.logger.info(
        `Result '${strategyName}'`,
        `confidence ${result.confidence.toFixed(3)}, order preview: ${result.order.slice(0, 10).join(', ')}`,
      );

      if (
        strategyName === 'page_numbers'
        && result.confidence >= 0.8
      ) {
        this.logger.success(
          "Page numbers confident; skipping remaining strategies",
          `confidence ${result.confidence.toFixed(3)}`,
        );
        break;
      }
    }

    // Select the best strategy
    const comparison = this.selectBestStrategy(strategyComparisons);

    const endTime = Date.now();
    const processingTimeMs = endTime - startTime;

    const processingStats: ProcessingStats = {
      totalStrategies: enabledStrategies.length,
      successfulStrategies: Object.keys(strategyResults).length,
      failedStrategies: enabledStrategies.length - Object.keys(strategyResults).length,
      processingTimeMs,
      strategyResults,
      selectedStrategy: comparison.winner,
      selectedConfidence: comparison.winningConfidence,
    };

    this.logger.success(
      `Selected strategy: ${comparison.winner}`,
      `confidence ${comparison.winningConfidence.toFixed(3)}, time ${processingTimeMs}ms, evaluated ${strategyComparisons.length}`,
    );

    return {
      finalResult: {
        order: comparison.winningOrder,
        confidence: comparison.winningConfidence,
        reasoning: [`Used ${comparison.winner} strategy`, ...strategyResults[comparison.winner]?.reasoning || []],
        method: comparison.winner,
        metadata: {
          competingStrategies: strategyComparisons.length,
          processingTimeMs,
        },
      },
      strategyResults,
      comparison,
      processingStats,
    };
  }

  /**
   * Select the best strategy based on confidence and quality metrics
   */
  private selectBestStrategy(
    strategyComparisons: Array<{
      name: string;
      confidence: number;
      reasoning: string[];
      order: number[];
    }>
  ): StrategyComparison {
    if (strategyComparisons.length === 0) {
      return {
        strategies: [],
        winner: 'none',
        winningConfidence: 0,
        winningOrder: [],
      };
    }

    // Sort by confidence first
    const sortedByConfidence = [...strategyComparisons].sort((a, b) => b.confidence - a.confidence);

    // Apply quality heuristics for tie-breaking
    const scoredStrategies = sortedByConfidence.map(comparison => {
      let qualityScore = comparison.confidence;

      // Boost for specific strategies based on document characteristics
      if (comparison.name === 'page_numbers' && comparison.confidence > 0.8) {
        qualityScore += 0.1; // Page numbers are very reliable
      }



      return {
        ...comparison,
        qualityScore,
      };
    });

    // Sort by quality score (which includes confidence)
    const finalSorted = scoredStrategies.sort((a, b) => b.qualityScore - a.qualityScore);

    const winner = finalSorted[0];

    return {
      strategies: finalSorted.map(({ name, confidence, reasoning, order }) => ({
        name,
        confidence,
        reasoning,
        order,
      })),
      winner: winner.name,
      winningConfidence: winner.confidence,
      winningOrder: winner.order,
    };
  }

  /**
   * Get available strategies
   */
  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Check if a strategy is available
   */
  hasStrategy(name: string): boolean {
    return this.strategies.has(name);
  }

  /**
   * Get a specific strategy
   */
  getStrategy(name: string): BaseOrderingStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * Get configuration
   */
  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.strategies) {
      // Update strategy enablement
      for (const strategyConfig of newConfig.strategies) {
        const current = this.config.strategies.find(s => s.name === strategyConfig.name);
        if (current) {
          Object.assign(current, strategyConfig);
        }
      }
    }
  }

  /**
   * Enable/disable specific strategies
   */
  setStrategyEnabled(name: string, enabled: boolean): void {
    const strategyConfig = this.config.strategies.find(s => s.name === name);
    if (strategyConfig) {
      strategyConfig.enabled = enabled;
    }
  }

  /**
   * Get document configuration
   */
  getDocumentConfig(): DocumentConfig {
    return this.documentConfig;
  }
}

/**
 * Default orchestrator instance
 */
export const defaultOrchestrator = new HeuristicsOrchestrator();

/**
 * Utility function to process pages with default orchestrator
 */
export async function processPagesWithHeuristics(
  pageContents: PageContent[]
): Promise<{
  finalResult: OrderingResult;
  strategyResults: { [strategyName: string]: OrderingResult };
  comparison: StrategyComparison;
  processingStats: ProcessingStats;
}> {
  return await defaultOrchestrator.processPages(pageContents);
}

/**
 * Utility function to run a single strategy
 */
export async function runSingleStrategy(
  strategyName: string,
  pageContents: PageContent[],
  documentConfig?: DocumentConfig
): Promise<OrderingResult> {
  const orchestrator = new HeuristicsOrchestrator({
    documentConfig,
  });

  const strategy = orchestrator.getStrategy(strategyName);
  if (!strategy || !strategy.canHandle(pageContents)) {
    return {
      order: Array.from({ length: pageContents.length }, (_, i) => i),
      confidence: 0,
      reasoning: [`Strategy '${strategyName}' not available or cannot handle these pages`],
      method: 'strategy_unavailable',
    };
  }

  return await strategy.attemptOrdering(pageContents);
}

