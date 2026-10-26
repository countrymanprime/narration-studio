import { describe, expect, it } from 'vitest';
import type { GuideDialogueCue, GuideEntity, ManuscriptParagraph, TeleprompterFlag, TeleprompterSpan } from '../../../types';
import { boothUnits } from '../reading/boothUnits';
import {
  creditsParagraphs,
  entityAtWord,
  estimatedSpans,
  headingParagraphs,
  positionAtOffset,
  positionInScript,
  readingParagraphsOf,
  scriptWordAt,
  secondsBefore,
  suspectedFrom,
} from './readingSource';
import { typeHueColour } from '../../../kinds/entityColour';

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

  it('a corrected cue is confirmed; an unknown speaker is the mock’s "?" chip, never a blank one', () => {
    const [, a] = readingParagraphsOf(paragraphs, [cue({ speaker_source: 'correction' })], [queen]);
    expect(a.phrases?.[0].confirmed).toBe(true);
    const [, b] = readingParagraphsOf(paragraphs, [cue({ speaker_entity_id: null, speaker_source: 'unknown' })], [queen]);
    expect(b.phrases?.[0].speaker).toBe('?');
    const [, c] = readingParagraphsOf(paragraphs, [cue({ speaker_entity_id: 'e-gone' })], [queen]);
    expect(c.phrases?.[0].speaker).toBe('?');
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

describe('estimatedSpans', () => {
  it('counts the heading lines as the title span, then each paragraph, by words', () => {
    const reading = [...headingParagraphs({ title: 'Chapter One', subtitle: 'The Garden' }), ...readingParagraphsOf(paragraphs, [], [])];
    expect(estimatedSpans(reading)).toEqual([
      { kind: 'title', id: 'title', index: null, start: 0, count: 4 },
      { kind: 'paragraph', id: 'p1', index: 0, start: 4, count: 4 },
      { kind: 'paragraph', id: 'p2', index: 1, start: 8, count: 7 },
    ]);
  });

  it('a text with no heading (the credits) has an empty title span', () => {
    expect(estimatedSpans(readingParagraphsOf(paragraphs, [], []))[0]).toEqual({ kind: 'title', id: 'title', index: null, start: 0, count: 0 });
  });
});

// #2251 item 7: the chapter's title, then its subtitle, is the first line the Booth reads. It is read text: the host's title span (the
// sidecar's heading, chapter_script.py) maps onto it, so the cursor follows a title read aloud. Reading it is optional: no flag is placed in it.
describe('the chapter heading', () => {
  const titled = (title: string, subtitle?: string) => [...headingParagraphs({ title, subtitle }), ...readingParagraphsOf(paragraphs, [], [])];
  const hostSpans = (heading: number): TeleprompterSpan[] => [
    { kind: 'title', id: 'c1', index: null, start: 0, count: heading },
    { kind: 'paragraph', id: 'p1', index: 0, start: heading, count: 4 },
    { kind: 'paragraph', id: 'p2', index: 1, start: heading + 4, count: 6 },
  ];

  it('a title and a subtitle are two heading lines, title first, ahead of the paragraphs', () => {
    expect(headingParagraphs({ title: 'Chapter 7', subtitle: 'The Road' })).toEqual([
      { id: 'chapter-heading-title', text: 'Chapter 7', heading: 'title' },
      { id: 'chapter-heading-subtitle', text: 'The Road', heading: 'subtitle' },
    ]);
  });

  it('a title alone is one line, and a numbered title keeps its own words', () => {
    expect(headingParagraphs({ title: 'Chapter 7: The Road' })).toEqual([{ id: 'chapter-heading-title', text: 'Chapter 7: The Road', heading: 'title' }]);
    expect(headingParagraphs({ title: 'Chapter 7', subtitle: '' })).toHaveLength(1);
  });

  it('no title, or a title of only spaces, is no line at all, never an empty one', () => {
    expect(headingParagraphs({ title: '' })).toEqual([]);
    expect(headingParagraphs({ title: '  \n ', subtitle: '   ' })).toEqual([]);
    expect(headingParagraphs({ title: '', subtitle: 'Only a subtitle' })).toEqual([
      { id: 'chapter-heading-subtitle', text: 'Only a subtitle', heading: 'subtitle' },
    ]);
  });

  it('a title with a manual line break reads as one line', () => {
    expect(headingParagraphs({ title: 'CHAPTER ONE\nBad Ideas' })).toEqual([{ id: 'chapter-heading-title', text: 'CHAPTER ONE Bad Ideas', heading: 'title' }]);
  });

  it('the host reading the title or the subtitle aloud puts the cursor on that word of the heading', () => {
    const reading = titled('Chapter 7', 'The Road');
    expect(positionInScript(hostSpans(4), reading, 0)).toEqual({ paragraphId: 'chapter-heading-title', word: 0 });
    expect(positionInScript(hostSpans(4), reading, 1)).toEqual({ paragraphId: 'chapter-heading-title', word: 1 });
    expect(positionInScript(hostSpans(4), reading, 3)).toEqual({ paragraphId: 'chapter-heading-subtitle', word: 1 });
    expect(positionInScript(hostSpans(4), reading, 4)).toEqual({ paragraphId: 'p1', word: 0 });
  });

  it('a take started on the title starts the host at its first word, and on the first paragraph past the heading', () => {
    const reading = titled('Chapter 7', 'The Road');
    expect(scriptWordAt(hostSpans(4), reading, { paragraphId: 'chapter-heading-title', word: 0 })).toBe(0);
    expect(scriptWordAt(hostSpans(4), reading, { paragraphId: 'chapter-heading-subtitle', word: 1 })).toBe(3);
    expect(scriptWordAt(hostSpans(4), reading, { paragraphId: 'p1', word: 0 })).toBe(4);
  });

  it('a script from before the subtitle was read counts the title only: the title is tracked, the subtitle shown but not followed', () => {
    const reading = titled('Chapter 7', 'The Road');
    expect(positionInScript(hostSpans(2), reading, 1)).toEqual({ paragraphId: 'chapter-heading-title', word: 1 });
    expect(positionInScript(hostSpans(2), reading, 2)).toEqual({ paragraphId: 'p1', word: 0 });
    expect(scriptWordAt(hostSpans(2), reading, { paragraphId: 'chapter-heading-subtitle', word: 0 })).toBeNull();
  });

  it('a heading whose words the host counts differently is shown but not followed, and the paragraphs still line up', () => {
    const reading = titled('Chapter 7', 'The Road');
    expect(positionInScript(hostSpans(9), reading, 0)).toBeNull();
    expect(positionInScript(hostSpans(9), reading, 9)).toEqual({ paragraphId: 'p1', word: 0 });
  });

  it('no flag is ever placed on the heading: a title read aloud, said another way or left out is not a pickup', () => {
    const reading = titled('Chapter 7', 'The Road');
    const flag = (kind: TeleprompterFlag['kind'], start: number, end: number): TeleprompterFlag => ({ type: 'flag', id: 1, kind, start, end, heard: 'x' });
    expect(suspectedFrom([flag('misread', 0, 1), flag('skipped', 0, 4), flag('extra', 2, 2), flag('restart', 1, 3)], hostSpans(4), reading, 'c1')).toEqual([]);
    expect(suspectedFrom([flag('misread', 5, 6)], hostSpans(4), reading, 'c1')).toEqual([
      expect.objectContaining({ paragraphId: 'p1', wordStart: 1, script: 'garden' }),
    ]);
  });

  it('the heading is part of the units the Booth steps through, first, so it counts toward words and pages', () => {
    const units = boothUnits(titled('Chapter 7', 'The Road'));
    expect(units[0]).toEqual(expect.objectContaining({ paragraphId: 'chapter-heading-title', text: 'Chapter 7', words: 2 }));
    expect(units[1]).toEqual(expect.objectContaining({ paragraphId: 'chapter-heading-subtitle', words: 2 }));
    expect(units[2].paragraphId).toBe('p1');
  });
});

describe('entityAtWord', () => {
  it('names the Story Bible entry tinted on a word, and nothing on a plain word', () => {
    const reading = readingParagraphsOf(paragraphs, [], []);
    const tint = { paragraphId: 'p1', start: 4, end: 10, kind: 'entity' as const, colour: typeHueColour('blue'), title: 'Garden' };
    expect(entityAtWord(reading, [tint], 'p1', 1)).toBe('Garden');
    expect(entityAtWord(reading, [tint], 'p1', 2)).toBeNull();
    expect(entityAtWord(reading, [tint], 'p1', 9)).toBeNull();
  });
});
