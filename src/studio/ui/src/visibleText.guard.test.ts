import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// "Does this text draw anything" has one answer (`visibleText.ts`). A second copy of its letter-number-punctuation-symbol class is how
// `trackName`, `sentenceOr` and the mastering dialog drifted apart (#3382 f), so a new copy fails here.
const SOURCE = new RegExp(['\\\\p\\{L\\}', '\\\\p\\{N\\}', '\\\\p\\{P\\}', '\\\\p\\{S\\}'].join(''));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

// The mastering mock mirrors the Go host's chain.go name rule rune for rune (pinned by chain-names.json), so it keeps its own copy.
const HOST_MIRRORS = new Set(['api/masteringMock.ts']);

function copiesOfTheVisibleTextClass(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([name]) => !HOST_MIRRORS.has(name) && name !== 'visibleText.ts' && !name.endsWith('visibleText.guard.test.ts'))
    .filter(([, text]) => SOURCE.test(text))
    .map(([name]) => name);
}

describe('one "draws something" test', () => {
  it('finds a copy of the class (self-test)', () => {
    expect(copiesOfTheVisibleTextClass({ 'a.ts': 'const x = /[\\p{L}\\p{N}\\p{P}\\p{S}]/u;', 'b.ts': 'const y = 1;' })).toEqual(['a.ts']);
  });

  it('has no copy outside visibleText.ts', () => {
    const root = __dirname;
    const files = Object.fromEntries(sources(root).map((path) => [relative(root, path), readFileSync(path, 'utf8')]));
    expect(copiesOfTheVisibleTextClass(files)).toEqual([]);
  });
});
