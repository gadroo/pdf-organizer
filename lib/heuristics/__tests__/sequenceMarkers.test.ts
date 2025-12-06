import { detectSequenceMarkers } from '../sequenceMarkers';
import { createPageContent } from './fixtures/heuristics';

describe('detectSequenceMarkers', () => {
  it('parses roman numerals for article headings', () => {
    const pages = [
      createPageContent(0, 'ARTICLE IV\nContent'),
      createPageContent(1, 'Article V\nMore content'),
    ];

    const summary = detectSequenceMarkers(pages);
    const ordinals = summary.markers.map(m => m.ordinal);

    expect(ordinals).toEqual([4, 5]);
    expect(summary.markers[0].valueKind).toBe('roman');
  });

  it('detects alphabetic schedules and normalizes to uppercase', () => {
    const pages = [
      createPageContent(0, 'Schedule b details'),
      createPageContent(1, 'Schedule AA summary'),
    ];

    const summary = detectSequenceMarkers(pages);
    const labels = summary.markers.map(m => m.value);

    expect(labels).toEqual(['B', 'AA']);
    expect(summary.markers[0].valueKind).toBe('alphabetic');
  });
});
