import { describe, expect, it } from 'vitest';
import { AUDIO, BY_HAND, CHAPTERS, DONE, EXTRA, MIXED, NO_SCORE, PROOF, SPEECH, pickup } from './pickupFixtures';
import {
  pickupTime,
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

  it('pickupTime and parseClock round-trip, and a missing time is a dash', () => {
    expect(pickupTime(312)).toBe('00:05:12');
    expect(pickupTime(340.5)).toBe('00:05:41');
    expect(pickupTime(null)).toBe('—');
    expect(parseClock('5:12')).toBe(312);
    expect(parseClock('05:12.5')).toBe(312.5);
    expect(parseClock('01:39:00')).toBe(5940);
    expect(parseClock(pickupTime(5940))).toBe(5940);
    expect(parseClock('1:60:00')).toBeNull();
    expect(parseClock('soon')).toBeNull();
    expect(parseClock('')).toBeNull();
  });

  it('pickupScript is one "<chapter> · <time>: <line>" per pickup, without tags', () => {
    expect(pickupScript([SPEECH, PROOF], CHAPTERS)).toBe(
      'Chapter 1 · The Orchard · 00:05:12: She walked past the orchard wall.\nChapter 3 · Salt · 00:00:12: Say Aoife as EE-fa.',
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
      'Chapter A · 00:00:02: the word',
      'Chapter A · 00:00:09: <b>raw</b>',
      'Chapter B · 00:00:01: Later chapter',
    ]);
  });
});

// #3590 (owner, 2026-11-22): a pickup time is HH:mm:ss, rounded to the nearest second, no milliseconds, and what is typed in the forms read before still parses.
describe('a pickup time is hh:mm:ss to the nearest second', () => {
  it.each([
    [0, '00:00:00'],
    [0.4, '00:00:00'],
    [0.5, '00:00:01'],
    [12.4, '00:00:12'],
    [131.5, '00:02:12'],
    [311.6, '00:05:12'],
    [3599.6, '01:00:00'],
    [5940, '01:39:00'],
    [360000, '100:00:00'],
  ])('%s s reads %s', (seconds, text) => expect(pickupTime(seconds)).toBe(text));
  it('reads the forms it read before, and its own', () => {
    expect(parseClock('5:12')).toBe(312);
    expect(parseClock('05:12.5')).toBe(312.5);
    expect(parseClock('1:02:05.5')).toBe(3725.5);
    expect(parseClock(pickupTime(312))).toBe(312);
  });
});
