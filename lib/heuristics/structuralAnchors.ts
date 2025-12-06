import type { PageContent, StructuralPattern, StructuralPatternInfo } from './types';

export function calculateStructuralPriority(scoreFactors: StructuralPattern): number {
  let priority = 50;

  if (scoreFactors.has_title) {
    priority -= 30;
  }
  if ((scoreFactors.header_like ?? 0) > 0) {
    priority -= 20;
  }

  if (scoreFactors.has_signature_space) {
    priority += 40;
  }
  if ((scoreFactors.footer_like ?? 0) > 0) {
    priority += 20;
  }

  const density = scoreFactors.content_density ?? 0;
  if (density > 20) {
    priority -= 5;
  } else if (density < 5) {
    priority += 10;
  }

  return priority;
}

export function calculateStructuralOverallScore(scores: StructuralPattern): number {
  const weights: Record<keyof StructuralPattern, number> = {
    header_like: 0.25,
    footer_like: 0.15,
    content_density: 0.2,
    has_title: 0.25,
    has_signature_space: 0.15,
  };

  let totalScore = 0;
  (Object.keys(weights) as Array<keyof StructuralPattern>).forEach((key) => {
    const value = scores[key] ?? 0;
    const normalized = key === 'content_density' ? Math.min(1, value / 30) : value;
    totalScore += normalized * (weights[key] ?? 0);
  });

  return Math.min(1, totalScore);
}

export function analyzeStructuralAnchors(pageContents: PageContent[]): StructuralPatternInfo[] {
  const results: StructuralPatternInfo[] = [];

  for (let i = 0; i < pageContents.length; i += 1) {
    const page = pageContents[i];
    const content = page.content ?? '';
    const lines = content.split('\n');

    const scoreFactors: StructuralPattern = {
      header_like: 0,
      footer_like: 0,
      content_density: lines.length > 0 ? content.split(/\s+/).length / Math.max(1, lines.length) : 0,
      has_title: 0,
      has_signature_space: 0,
    };

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

    if (/\b(witness whereof|common seal|signed and delivered)\b/i.test(content)) {
      scoreFactors.has_signature_space = 1;
    }

    const priority = calculateStructuralPriority(scoreFactors);
    results.push({
      index: i,
      content: content.slice(0, 100),
      scores: scoreFactors,
      priority,
      overallScore: calculateStructuralOverallScore(scoreFactors),
    });
  }

  return results;
}

