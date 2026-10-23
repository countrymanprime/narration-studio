import { describe, expect, it } from 'vitest';
import { marksDoc } from '../script/scriptFixtures';
import { RUNWAY_SECONDS, runwayEnd } from './runway';

const doc = marksDoc();
const heard = doc.items.filter((i) => i.t0 != null && i.t1 != null && i.st !== 'miss' && !i.cut);
const lastOf = (pid: string) => [...heard].filter((i) => i.pid === pid).at(-1)!;
const firstOf = (pid: string) => heard.find((i) => i.pid === pid)!;

// The aligner's end time for a word can fall before the sound has died away, so a play that stops at the last word of a paragraph clips it.
describe('runwayEnd', () => {
  it('gives the last word of a paragraph room to ramp down', () => {
    const last = lastOf('p-1');
    const end = last.t1 as number;
    const got = runwayEnd(doc, last.key, end);
    expect(got).toBeGreaterThan(end);
    expect(got - end).toBeLessThanOrEqual(RUNWAY_SECONDS + 1e-9);
  });

  it('never runs into the next paragraph', () => {
    const last = lastOf('p-1');
    const next = firstOf('p-2').t0 as number;
    expect(runwayEnd(doc, last.key, last.t1 as number)).toBeLessThan(next);
  });

  it('leaves a word in the middle of a paragraph alone', () => {
    const word = heard.find((i) => i.pid === 'p-1')!;
    expect(runwayEnd(doc, word.key, word.t1 as number)).toBe(word.t1);
  });

  it('gives the very last word of the chapter the whole runway', () => {
    const last = heard.at(-1)!;
    expect(runwayEnd(doc, last.key, last.t1 as number)).toBeCloseTo((last.t1 as number) + RUNWAY_SECONDS, 6);
  });

  it('leaves an unknown word as it was', () => {
    expect(runwayEnd(doc, 'no-such-key', 12.5)).toBe(12.5);
  });
});
