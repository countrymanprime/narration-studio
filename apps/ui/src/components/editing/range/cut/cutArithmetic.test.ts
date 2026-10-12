import { describe, expect, it } from 'vitest';
import { curTime, type ChapterDoc, type DocCut } from '../../model';
import { docFromHeard } from '../../script/docFromHeard';
import { syntheticChapter } from '../../script/scriptFixtures';

/** A fixed-seed generator (ADR 0044): the same lists every run. */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const { paragraphs, answer } = syntheticChapter(300, 862);
const docWith = (cuts: DocCut[]): ChapterDoc => docFromHeard(paragraphs, answer, { cuts });
const base = docWith([]);
const heard = base.items.filter((i) => i.t0 != null && i.st !== 'miss');

/** Up to `n` non-overlapping runs of heard words in one paragraph each, cut in original time, closing or leaving the gap at random. */
function randomCuts(rand: () => number, n: number): DocCut[] {
  const cuts: DocCut[] = [];
  let at = Math.floor(rand() * 10);
  for (let k = 0; k < n && at < heard.length - 1; k++) {
    const run = heard.slice(at, at + 1 + Math.floor(rand() * 4)).filter((i) => i.pid === heard[at].pid);
    const [first, last] = [run[0], run[run.length - 1]];
    cuts.push({
      id: `c${k}`,
      a: first.t0 as number,
      b: last.t1 as number,
      mode: rand() < 0.7 ? 'close' : 'gap',
      keys: run.map((i) => i.key),
      off0: first.off0 as number,
      off1: last.off1 as number,
    });
    at += run.length + 1 + Math.floor(rand() * 12);
  }
  return cuts;
}

describe('cut-arithmetic-has-property-tests', () => {
  it('after any cuts every word sounds at curTime of where it sounded before them, and a cut word sits where its cut starts', () => {
    const rand = rng(44);
    for (let round = 0; round < 40; round++) {
      const cuts = randomCuts(rand, 1 + Math.floor(rand() * 8));
      const doc = docWith(cuts);
      for (const orig of heard) {
        const now = doc.items[doc.index.get(orig.key) as number];
        const own = cuts.find((c) => c.keys.includes(orig.key));
        const expected = own ? curTime(cuts, own.a) : curTime(cuts, orig.t0 as number);
        expect(now.cut).toBe(own?.id);
        expect(now.t0).toBeCloseTo(expected, 2);
      }
    }
  });

  it('restoring the cuts in any order returns the original times', () => {
    const rand = rng(1044);
    for (let round = 0; round < 20; round++) {
      let cuts = randomCuts(rand, 2 + Math.floor(rand() * 6));
      while (cuts.length) {
        cuts = cuts.filter((_, i) => i !== Math.floor(rand() * cuts.length));
        const doc = docWith(cuts);
        for (const c of cuts) expect(doc.items[doc.index.get(c.keys[0]) as number].cut).toBe(c.id);
      }
      expect(docWith(cuts).items.map((i) => [i.key, i.t0, i.cut])).toEqual(base.items.map((i) => [i.key, i.t0, i.cut]));
    }
  });
});
