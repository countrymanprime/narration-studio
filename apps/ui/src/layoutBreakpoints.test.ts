// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { FULL_LAYOUT, LAYOUT_QUERIES, MEDIUM_MAX, NARROW_BELOW, RAIL_COLLAPSE_BELOW, STRIP_MIN_WIDTH, TINY_BELOW, layoutClassFor } from './layoutBreakpoints';

const MOCK_LAYOUT = resolve(__dirname, '../../../docs/research/mockups/studio-next/src/app/layout.ts');

describe('layout vocabulary', () => {
  test('breakpoints-equal-the-mocks-layout-ts', (ctx) => {
    expect([RAIL_COLLAPSE_BELOW, STRIP_MIN_WIDTH, MEDIUM_MAX, NARROW_BELOW, TINY_BELOW]).toEqual([1360, 1360, 1280, 1180, 860]);
    if (!existsSync(MOCK_LAYOUT)) {
      ctx.skip(`${MOCK_LAYOUT} is gone (cutover): the numbers above are the record`);
      return;
    }
    const text = readFileSync(MOCK_LAYOUT, 'utf8');
    const num = (re: RegExp): number => Number(re.exec(text)?.[1]);
    expect(num(/RAIL_COLLAPSE_BELOW = (\d+)/)).toBe(RAIL_COLLAPSE_BELOW);
    expect(num(/STRIP_MIN_WIDTH = (\d+)/)).toBe(STRIP_MIN_WIDTH);
    expect(num(/medium: w <= (\d+)/)).toBe(MEDIUM_MAX);
    expect(num(/narrow: w < (\d+)/)).toBe(NARROW_BELOW);
    expect(num(/tiny: w < (\d+)/)).toBe(TINY_BELOW);
    expect(text).toContain('railCollapsed = w < RAIL_COLLAPSE_BELOW');
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
