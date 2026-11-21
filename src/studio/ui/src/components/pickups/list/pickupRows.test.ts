import { clock as clockOf } from '../../../clock';
import { describe, expect, it } from 'vitest';
import { AUDIO, BY_HAND, CHAPTERS, DONE, EXTRA, MIXED, NO_SCORE, PROOF, SPEECH, pickup } from './pickupFixtures';
import {
  clock,
  groupByChapter,
  inScope,
  parseClock,
  pickupScript,
  plainLine,
  scriptParts,
  sessionPickups,
  sourceLabel,
  sourceTitle,
  typeLabel,
  pickupKind,
} from './pickupRows';

describe('pickupRows', () => {
  it('rows-group-by-chapter-with-open-count: a group per chapter that has pickups, counting the open ones', () => {
    const groups = groupByChapter(MIXED, CHAPTERS);
    expect(groups.map((g) => [g.chapter.id, g.items.length, g.open])).toEqual([
      ['c1', 3, 2],
      ['c2', 2, 2],
      ['c3', 2, 2],
    ]);
    expect(groupByChapter([EXTRA], CHAPTERS).map((g) => g.chapter.id)).toEqual(['c2']);
    expect(groupByChapter([pickup({ chapterId: 'gone' })], CHAPTERS).map((g) => g.chapter.name)).toEqual(['gone']);
  });

  it('scopes to the chapter in view or all', () => {
    expect(inScope(MIXED, 'all')).toHaveLength(7);
    expect(inScope(MIXED, 'c2').map((p) => p.id)).toEqual([EXTRA.id, AUDIO.id]);
    expect(inScope(MIXED, 'c9')).toEqual([]);
  });

  it('columns-show-the-source-honestly', () => {
    expect(sourceLabel(SPEECH)).toBe('Speech · 0.91');
    expect(sourceLabel(NO_SCORE)).toBe('Speech · no score');
    expect(sourceTitle(NO_SCORE)).toBe('The engine gave no word scores.');
    expect(sourceTitle(SPEECH)).toBeUndefined();
    expect(sourceLabel(AUDIO)).toBe('Audio');
    expect(sourceLabel(PROOF)).toBe('Proof note');
    expect(sourceLabel(BY_HAND)).toBe('You');
  });

  it('types are the gap word or the finding type', () => {
    expect(typeLabel(NO_SCORE)).toBe('Left out');
    expect(typeLabel(EXTRA)).toBe('Extra words');
    expect(typeLabel(SPEECH)).toBe('Misread');
    expect(typeLabel(pickup({ gap: 'other', type: 'Odd' }))).toBe('Odd');
    expect(typeLabel(AUDIO)).toBe('Mouth click');
  });

  it('only <b> and <i> are markup in a line', () => {
    expect(scriptParts('a <b>b</b> c <i>d</i> <u>e</u>')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'b', text: 'b' },
      { kind: 'text', text: ' c ' },
      { kind: 'i', text: 'd' },
      { kind: 'text', text: ' <u>e</u>' },
    ]);
    expect(plainLine('Say <b>Aoife</b> now')).toBe('Say Aoife now');
  });

  it('the session is the open, included lines', () => {
    expect(sessionPickups([SPEECH, DONE, pickup({ id: 'x', included: false })]).map((p) => p.id)).toEqual([SPEECH.id]);
  });

  it('clock and parseClock round-trip, and a missing time is a dash', () => {
    expect(clock(312)).toBe('00:05:12.000');
    expect(clock(340.5)).toBe('00:05:40.500');
    expect(clock(null)).toBe('—');
    expect(parseClock('5:12')).toBe(312);
    expect(parseClock('00:05:12.500')).toBe(312.5);
    expect(parseClock('01:39:00.000')).toBe(5940);
    expect(parseClock(clock(5940))).toBe(5940);
    expect(parseClock('1:60:00')).toBeNull();
    expect(parseClock('soon')).toBeNull();
    expect(parseClock('')).toBeNull();
  });

  it('pickupScript is one "<chapter> · <time>: <line>" per pickup, without tags', () => {
    expect(pickupScript([SPEECH, PROOF], CHAPTERS)).toBe(
      'Chapter 1 · The Orchard · 00:05:12.000: She walked past the orchard wall.\nChapter 3 · Salt · 00:00:12.000: Say Aoife as EE-fa.',
    );
    expect(pickupScript([], CHAPTERS)).toBe('');
  });
});

describe('the type chip', () => {
  it('capitalises a note type the host wrote in lower case, so every row reads alike', () => {
    expect(typeLabel(pickup({ gap: undefined, type: 'noise' }))).toBe('Noise');
    expect(typeLabel(pickup({ gap: undefined, type: 'misread' }))).toBe('Misread');
  });

  it('names the kind of fault, so the chip is drawn as that kind is on every page (extra words and pacing are red, D1 and D4)', () => {
    expect(pickupKind(SPEECH)).toBe('misread');
    expect(pickupKind(NO_SCORE)).toBe('missing');
    expect(pickupKind(EXTRA)).toBe('extra');
    expect(pickupKind(pickup({ gap: undefined, type: 'noise' }))).toBe('noise');
    expect(pickupKind(pickup({ gap: undefined, type: 'Mouth click' }))).toBe('click');
    expect(pickupKind(pickup({ gap: undefined, type: 'Pronunciation' }))).toBe('pron');
    expect(pickupKind(pickup({ gap: undefined, type: 'Pacing' }))).toBe('pacing');
    expect(pickupKind(pickup({ gap: undefined, type: 'Repeat' }))).toBe('repeat');
    expect(pickupKind(pickup({ gap: 'other', type: 'Odd' }))).toBeNull();
  });
});

describe('the copied script', () => {
  const chapters = [
    { id: 'a', name: 'Chapter A' },
    { id: 'b', name: 'Chapter B' },
  ];
  it('lists chapters in manuscript order and lines by time, a typed line as typed, a note line without its tags', () => {
    const lines = [
      pickup({ id: '1', chapterId: 'b', time: 1, script: 'Later chapter' }),
      pickup({ id: '2', chapterId: 'a', time: 9, source: 'you', script: '<b>raw</b>' }),
      pickup({ id: '3', chapterId: 'a', time: 2, script: 'the <b>word</b>' }),
    ];
    expect(pickupScript(lines, chapters).split('\n')).toEqual([
      'Chapter A · 00:00:02.000: the word',
      'Chapter A · 00:00:09.000: <b>raw</b>',
      'Chapter B · 00:00:01.000: Later chapter',
    ]);
  });
});

// #3590: a pickup's time is the position Proof shows for its note, so the two are one text, and what the form writes the form reads back.
describe('a pickup time is written in the form Proof writes a position in', () => {
  it.each([0, 0.4, 12.4, 95.2, 312.5, 340.123, 5940, 3600.999])('%s s reads the same on both pages and parses back', (seconds) => {
    expect(clock(seconds)).toBe(clockOf(seconds, { full: true }));
    expect(parseClock(clock(seconds))).toBeCloseTo(seconds, 3);
  });
  it('keeps the milliseconds a note had', () => {
    expect(clock(340.123)).toBe('00:05:40.123');
    expect(parseClock('00:05:40.123')).toBeCloseTo(340.123, 3);
    expect(parseClock('05:12.5555')).toBeNull();
  });
});
