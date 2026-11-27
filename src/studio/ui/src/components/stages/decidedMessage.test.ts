import { describe, expect, it } from 'vitest';
import type { StageChapterRecommendation } from '../../types';
import { textDirection } from '../../visibleText';
import { decidedMessage } from './useStageRecommendations';

// "Chapter four: the long road home and the valley below the old mill", in Arabic: more right-to-left letters than the English words around it.
const ARABIC_TITLE =
  '\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u0631\u0627\u0628\u0639 \u0627\u0644\u0637\u0631\u064A\u0642 \u0627\u0644\u0637\u0648\u064A\u0644 \u0625\u0644\u0649 \u0627\u0644\u0628\u064A\u062A';
const FSI = '\u2068';
const PDI = '\u2069';
const chapter = (title: string) => ({ title, from: 'editing', target: 'proofing' }) as unknown as StageChapterRecommendation;

describe('the sentence a stage decision toasts (#4113)', () => {
  it.each(['confirm', 'revert'] as const)('%s isolates a right-to-left chapter title and reads left to right', (decision) => {
    const text = decidedMessage(decision, chapter(ARABIC_TITLE), chapter(ARABIC_TITLE));
    expect(text).toContain(`${FSI}${ARABIC_TITLE}${PDI}`);
    expect(textDirection(text)).toBe('ltr');
  });

  it('leaves an English title as it is', () => {
    expect(decidedMessage('confirm', chapter('Chapter 4'), chapter('Chapter 4'))).toBe('Chapter 4 moved to Editing.');
  });
});
