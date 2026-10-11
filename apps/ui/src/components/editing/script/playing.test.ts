import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { itemAt } from '../model';
import { announceSel } from './announce';
import { playable, playingKey } from './playing';
import { marksDoc } from './scriptFixtures';

const doc = marksDoc();

describe('the playing word', () => {
  it("is the last timed word that began at or before the time, like the model's linear lookup", () => {
    const words = playable(doc);
    fc.assert(
      fc.property(fc.double({ min: 0, max: 30, noNaN: true }), (t) => {
        expect(playingKey(words, t)).toBe(itemAt(doc, t)?.key ?? null);
      }),
      { seed: 1044, numRuns: 200 },
    );
    expect(playingKey(words, null)).toBeNull();
    expect(playingKey(words, -1)).toBeNull();
  });
});

describe('selection-is-announced', () => {
  const keys = doc.items.map((i) => i.key);
  it('says how many words and from when to when', () => {
    expect(announceSel(doc, { anchor: keys[0], head: keys[2] })).toMatch(/^3 words selected, \d+:\d\d to \d+:\d\d$/);
    expect(announceSel(doc, { anchor: keys[0], head: keys[0] })).toMatch(/^1 word selected/);
  });
  it('says "not in the script" when every word was said and is not in it', () => {
    const um = doc.items.find((i) => i.st === 'extra')!.key;
    expect(announceSel(doc, { anchor: um, head: um })).toMatch(/not in the script$/);
  });
  it('says nothing for no selection', () => expect(announceSel(doc, null)).toBe(''));
});
