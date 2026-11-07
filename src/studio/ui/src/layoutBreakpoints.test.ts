// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { FULL_LAYOUT, LAYOUT_QUERIES, MEDIUM_MAX, NARROW_BELOW, RAIL_COLLAPSE_BELOW, STRIP_MIN_WIDTH, TINY_BELOW, layoutClassFor } from './layoutBreakpoints';

describe('layout vocabulary', () => {
  test('breakpoints-are-the-recorded-numbers', () => {
    expect([RAIL_COLLAPSE_BELOW, STRIP_MIN_WIDTH, MEDIUM_MAX, NARROW_BELOW, TINY_BELOW]).toEqual([1360, 1360, 1280, 1180, 860]);
  });

  const WIDTHS = [1361, 1360, 1359, 1281, 1280, 1180, 1179, 861, 860, 859];

  test('layout-class-at-each-boundary', () => {
    const expected: Record<number, [boolean, boolean, boolean, boolean]> = {
      1361: [false, false, false, false],
      1360: [false, false, false, false],
      1359: [true, false, false, false],
      1281: [true, false, false, false],
      1280: [true, true, false, false],
      1180: [true, true, false, false],
      1179: [true, true, true, false],
      861: [true, true, true, false],
      860: [true, true, true, false],
      859: [true, true, true, true],
    };
    for (const w of WIDTHS) {
      const [railCollapsed, medium, narrow, tiny] = expected[w] as [boolean, boolean, boolean, boolean];
      expect(layoutClassFor(w), `${w}px`).toEqual({ railCollapsed, medium, narrow, tiny });
    }
    expect(layoutClassFor(1440)).toEqual(FULL_LAYOUT);
  });

  test('queries-are-the-complements', () => {
    const matches = (query: string, w: number): boolean => w <= Number(/^\(max-width: (\d+)px\)$/.exec(query)?.[1]);
    expect(LAYOUT_QUERIES).toEqual({
      railCollapsed: '(max-width: 1359px)',
      medium: '(max-width: 1280px)',
      narrow: '(max-width: 1179px)',
      tiny: '(max-width: 859px)',
    });
    for (const w of WIDTHS) {
      const cls = layoutClassFor(w);
      for (const key of Object.keys(LAYOUT_QUERIES) as (keyof typeof LAYOUT_QUERIES)[]) {
        expect(matches(LAYOUT_QUERIES[key], w), `${key} at ${w}px`).toBe(cls[key]);
      }
    }
  });
});
