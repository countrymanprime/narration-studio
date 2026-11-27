import { describe, expect, it } from 'vitest';
import { textDirection } from '../../visibleText';
import { movedOutSentence } from './useChapterFolders';

describe('movedOutSentence (#4113)', () => {
  it('says a plain name as it was', () => {
    expect(movedOutSentence(2, ['Ch 1', 'Ch 1'])).toBe(
      'Moved 2 chapters out of Ch 1 in REAPER. One Undo in REAPER takes it back; save the project in REAPER to keep it.',
    );
  });

  it('isolates each right-to-left folder name before the join, so two names keep their order, and reads left to right', () => {
    const A = '\u0627\u0644\u0641';
    const B = '\u0628\u0627\u0628';
    const text = movedOutSentence(2, [A, B]);
    expect(text).toContain('\u2068' + A + '\u2069, \u2068' + B + '\u2069 in REAPER');
    expect(textDirection(text)).toBe('ltr');
  });
});
