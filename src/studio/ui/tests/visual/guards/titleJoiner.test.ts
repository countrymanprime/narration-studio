import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Owner rule (#2251 items 15, 16): a chapter's title and subtitle are drawn by `TitleSubtitle`, never joined by hand with " -- "
// in a template or string. A source line that joins with it fails here; an eslint-disable line is skipped.
const SRC = join(__dirname, '../../../src');
const JOINER = /['"`] -- ['"`]|\$\{[^}]*\} -- \$\{/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('chapter title joiner', () => {
  it('no source joins a title and subtitle with " -- "', () => {
    const hits = sources(SRC).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ file, line: i + 1, text: line }))
        .filter(({ text }) => !text.includes('eslint') && JOINER.test(text)),
    );
    expect(hits).toEqual([]);
  });

  it('the pattern catches the joiners it is meant to', () => {
    expect(JOINER.test('`${title} -- ${subtitle}`')).toBe(true);
    expect(JOINER.test("[a, b].join(' -- ')")).toBe(true);
  });
});
