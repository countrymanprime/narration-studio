// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';

// ADR 0761 decision 1: a width query is written at one of the mock's widths. Tailwind cannot read a constant inside a class
// name, so `layoutBreakpoints.ts` and the classes are linked by this scan, not an import. It counts the Tailwind
// `min-[Npx]` and `max-[Npx]` variants with N between 860 and 1440 per file; each is one of the vocabulary's eight or is in
// `OFF_VOCABULARY`, whose counts may only go down (a higher real count fails, a lower one fails until the entry is
// lowered or deleted, as `rawNatives.test.ts` does). It also fails a width compared with a vocabulary number outside the
// hook, so a component cannot grow a second mechanism.
const SRC = join(__dirname);
const VOCABULARY = new Set(['min-[1360px]', 'max-[1359px]', 'max-[1280px]', 'min-[1281px]', 'max-[1179px]', 'min-[1180px]', 'max-[859px]', 'min-[860px]']);

// Today's off-vocabulary uses. Each entry is deleted by the swap slice named in its comment.
const OFF_VOCABULARY: Record<string, Record<string, number>> = {
  // The Production swap rewrites the page to the vocabulary. `min-[1280px]` treats exactly 1280 as not medium; the mock treats it as medium.
  'src/components/production/ProductionPage.tsx': { 'min-[1280px]': 3, 'max-[1279px]': 1 },
  // The Script swap rewrites the page to the vocabulary.
  'src/components/script/ScriptPage.tsx': { 'min-[1280px]': 1, 'min-[1440px]': 3 },
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.(test|stories)\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const rel = (p: string): string => relative(join(SRC, '..'), p).split(sep).join('/');
const files = sourceFiles(SRC).map((p) => ({ path: rel(p), text: readFileSync(p, 'utf8') }));

/** Width variants with N in 860..1440, counted per variant. */
function widthVariants(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of text.matchAll(/\b(min|max)-\[(\d+)px\]/g)) {
    const n = Number(m[2]);
    if (n < 860 || n > 1440) continue;
    counts[m[0]] = (counts[m[0]] ?? 0) + 1;
  }
  return counts;
}

const VOCAB_NUMBERS = '(?:860|1180|1280|1360)';
const COMPARE = new RegExp(
  `\\b(?:innerWidth|clientWidth)\\s*(?:<=|>=|<|>)\\s*${VOCAB_NUMBERS}\\b|\\b${VOCAB_NUMBERS}\\s*(?:<=|>=|<|>)\\s*[\\w.]*(?:innerWidth|clientWidth)\\b`,
);

describe('width queries', () => {
  test('tailwind-widths-use-the-vocabulary', () => {
    const stray: string[] = [];
    for (const f of files) {
      for (const variant of Object.keys(widthVariants(f.text))) {
        if (!VOCABULARY.has(variant) && !(variant in (OFF_VOCABULARY[f.path] ?? {}))) stray.push(`${f.path}: ${variant}`);
      }
    }
    expect(stray, 'use the mock widths (src/layoutBreakpoints.ts) or record the use in OFF_VOCABULARY').toEqual([]);
  });

  test('off-vocabulary-only-falls', () => {
    const byPath = new Map(files.map((f) => [f.path, f.text]));
    const problems: string[] = [];
    for (const [path, entries] of Object.entries(OFF_VOCABULARY)) {
      const found = widthVariants(byPath.get(path) ?? '');
      for (const [variant, ceiling] of Object.entries(entries)) {
        const real = found[variant] ?? 0;
        if (real > ceiling) problems.push(`${path}: ${variant} is used ${real} times, the ceiling is ${ceiling}`);
        if (real < ceiling) problems.push(`${path}: ${variant} is used ${real} times, lower the ceiling to ${real} (delete the entry at 0)`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('no-width-compared-to-a-vocabulary-number', () => {
    const hits = files.filter((f) => f.path !== 'src/hooks/useLayoutClass.ts' && COMPARE.test(f.text)).map((f) => f.path);
    expect(hits, 'use useLayoutClass or a width variant, not a second mechanism (ADR 0761)').toEqual([]);
    for (const bad of ['window.innerWidth < 1360', 'el.clientWidth <= 1280', '860 > document.documentElement.clientWidth', 'innerWidth>=1180']) {
      expect(COMPARE.test(bad), bad).toBe(true);
    }
    expect(COMPARE.test('window.innerWidth - width - 8')).toBe(false);
  });
});
