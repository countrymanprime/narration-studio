import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUARDED_PAGES, SHELL_CHROME_PAGES, shellChromeCases, shellPageCases } from './overlays/pages';

// The overlay guard runs the shell's top-bar overlays (hints, Jump to, History, the navigation drawer) on three pages, not ten
// (overlays/shell.ts). That is the same check only while two things hold, and this file pins both so the saving cannot quietly
// become a hole: no case of the shell was dropped by the split, and nothing a page owns can be drawn over those overlays.

const SRC = join(import.meta.dirname, '..', '..', 'src');
const COMPONENTS = join(SRC, 'components');
const css = readFileSync(join(SRC, 'styles.css'), 'utf8');
const layer = (name: string): number => {
  const match = css.match(new RegExp(`--z-${name}:\\s*(\\d+)`));
  if (!match) throw new Error(`--z-${name} is not defined in styles.css`);
  return Number(match[1]);
};

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.(test|stories)\.tsx$/.test(name) ? [path] : [];
  });

describe('the shell overlay scope', () => {
  it('splits the shell cases without dropping one', () => {
    const names = [...shellPageCases, ...shellChromeCases].map((overlay) => overlay.name).sort();
    expect(names).toEqual(
      [
        'context menu on the page',
        'navigation rail opened over the page',
        'hint on Switch project',
        'hint on Jump to or run',
        'Jump to or run',
        'History',
        'navigation drawer',
      ].sort(),
    );
  });

  it('keeps the page-relative cases on every page, and the top-bar cases on three', () => {
    expect(shellPageCases.map((overlay) => overlay.name)).toEqual(['context menu on the page', 'navigation rail opened over the page']);
    expect(new Set(SHELL_CHROME_PAGES).size).toBe(3);
    for (const page of SHELL_CHROME_PAGES) expect(Object.keys(GUARDED_PAGES)).toContain(page);
  });

  it('draws the top bar once, for every page', () => {
    const shell = readFileSync(join(COMPONENTS, 'layout', 'AppShell.tsx'), 'utf8');
    expect(shell.match(/<header\b/g)).toHaveLength(1);
  });

  it('portals the top-bar overlays to the body', () => {
    for (const file of ['Tooltip.tsx', 'Dialog.tsx', 'NavDrawer.tsx']) {
      expect(readFileSync(join(COMPONENTS, 'primitives', file), 'utf8'), file).toMatch(/\bPortal\b/);
    }
  });

  it('keeps every layer at or above the dialog inside the primitives', () => {
    const dialog = layer('dialog');
    const offenders: string[] = [];
    for (const path of sources(COMPONENTS)) {
      if (relative(COMPONENTS, path).startsWith('primitives')) continue;
      for (const match of readFileSync(path, 'utf8').matchAll(/--z-([a-z-]+)/g)) {
        if (layer(match[1]) >= dialog) offenders.push(`${relative(SRC, path)}: --z-${match[1]}`);
      }
    }
    expect(offenders, 'a page that draws at or above the dialog layer can cover the top-bar overlays: run them on that page too').toEqual([]);
  });
});
