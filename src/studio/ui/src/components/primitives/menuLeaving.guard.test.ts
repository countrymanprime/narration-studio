import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// A menu that has been closed stays drawn for its exit (120 ms), with its highlighted item still focused: a Space or an Enter pressed inside the exit presses
// that item (#4125 the chapter list, #4183 the Booth's right-click menu and the Menu primitive). Every component that draws a Base UI menu keeps its items
// from taking a press then, through `useLeaving`. A new menu primitive that does not fails here, so the next one starts from the guard and not from the bug.
const SRC = join(__dirname, '..', '..');
const isSource = (file: string) => /\.tsx?$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file);
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : isSource(path) ? [path] : [];
  });
const sources = walk(SRC).map((path) => ({ path: relative(SRC, path), text: readFileSync(path, 'utf8') }));

const DRAWS_A_MENU = /from '@base-ui\/react\/(menu|context-menu|menubar)'/;

describe('every Base UI menu keeps its items from taking a press while it leaves', () => {
  const menus = sources.filter((source) => DRAWS_A_MENU.test(source.text));

  it('finds the menu components, so the guard cannot go quiet', () => {
    expect(menus.map((menu) => menu.path).sort()).toEqual([
      'components/primitives/ChapterStepper.tsx',
      'components/primitives/ContextMenu.tsx',
      'components/primitives/Menu.tsx',
    ]);
  });

  it.each(menus.map((menu) => [menu.path, menu.text]))('%s tracks its exit with useLeaving and disables its items while it leaves', (_path, text) => {
    expect(text).toContain("from './useLeaving'");
    expect(text).toMatch(/useLeaving\(\)/);
    expect(text).toMatch(/disabled=\{[^}]*leaving[^}]*\}/);
    // The hook is told when the menu opens or closes.
    expect(text).toMatch(/onOpenChange=\{[^}]*track|track\(/);
  });
});
