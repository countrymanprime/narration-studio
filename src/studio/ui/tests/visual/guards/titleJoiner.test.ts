import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Owner rule (#2251 items 15, 16): a chapter's title and subtitle are drawn by `TitleSubtitle`, never joined by hand with " -- "
// (or its ASCII " - " twin) in a template or string. A source line that joins with a dash fails here.
const SRC = join(__dirname, '../../../src');
const JOINER = /(['"`])\s*(--|-)\s*\1|\}\s(--)\s\$\{|['"`] -- ['"`]|\$\{[^}]*(title|subtitle)[^}]*\} -- /i;

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
        .filter(({ text }) => !text.includes('eslint') && /['"`] -- ['"`]|\$\{[^}]*\} -- \$\{/.test(text)),
    );
    expect(hits).toEqual([]);
  });

  it('the pattern catches the joiners it is meant to', () => {
    expect(JOINER.test('`${title} -- ${subtitle}`')).toBe(true);
    expect(JOINER.test("[a, b].join(' -- ')")).toBe(true);
  });
});
