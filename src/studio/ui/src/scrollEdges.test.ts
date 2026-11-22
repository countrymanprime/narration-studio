import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseThemes, resolveContrast } from './tokenContrast';

// The edge shadows of a scrolling box live in styles.css (`scroll-x-edges`, `scroll-y-edges`), not as a copy in a component: a local copy of
// the vertical one lived in CheckRecordingsDialog.tsx until the utility existed.
const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

// The cue is the darkest the edge gets: --scroll-edge laid over --surface, the colour of the box (the cover that hides it at the end of the
// scroll is --surface too). A black shade on the dark surface was 1.05:1 against it, which no narrator sees (#3832); the light one was 1.6:1.
const VISIBLE_STEP = 1.5;
const FOLLOWS_THE_TOKEN = /var\(--scroll-edge\)/;

describe('scroll edge shadows', () => {
  it('every gradient of the cue is --scroll-edge, never a colour of its own', () => {
    const rules = [...css.matchAll(/\.scroll-[xy]-edges \{([^}]*)\}/g)].map((rule) => rule[1]);
    expect(rules).toHaveLength(2);
    for (const rule of rules) {
      const scrollGradients = rule.split('\n').filter((line) => /no-repeat scroll/.test(line));
      expect(scrollGradients).toHaveLength(2);
      for (const line of scrollGradients) expect(line, line).toMatch(FOLLOWS_THE_TOKEN);
    }
  });

  for (const theme of ['light', 'dark'] as const) {
    it(`the cue is a visible step off the surface in the ${theme} theme`, () => {
      const tokens = parseThemes(css)[theme];
      const step = resolveContrast(tokens, { fg: 'var(--scroll-edge)', over: 'surface' });
      expect(step, `--scroll-edge over --surface in ${theme}: ${step.toFixed(2)}:1`).toBeGreaterThanOrEqual(VISIBLE_STEP);
    });
  }

  it('styles.css declares both directions', () => {
    expect(css).toContain('.scroll-x-edges {');
    expect(css).toContain('.scroll-y-edges {');
  });

  it('no component keeps its own copy of the gradients', () => {
    const copies = sources(join(__dirname, 'components')).filter((file) => /no-repeat (local|scroll)/.test(readFileSync(file, 'utf8')));
    expect(copies).toEqual([]);
  });
});
