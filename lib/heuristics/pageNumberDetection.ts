import type { PageContent, PageNumberDetection } from './types';

export type PatternMatchesByPage = Record<number, PageNumberDetection>;

export interface ExplicitDetectionResult {
  pageNumbers: Record<number, number>;
  patternMatches: PatternMatchesByPage;
}

type DetectionLogger = (message: string) => void;

type CandidateRegion =
  | { region: 'header'; content: string; priority: number }
  | { region: 'footer'; content: string; priority: number }
  | { region: 'header_footer'; content: string; priority: number }
  | { region: 'full_page'; content: string; priority: number };

export function detectExplicitPageNumbers(
  pageContents: PageContent[],
  patterns: string[],
  log: DetectionLogger = () => {},
): ExplicitDetectionResult {
  const pageNumbers: Record<number, number> = {};
  const patternMatches: PatternMatchesByPage = {};

  for (let i = 0; i < pageContents.length; i += 1) {
    const page = pageContents[i];
    const candidateRegions = buildCandidateRegions(page);

    regionLoop:
    for (const candidate of candidateRegions) {
      if (!candidate.content?.trim()) {
        continue;
      }

      for (const pattern of patterns) {
        let matches: string[] = [];
        try {
          matches = findAllPatternMatches(pattern, candidate.content);
        } catch (error) {
          console.error(`Invalid regex pattern '${pattern}':`, error);
          continue;
        }

        if (!matches.length) {
          continue;
        }

        for (const match of matches) {
          const pageNum = Number.parseInt(match, 10);
          if (Number.isNaN(pageNum)) {
            continue;
          }

          if (pageNum < 1 || pageNum > pageContents.length * 2) {
            continue;
          }

          const current = pageNumbers[i];
          if (current !== undefined && pageNum >= current) {
            continue;
          }

          pageNumbers[i] = pageNum;
          pageContents[i].detectedPageNum = pageNum;
          const escapedPattern = escapeRegexForDisplay(pattern);
          patternMatches[i] = {
            pageIndex: i,
            pageNumber: pageNum,
            confidence: 0.9,
            pattern: escapedPattern,
            fullTextSample: candidate.content.slice(0, 100),
            region: candidate.region,
          };
          log(
            `Page ${i + 1}: Found page number ${pageNum} in ${describeRegion(candidate.region)} using pattern '${escapedPattern}'`,
          );
          break regionLoop;
        }
      }
    }
  }

  return { pageNumbers, patternMatches };
}

function buildCandidateRegions(page: PageContent): CandidateRegion[] {
  const metadata = page.metadata as Record<string, unknown> | undefined;
  const headerText = extractMetadataText(metadata, 'headerText');
  const footerText = extractMetadataText(metadata, 'footerText');

  const regions: CandidateRegion[] = [];

  if (headerText) {
    regions.push({ region: 'header', content: headerText, priority: 1 });
  }

  if (footerText) {
    regions.push({ region: 'footer', content: footerText, priority: 2 });
  }

  if (headerText && footerText) {
    const combined = `${headerText}\n${footerText}`.trim();
    if (combined) {
      regions.push({
        region: 'header_footer',
        content: combined,
        priority: 3,
      });
    }
  }

  const fullContent = (page.content || page.ocrText || '').trim();
  if (fullContent) {
    regions.push({
      region: 'full_page',
      content: fullContent,
      priority: 10,
    });
  }

  if (regions.length === 0) {
    regions.push({
      region: 'full_page',
      content: page.content || '',
      priority: 10,
    });
  }

  return regions.sort((a, b) => a.priority - b.priority);
}

function extractMetadataText(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string {
  if (!metadata) {
    return '';
  }

  const value = metadata[key];
  return typeof value === 'string' ? value.trim() : '';
}

function describeRegion(region: CandidateRegion['region']): string {
  switch (region) {
    case 'header':
      return 'the header';
    case 'footer':
      return 'the footer';
    case 'header_footer':
      return 'the header/footer block';
    case 'full_page':
    default:
      return 'the full page text';
  }
}

function findAllPatternMatches(pattern: string, content: string): string[] {
  const flags = 'gmi';
  const regex = new RegExp(pattern, flags);
  const matches = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.length > 1 && match[1] !== undefined) {
      matches.push(match[1]);
    } else {
      matches.push(match[0]);
    }
  }

  return matches;
}

function escapeRegexForDisplay(pattern: string): string {
  return pattern.replace(/[\\]/g, '\\\\');
}

