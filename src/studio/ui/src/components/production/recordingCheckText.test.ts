import { describe, expect, it } from 'vitest';
import { COVERAGE_EVALUATOR_REASONS, COVERAGE_REFUSAL_REASONS } from '../../api/schemas/coverage';
import type { ManuscriptChapter } from '../../types';
import { COVERAGE_REASON_TEXT, describeParagraphs, formatAudioTime, paragraphRefs } from './recordingCheckText';

const chapter: ManuscriptChapter = {
  id: 'c-1',
  title: 'Chapter 1',
  index: 0,
  wordCount: 100,
  status: 'recording',
  paragraphIds: [
    { id: 'p-a', index: 40 },
    { id: 'p-b', index: 41 },
    { id: 'p-c', index: 42 },
  ],
};

describe('recording check text', () => {
  it('has a plain sentence for every reason the host can send', () => {
    for (const reason of [...COVERAGE_REFUSAL_REASONS, ...COVERAGE_EVALUATOR_REASONS]) {
      expect(COVERAGE_REASON_TEXT[reason], reason).toMatch(/^[A-Z].*\.$/);
      expect(COVERAGE_REASON_TEXT[reason], reason).not.toMatch(/_/);
    }
  });

  it('numbers paragraphs within their chapter and keeps the manuscript index for a link', () => {
    expect(paragraphRefs(chapter, ['p-b', 'p-c'])).toEqual([
      { number: 2, index: 41 },
      { number: 3, index: 42 },
    ]);
    expect(paragraphRefs(chapter, ['p-unknown'])).toEqual([{ number: 1 }]);
  });

  it('reads a run of paragraphs as a range and a scattered set as a list', () => {
    expect(describeParagraphs([12])).toBe('paragraph 12');
    expect(describeParagraphs([40, 38, 39])).toBe('paragraphs 38 to 40');
    expect(describeParagraphs([3, 9, 5])).toBe('paragraphs 3, 5 and 9');
    expect(describeParagraphs([])).toBe('no paragraph');
  });

  it('formats audio times as minutes and seconds, with hours when needed', () => {
    expect(formatAudioTime(7.9)).toBe('0:07');
    expect(formatAudioTime(3729)).toBe('1:02:09');
    expect(formatAudioTime(-3)).toBe('0:00');
  });

  // The model cascade's own labels.
});
