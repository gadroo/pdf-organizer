import type {
  PageContent,
  SequenceDetectionSummary,
  SequenceMarker,
  SequencePatternDefinition,
  SequenceSystem,
  SequenceValueKind,
  TextRegion,
} from './types';

const DEFAULT_MIN_CONFIDENCE = 0.35;

export interface SequenceDetectionOptions {
  enabledSystems?: SequenceSystem[];
  customPatterns?: SequencePatternDefinition[];
  minConfidence?: number;
}

interface RegionCandidate {
  region: TextRegion;
  text: string;
  priority: number;
}

const REGION_PRIORITY: Record<TextRegion, number> = {
  header: 1,
  footer: 2,
  header_footer: 3,
  full_page: 10,
  body: 11,
};

export const UNIVERSAL_SEQUENCE_PATTERNS: SequencePatternDefinition[] = [
  {
    system: 'article',
    label: 'Article (Roman numerals)',
    pattern: /\barticle(?:\s*[-–—]?\s*|\s+)([ivxlcdm]+)\b/gi,
    valueKind: 'roman',
    priority: 100,
    weight: 1,
    description: 'Matches headings like "Article IV" or "Article - VI".',
  },
  {
    system: 'article',
    label: 'Article (Arabic numerals)',
    pattern: /\barticle(?:\s*[-–—]?\s*|\s+)(\d{1,3})\b/gi,
    valueKind: 'numeric',
    priority: 95,
    weight: 0.9,
    description: 'Matches headings like "Article 7".',
  },
  {
    system: 'section',
    label: 'Section decimal numbering',
    pattern: /\bsection(?:\s*[-–—]?\s*|\s+)(\d+(?:\.\d+){0,3})\b/gi,
    valueKind: 'alphanumeric',
    priority: 90,
    weight: 0.9,
    description: 'Matches "Section 4.2" or "Section 12.3.1".',
  },
  {
    system: 'schedule',
    label: 'Schedule (alphabetic)',
    pattern: /\bschedule(?:\s*[-–—]?\s*|\s+)([A-Z]{1,3})\b/gi,
    valueKind: 'alphabetic',
    priority: 78,
    weight: 0.75,
    description: 'Matches "Schedule A" or "Schedule AA".',
  },
  {
    system: 'exhibit',
    label: 'Exhibit letters',
    pattern: /\bexhibit(?:\s*[-–—]?\s*|\s+)([A-Z]{1,3})\b/gi,
    valueKind: 'alphabetic',
    priority: 70,
    weight: 0.75,
    description: 'Matches "Exhibit B".',
  },
];

export function detectSequenceMarkers(
  pageContents: PageContent[],
  options?: SequenceDetectionOptions,
): SequenceDetectionSummary {
  const markers: SequenceMarker[] = [];
  const activeSystems = new Set(options?.enabledSystems);
  const patterns = [
    ...UNIVERSAL_SEQUENCE_PATTERNS,
    ...(options?.customPatterns ?? []),
  ].sort((a, b) => b.priority - a.priority);

  pageContents.forEach((page) => {
    const regions = buildRegionCandidates(page);
    patterns.forEach((patternDef) => {
      if (activeSystems.size > 0 && !activeSystems.has(patternDef.system)) {
        return;
      }

      regions.forEach((region) => {
        if (
          patternDef.regions &&
          patternDef.regions.length > 0 &&
          !patternDef.regions.includes(region.region)
        ) {
          return;
        }

        // Clone regex to avoid shared state across matches
        const regex = cloneRegex(patternDef.pattern);
        let match: RegExpExecArray | null;
        while ((match = regex.exec(region.text)) !== null) {
          const captureIndex = patternDef.captureGroup ?? 1;
          const rawValue = match[captureIndex];
          if (!rawValue) {
            continue;
          }

          const normalizedValue =
            patternDef.normalize?.(rawValue) ??
            defaultNormalizeValue(rawValue, patternDef.valueKind);
          const ordinal =
            patternDef.ordinalExtractor?.(normalizedValue) ??
            computeOrdinalFromValue(normalizedValue, patternDef.valueKind);

          if (!normalizedValue || ordinal === null) {
            continue;
          }

          const confidence = clamp01(
            0.55 + patternDef.weight * 0.25 - region.priority * 0.01,
          );

          if (confidence < (options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE)) {
            continue;
          }

          markers.push({
            pageIndex: page.index,
            system: patternDef.system,
            value: normalizedValue,
            valueKind: patternDef.valueKind,
            ordinal,
            raw: match[0],
            region: region.region,
            confidence,
            matchIndex: match.index,
            patternLabel: patternDef.label,
          });
        }
      });
    });
  });

  return summarizeMarkers(markers);
}

