// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sentenceOr } from './sentenceOr';

const FALLBACK = 'No words.';
// Strings that draw nothing: each is a refusal with no sentence (#3322).
const NOTHING = ['', '   ', '\n\t', '​', ' ​⁠ ', '͏', '⠀', 'ㅤ', '️', '\u{E0020}', '឴', '\u007F', '؅', '܏', '￹', '￺', '￻', '́', 'x'.slice(1)];

describe('sentenceOr', () => {
  it.each(NOTHING)('says the fallback for a string that draws nothing (%j)', (text) => {
    expect(sentenceOr(text, FALLBACK)).toBe(FALLBACK);
  });
  it('says the fallback for no text at all', () => {
    expect(sentenceOr(undefined, FALLBACK)).toBe(FALLBACK);
    expect(sentenceOr(null, FALLBACK)).toBe(FALLBACK);
  });
  it('keeps a real sentence, trimmed, even with invisible characters around it', () => {
    expect(sentenceOr('  The track is locked.  ', FALLBACK)).toBe('The track is locked.');
    expect(sentenceOr('​\u007FThe track is locked.⁠', FALLBACK)).toContain('The track is locked.');
    expect(sentenceOr('¿Cómo?', FALLBACK)).toBe('¿Cómo?');
    expect(sentenceOr('…', FALLBACK)).toBe('…');
    expect(sentenceOr('№ 5', FALLBACK)).toBe('№ 5');
  });
  it('lets a real message win over an invisible refusal when the caller chains them', () => {
    expect(sentenceOr('\u007F', sentenceOr('The recording has changed.', FALLBACK))).toBe('The recording has changed.');
  });
});
