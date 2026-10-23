import { describe, expect, it } from 'vitest';
import { clusterPins, earliestInView, type Pin } from './pins';

const pin = (id: string, sec: number): Pin => ({ id, sec, colour: 'red', done: false, label: id });

describe('clusterPins', () => {
  // 100 s over 1000 px: 10 px per second, so pins 1 s apart touch.
  const pins = [pin('a', 10), pin('b', 11), pin('c', 50)];
  it('merges pins closer than 16 px', () => {
    const clusters = clusterPins(pins, 0, 100, 1000, null);
    expect(clusters.map((c) => c.pins.map((p) => p.id))).toEqual([['a', 'b'], ['c']]);
  });
  it('never merges a selected pin or a cluster holding it', () => {
    expect(clusterPins(pins, 0, 100, 1000, 'b').map((c) => c.pins.length)).toEqual([1, 1, 1]);
    expect(clusterPins(pins, 0, 100, 1000, 'a').map((c) => c.pins.length)).toEqual([1, 1, 1]);
  });
  it('drops pins outside the window and finds the earliest in view', () => {
    expect(clusterPins(pins, 40, 30, 1000, null)).toHaveLength(1);
    expect(earliestInView(pins, 0, 100)?.id).toBe('a');
    expect(earliestInView(pins, 60, 30)).toBeNull();
  });
});