function buildRegionCandidates(page: PageContent): RegionCandidate[] {
  const regions: RegionCandidate[] = [];
  const metadata = (page.metadata ?? {}) as Record<string, unknown>;

  const header = extractMetadataText(metadata, 'headerText');
  if (header) {
    regions.push({ region: 'header', text: header, priority: REGION_PRIORITY.header });
  }

  const footer = extractMetadataText(metadata, 'footerText');
  if (footer) {
    regions.push({ region: 'footer', text: footer, priority: REGION_PRIORITY.footer });
  }

  if (header && footer) {
    regions.push({
      region: 'header_footer',
      text: `${header}\n${footer}`,
      priority: REGION_PRIORITY.header_footer,
    });
  }

  const body = page.content?.trim() || page.ocrText?.trim() || '';
  if (body) {
    regions.push({
      region: 'full_page',
      text: body,
      priority: REGION_PRIORITY.full_page,
    });
  }

  if (regions.length === 0) {
    regions.push({
      region: 'body',
      text: page.content || '',
      priority: REGION_PRIORITY.body,
    });
  }

  return regions.sort((a, b) => a.priority - b.priority);
}

function summarizeMarkers(markers: SequenceMarker[]): SequenceDetectionSummary {
  const markersBySystem: SequenceDetectionSummary['markersBySystem'] = {};

  markers.forEach((marker) => {
    if (!markersBySystem[marker.system]) {
      markersBySystem[marker.system] = [];
    }
    markersBySystem[marker.system]!.push(marker);
  });

  Object.entries(markersBySystem).forEach(([systemKey, systemMarkers]) => {
    const system = systemKey as SequenceSystem;
    const sorted = [...systemMarkers].sort((a, b) => {
      if (a.ordinal === b.ordinal) {
        return a.pageIndex - b.pageIndex;
      }
      return a.ordinal - b.ordinal;
    });

    markersBySystem[system] = sorted;

    const duplicatesMap = new Map<number, SequenceMarker[]>();
    sorted.forEach((marker) => {
      const group = duplicatesMap.get(marker.ordinal) ?? [];
      group.push(marker);
      duplicatesMap.set(marker.ordinal, group);
    });
  });

  return {
    markers,
    markersBySystem,
  };
}

function extractMetadataText(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === 'string' ? value.trim() : '';
}

function cloneRegex(regex: RegExp): RegExp {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  return new RegExp(regex.source, flags);
}

function defaultNormalizeValue(value: string, kind: SequenceValueKind): string {
  const trimmed = value.trim();
  if (kind === 'roman') {
    return trimmed.toUpperCase();
  }
  if (kind === 'alphabetic') {
    return trimmed.replace(/[^A-Za-z]/g, '').toUpperCase();
  }
  return trimmed;
}

function computeOrdinalFromValue(value: string, kind: SequenceValueKind): number | null {
  switch (kind) {
    case 'roman':
      return romanToNumber(value);
    case 'alphabetic':
      return alphabeticToNumber(value);
    case 'numeric':
      return parseInt(value, 10) || null;
    case 'alphanumeric': {
      const numericPart = value.match(/\d+/);
      if (numericPart) {
        return parseInt(numericPart[0], 10);
      }
      return alphabeticToNumber(value);
    }
    default:
      return null;
  }
}

function romanToNumber(value: string): number | null {
  const roman = value.toUpperCase();
  const romanMap: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };

  let result = 0;
  for (let i = 0; i < roman.length; i += 1) {
    const current = romanMap[roman[i]];
    const next = romanMap[roman[i + 1]];
    if (!current) {
      return null;
    }
    if (next && current < next) {
      result += next - current;
      i += 1;
    } else {
      result += current;
    }
  }

  return result;
}

function alphabeticToNumber(value: string): number | null {
  const cleaned = value.replace(/[^A-Z]/gi, '').toUpperCase();
  if (!cleaned) {
    return null;
  }
  let result = 0;
  for (let i = 0; i < cleaned.length; i += 1) {
    const charCode = cleaned.charCodeAt(i) - 64; // 'A' === 65
    if (charCode < 1 || charCode > 26) {
      return null;
    }
    result = result * 26 + charCode;
  }
  return result;
}

function formatOrdinalLabel(
  system: SequenceSystem,
  ordinal: number,
  valueKind?: SequenceValueKind,
): string {
  const kind = valueKind ?? defaultValueKindForSystem(system);
  switch (kind) {
    case 'roman':
      return numberToRoman(ordinal);
    case 'alphabetic':
      return numberToAlphabetic(ordinal);
    case 'numeric':
    case 'alphanumeric':
    default:
      return ordinal.toString();
  }
}

function defaultValueKindForSystem(system: SequenceSystem): SequenceValueKind {
  switch (system) {
    case 'article':
      return 'roman';
    case 'schedule':
    case 'exhibit':
      return 'alphabetic';
    case 'section':
      return 'numeric';
    default:
      return 'numeric';
  }
}

function numberToRoman(num: number): string {
  if (num <= 0) {
    return num.toString();
  }
  const romanNumerals: Array<[number, string]> = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let result = '';
  let remaining = num;
  romanNumerals.forEach(([value, symbol]) => {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  });
  return result;
}

function numberToAlphabetic(num: number): string {
  if (num <= 0) {
    return num.toString();
  }
  let result = '';
  let remaining = num;
  while (remaining > 0) {
    const modulo = (remaining - 1) % 26;
    result = String.fromCharCode(65 + modulo) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
