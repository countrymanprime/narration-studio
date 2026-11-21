import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// "Does this text draw anything" has one answer (`visibleText.ts`). A second copy is how `trackName`, `sentenceOr`, the mastering dialog and
// `keptTitle` drifted apart (#3382 f), and a guard that knows one spelling is bypassed by the next, so each spelling has a self-test case:
//   - the letter, number, punctuation and symbol classes together, in any order or with more classes;
//   - a negated class of white space, format and control characters;
//   - a hand list of zero-width code points: the zero-width space and the byte order mark in one file, as escapes or as numbers.
const SPELLINGS: Record<string, (text: string) => boolean> = {
  'letter, number, punctuation and symbol classes': (text) => ['\\p{L}', '\\p{N}', '\\p{P}', '\\p{S}'].every((part) => text.includes(part)),
  'a negated format and control class': (text) => /\[\^[^\]]*\\p\{C[fc]\}/.test(text),
  'a hand list of zero-width code points': (text) => /\\u200b|0x200b/i.test(text) && /\\ufeff|0xfeff/i.test(text),
};

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

// These mocks mirror a Go host rule rune for rune, so each keeps its own copy: masteringMock is chain.go's name rule (pinned by chain-names.json) and
// renderEncodeMasterMock is export_job.go's hasVisibleRune for an untitled chapter.
const HOST_MIRRORS = new Set(['api/masteringMock.ts', 'api/renderEncodeMasterMock.ts']);

function copiesOfTheVisibleTextRule(files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([name]) => !HOST_MIRRORS.has(name) && name !== 'visibleText.ts' && !name.endsWith('visibleText.guard.test.ts') && !/\.test\.tsx?$/.test(name))
    .filter(([, text]) => Object.values(SPELLINGS).some((found) => found(text)))
    .map(([name]) => name);
}

describe('one "draws something" test', () => {
  it.each([
    ['letter, number, punctuation and symbol classes', 'const x = /[\\p{S}\\p{P}\\p{M}\\p{L}\\p{N}]/u;'],
    ['a negated format and control class', 'const x = /[^\\s\\p{Cf}\\p{Cc}]/u;'],
    ['a hand list of zero-width code points', 'const x = code === 0x200b || code === 0xfeff;'],
    ['a hand list of zero-width code points', 'const x = /[\\u200B\\uFEFF]/;'],
  ])('finds the %s spelling (self-test)', (_name, text) => {
    expect(copiesOfTheVisibleTextRule({ 'a.ts': text, 'b.ts': 'const y = 1;' })).toEqual(['a.ts']);
  });

  it('has no copy outside visibleText.ts', () => {
    const root = __dirname;
    const files = Object.fromEntries(sources(root).map((path) => [relative(root, path), readFileSync(path, 'utf8')]));
    expect(copiesOfTheVisibleTextRule(files)).toEqual([]);
  });
});
