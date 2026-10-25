import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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

describe('scroll edge shadows', () => {
  it('styles.css declares both directions', () => {
    expect(css).toContain('.scroll-x-edges {');
    expect(css).toContain('.scroll-y-edges {');
  });

  it('no component keeps its own copy of the gradients', () => {
    const copies = sources(join(__dirname, 'components')).filter((file) => /no-repeat (local|scroll)/.test(readFileSync(file, 'utf8')));
    expect(copies).toEqual([]);
  });
});
