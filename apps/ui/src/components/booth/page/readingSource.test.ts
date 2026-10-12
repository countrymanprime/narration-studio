import { describe, expect, it } from 'vitest';
import type { GuideDialogueCue, GuideEntity, ManuscriptParagraph, TeleprompterFlag, TeleprompterSpan } from '../../../types';
import { boothUnits } from '../reading/boothUnits';
import { creditsParagraphs, positionAtOffset, positionInScript, readingParagraphsOf, scriptWordAt, secondsBefore, suspectedFrom } from './readingSource';

const paragraph = (id: string, text: string): ManuscriptParagraph => ({ id, chapterId: 'c1', chapter: 'One', index: 0, text, entityIds: [] });
const queen = { id: 'e-queen', canonical_name: 'Queen' } as GuideEntity;
const cue = (over: Partial<GuideDialogueCue>): GuideDialogueCue => ({
  id: 'cue-1',
  chapterId: 'c1',
  paragraphId: 'p2',
  quote_start: 0,
  quote_end: 20,
  quote_text: '',
  speaker_entity_id: 'e-queen',
  speaker_source: 'tag',
  evidence: { chapterId: 'c1', paragraphId: 'p2', excerpt: '', tag: '' },
  corrected: false,
  ...over,
});
const paragraphs = [paragraph('p1', 'The garden was quiet.'), paragraph('p2', '“Off with her head,” said the Queen.')];
const spans: TeleprompterSpan[] = [
  { kind: 'title', id: 't', index: null, start: 0, count: 2 },
  { kind: 'paragraph', id: 'host-p1', index: 0, start: 2, count: 4 },
  { kind: 'paragraph', id: 'host-p2', index: 1, start: 6, count: 6 },
];

describe('readingParagraphsOf', () => {
  it('cuts a paragraph at its dialogue cues: the quote names its speaker, the rest is narration', () => {
    const [plain, quoted] = readingParagraphsOf(paragraphs, [cue({})], [queen]);
    expect(plain.phrases).toBeUndefined();
    expect(quoted.phrases).toEqual([
      { key: 'cue-1', start: 0, end: 20, quoted: true, speaker: 'Queen', confirmed: false },
      { key: 'p2:20', start: 20, end: quoted.text.length, quoted: false, speaker: '', confirmed: true },
    ]);
  });

  it('a corrected cue is confirmed; an unknown speaker has no name', () => {
    const [, a] = readingParagraphsOf(paragraphs, [cue({ speaker_source: 'correction' })], [queen]);
    expect(a.phrases?.[0].confirmed).toBe(true);
    const [, b] = readingParagraphsOf(paragraphs, [cue({ speaker_entity_id: null, speaker_source: 'unknown' })], [queen]);
    expect(b.phrases?.[0].speaker).toBe('');
  });
});

describe('credits', () => {
  it('reads the rendered credits as one paragraph per line', () => {
    expect(creditsParagraphs('opening', 'This is Audible.\n\nThe Book, by An Author.')).toEqual([
      { id: 'credits-opening-0', text: 'This is Audible.' },
      { id: 'credits-opening-1', text: 'The Book, by An Author.' },
    ]);
  });
});

describe('places', () => {
  const reading = readingParagraphsOf(paragraphs, [], []);
  it('maps the script word the host reads to the paragraph and word, by paragraph order, and back', () => {
    expect(positionInScript(spans, reading, 7)).toEqual({ paragraphId: 'p2', word: 1 });
    expect(positionInScript(spans, reading, 0)).toBeNull();
    expect(scriptWordAt(spans, reading, { paragraphId: 'p2', word: 1 })).toBe(7);
    expect(scriptWordAt(spans, reading, { paragraphId: 'nope', word: 0 })).toBeNull();
  });

  it('a character offset is the word it falls in, or the word after a space', () => {
    expect(positionAtOffset(reading, 'p1', 0)).toEqual({ paragraphId: 'p1', word: 0 });
    expect(positionAtOffset(reading, 'p1', 4)).toEqual({ paragraphId: 'p1', word: 1 });
    expect(positionAtOffset(reading, 'p1', 6)).toEqual({ paragraphId: 'p1', word: 1 });
    expect(positionAtOffset(reading, 'p9', 6)).toBeNull();
  });

  it('a phrase sits at the words before it, at the standard rate', () => {
    const units = boothUnits(reading);
    expect(secondsBefore(units, 0)).toBe(0);
    expect(secondsBefore(units, 1)).toBeGreaterThan(0);
  });
});

describe('suspectedFrom', () => {
  it('places each flag the host raised in its paragraph, with the words it covers', () => {
    const reading = readingParagraphsOf(paragraphs, [], []);
    const flag: TeleprompterFlag = { type: 'flag', id: 1, kind: 'skipped', start: 7, end: 9, heard: '' };
    expect(suspectedFrom([flag], spans, reading, 'c1')).toEqual([
      { chapterId: 'c1', paragraphId: 'p2', kind: 'skipped', wordStart: 1, wordEnd: 3, scriptStart: 7, scriptEnd: 9, script: 'with her', heard: '' },
    ]);
    expect(suspectedFrom([{ ...flag, start: 0, end: 1 }], spans, reading, 'c1')).toEqual([]);
  });
});
