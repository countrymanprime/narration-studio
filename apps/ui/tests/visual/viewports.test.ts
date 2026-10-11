import { describe, expect, it } from 'vitest';
import { layoutClassFor, type LayoutClass } from '../../src/layoutBreakpoints';
import { LAYOUT_BANDS } from './catalog/shared';
import { STATE_CATALOG } from './state-catalog';
import { MEDIUM_ONLY_VIEWPORT, RAIL_ONLY_VIEWPORT, REFLOW_VIEWPORT, VIEWPORTS } from './viewports';

const ALL = [...VIEWPORTS, REFLOW_VIEWPORT, RAIL_ONLY_VIEWPORT, MEDIUM_ONLY_VIEWPORT];
const keyOf = (c: LayoutClass) => (['railCollapsed', 'medium', 'narrow', 'tiny'] as const).map((k) => (c[k] ? k : `!${k}`)).join(' ');

describe('layout band viewports', () => {
  it('band-viewports-sit-in-their-bands', () => {
    const rail = layoutClassFor(RAIL_ONLY_VIEWPORT.width);
    expect(rail.railCollapsed).toBe(true);
    expect(rail.medium).toBe(false);
    const medium = layoutClassFor(MEDIUM_ONLY_VIEWPORT.width);
    expect(medium.medium).toBe(true);
    expect(medium.narrow).toBe(false);
  });

  it('every-class-is-drawn-somewhere', () => {
    // The classes the constants can produce: sweep every width a window can have.
    const reachable = new Set<string>();
    for (let width = 1; width <= 3000; width++) reachable.add(keyOf(layoutClassFor(width)));
    const drawn = new Set(ALL.map((v) => keyOf(layoutClassFor(v.width))));
    const uncovered = [...reachable].filter((k) => !drawn.has(k));
    expect(uncovered, `layout classes no viewport draws: ${uncovered.join(' | ')}`).toEqual([]);
  });

  it('names-are-unique', () => {
    const names = ALL.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('shell-rows-capture-the-bands', () => {
    expect(LAYOUT_BANDS.extraViewports).toEqual([RAIL_ONLY_VIEWPORT, MEDIUM_ONLY_VIEWPORT]);
    for (const [page, state] of [
      ['global', 'nav-rail-open'],
      ['shell', 'jump-menu-open'],
      ['shell', 'context-menu-open'],
      ['shell', 'history-panel-open'],
    ]) {
      const row = STATE_CATALOG.find((e) => e.page === page && e.state === state);
      expect(row, `${page}/${state}`).toBeDefined();
      expect(row?.extraViewports).toEqual(expect.arrayContaining([RAIL_ONLY_VIEWPORT, MEDIUM_ONLY_VIEWPORT]));
    }
    expect(STATE_CATALOG.find((e) => e.state === 'jump-menu-open')?.extraViewports).toContain(REFLOW_VIEWPORT);
  });
});
