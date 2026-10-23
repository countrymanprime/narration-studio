import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { HeardWord } from './align';
import { DUP_HEAD_WORDS, DUP_MIN_PAUSE, duplicateRead, splitDuplicateTake } from './duplicates';
import { canStack, type StackPassage } from './stacking';

const SCRIPT = '“Serpent!” screamed the Pigeon, and flapped away.';

/** Words spoken one after another, 0.3 s each with 0.05 s between them; `pauses` maps a word index to a longer gap before it. */
function say(text: string, pauses: Record<number, number> = {}, from = 0): HeardWord[] {
  let t = from;
  return text.split(/\s+/).map((word, i) => {
    t += pauses[i] ?? (i === 0 ? 0 : 0.05);
    const w = { text: word, off0: t, off1: t + 0.3, conf: 0.95 };
    t += 0.3;
    return w;
  });
}
const twice = (gap: number, tail = ''): HeardWord[] => {
  const first = say(SCRIPT);
  const second = say(SCRIPT + tail, {}, first[first.length - 1].off1 + gap);
  return [...first, ...second];
};

describe('duplicateRead: a take that reads the line twice', () => {
  it('finds-the-second-read: a repeat of the line’s first words after a pause is a duplicate with its start time', () => {
    const heard = twice(1.2);
    const dup = duplicateRead(SCRIPT, heard)!;
    expect(dup.index).toBe(7);
    expect(dup.startsAt).toBe(heard[7].off0);
    expect(dup.cutAt).toBeGreaterThan(heard[6].off1);
    expect(dup.cutAt).toBeLessThan(heard[7].off0);
    expect(dup.first).toBe(SCRIPT);
    expect(dup.second).toBe(SCRIPT);
  });

  it('a stutter is not a second read', () => {
    const heard = say('“Serpent!” “Serpent!” screamed the Pigeon, and flapped away.', { 1: 0.8 });
    expect(duplicateRead(SCRIPT, heard)).toBeNull();
  });

  it('an extra word is not a second read', () => {
    const heard = say('“Serpent!” screamed the Pigeon, well, and flapped away.');
    expect(duplicateRead(SCRIPT, heard)).toBeNull();
  });

  it('a repeat with no pause before it is not a second read', () => {
    expect(duplicateRead(SCRIPT, twice(DUP_MIN_PAUSE / 2))).toBeNull();
    expect(duplicateRead(SCRIPT, twice(DUP_MIN_PAUSE))).not.toBeNull();
  });

  it('a line that repeats itself in the script is not flagged', () => {
    const script = 'No no no no no no no no, said the Pigeon.';
    expect(duplicateRead(script, say(script, { 4: 1 }))).toBeNull();
  });

  it('a line shorter than the head is judged on the words it has, but a one-word line is never a duplicate', () => {
    expect(duplicateRead('Serpent! screamed', [...say('Serpent! screamed'), ...say('Serpent! screamed', {}, 3)])).not.toBeNull();
    expect(duplicateRead('Serpent!', [...say('Serpent!'), ...say('Serpent!', {}, 3)])).toBeNull();
  });

  it('a take that is read once, or heard as nothing, is not a duplicate', () => {
    expect(duplicateRead(SCRIPT, say(SCRIPT))).toBeNull();
    expect(duplicateRead(SCRIPT, [])).toBeNull();
  });

  it('ignores case and punctuation when it compares', () => {
    const heard = [...say(SCRIPT), ...say('serpent screamed the pigeon and flapped away', {}, 6)];
    expect(duplicateRead(SCRIPT, heard)?.index).toBe(7);
  });

  it('property: a script read twice with a pause is found where the second read starts, and read once is never found', () => {
    const word = fc.stringMatching(/^[a-z]{3,8}$/);
    fc.assert(
      fc.property(fc.array(word, { minLength: DUP_HEAD_WORDS, maxLength: 12 }), fc.double({ min: DUP_MIN_PAUSE, max: 5, noNaN: true }), (words, gap) => {
        // A script whose head words repeat later is outside the rule (see the test above).
        fc.pre(
          new Set(words.slice(0, DUP_HEAD_WORDS)).size === DUP_HEAD_WORDS &&
            !words.slice(1).some((_, i) => words.slice(i + 1, i + 1 + DUP_HEAD_WORDS).join() === words.slice(0, DUP_HEAD_WORDS).join()),
        );
        const script = words.join(' ');
        const first = say(script);
        const second = say(script, {}, first[first.length - 1].off1 + gap);
        expect(duplicateRead(script, first)).toBeNull();
        const dup = duplicateRead(script, [...first, ...second])!;
        expect(dup.index).toBe(words.length);
        expect(dup.startsAt).toBe(second[0].off0);
        expect(dup.cutAt).toBeGreaterThanOrEqual(first[first.length - 1].off1);
        expect(dup.cutAt).toBeLessThanOrEqual(second[0].off0);
      }),
    );
  });
});

describe('splitDuplicateTake: the two takes a cut makes', () => {
  const take = { id: 'T05-12', start: 600, len: 12 };

  it('cuts one take into two that together cover it, the second one active', () => {
    const [a, b] = splitDuplicateTake(take, 621.2);
    expect(a).toMatchObject({ id: 'T05-12a', start: 600 });
    expect(b).toMatchObject({ id: 'T05-12b', start: 621.2 });
    expect(a.len + b.len).toBeCloseTo(take.len + 600 - 600, 1);
  });

  it('duplicate-is-not-a-retry-group-until-split: one take read twice cannot be stacked; the two takes it is split into can', () => {
    const whole: StackPassage = { id: 'ps5-15', chapterId: '5', kept: false, takes: [take] };
    expect(canStack(whole)).toBe(false);
    const split = splitDuplicateTake({ id: 'T05-12', start: 600, len: 25 }, 612.5);
    expect(canStack({ ...whole, takes: split })).toBe(true);
  });
});
