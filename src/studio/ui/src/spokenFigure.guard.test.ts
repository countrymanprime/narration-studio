// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// #3443: a visible hours-and-minutes figure ("4h 35m") is read letter by letter by a screen reader, so a component that draws one goes through `SpokenFigure`
// (the visible text, and a hidden copy that says "4 hours 35 minutes"). A `.tsx` under Production or Schedule that calls `hm(` or `formatClock(` imports it;
// the `.ts` files that only build the strings (figures, rows, formats) hand them to a component that does.
const SRC = __dirname;
function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx$/.test(name) && !/\.(test|stories)\.tsx$/.test(name)) yield path;
  }
}
const files = [...sources(join(SRC, 'components'))].map((path) => relative(SRC, path).split(sep).join('/'));
const DRAWS = /\b(?:hm|formatClock)\(/;
// Components that call the formatter and have a reason not to draw the figure in the page.
const EXEMPT: Readonly<Record<string, string>> = {
  'components/production/ProductionPage.tsx': 'hands the string to a StatTile value, which spells it out through SpokenFigure itself',
};

describe('every drawn hours-and-minutes figure goes through SpokenFigure', () => {
  const drawing = files.filter((file) => /^components\/(production|schedule)\//.test(file) && DRAWS.test(readFileSync(join(SRC, file), 'utf8')));
  it('sees the components that draw one (its own check)', () => {
    expect(drawing.length).toBeGreaterThanOrEqual(5);
    expect(drawing).toContain('components/production/overview/StageBar.tsx');
  });
  it('imports SpokenFigure in each, or lists why not', () => {
    const missing = drawing.filter((file) => !/\bSpokenFigure\b/.test(readFileSync(join(SRC, file), 'utf8')) && !(file in EXEMPT));
    expect(missing).toEqual([]);
  });
  it('lists no exemption that no longer applies', () => {
    expect(Object.keys(EXEMPT).filter((file) => !drawing.includes(file))).toEqual([]);
  });
});
