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
  typeTone,
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
    expect(clock(312)).toBe('05:12.0');
    expect(clock(340.5)).toBe('05:40.5');
    expect(clock(null)).toBe('—');
    expect(parseClock('5:12')).toBe(312);
    expect(parseClock('05:12.5')).toBe(312.5);
    expect(parseClock('soon')).toBeNull();
    expect(parseClock('')).toBeNull();
  });

  it('pickupScript is one "<chapter> · <time>: <line>" per pickup, without tags', () => {
    expect(pickupScript([SPEECH, PROOF], CHAPTERS)).toBe(
      'Chapter 1 · The Orchard · 05:12.0: She walked past the orchard wall.\nChapter 3 · Salt · 00:12.0: Say Aoife as EE-fa.',
    );
    expect(pickupScript([], CHAPTERS)).toBe('');
  });
});

describe('the type chip', () => {
  it('capitalises a note type the host wrote in lower case, so every row reads alike', () => {
    expect(typeLabel(pickup({ gap: undefined, type: 'noise' }))).toBe('Noise');
    expect(typeLabel(pickup({ gap: undefined, type: 'misread' }))).toBe('Misread');
  });

  it('colours by the kind of fault, as the mock does', () => {
    expect(typeTone(SPEECH)).toBe('danger');
    expect(typeTone(NO_SCORE)).toBe('danger');
    expect(typeTone(EXTRA)).toBe('warning');
    expect(typeTone(pickup({ gap: undefined, type: 'noise' }))).toBe('warning');
    expect(typeTone(pickup({ gap: undefined, type: 'Pronunciation' }))).toBe('info');
    expect(typeTone(pickup({ gap: undefined, type: 'Pacing' }))).toBe('accent');
    expect(typeTone(pickup({ gap: 'other', type: 'Odd' }))).toBe('neutral');
  });
});
