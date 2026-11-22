// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard for issue 3962 (reuse): a number is held between two bounds by `clamp` in `clamp.ts` and nowhere else, so every page clamps the same way
// (NaN stays NaN, low wins when the bounds cross). A file that defines its own `clamp`, `clamp01` or `clampTo` function fails here, tests and stories
// included, unless it is listed below with why its helper is not that one. An entry whose file no longer matches fails too, so the list only shrinks.
// The unnamed `Math.max(lo, Math.min(hi, v))` written inline is not scanned yet.
const DIFFERENT: Readonly<Record<string, string>> = {
  'components/primitives/NumberInput.tsx': 'optional bounds (null is no bound) and high wins when they cross; the step snap follows it',
  'components/editing/ribbon/holdScroll.ts': 'a closure over a bound that changes while the button is held (`max()` is read on every step)',
  'components/editing/ribbon/useRibbonView.ts': '`clampTo` fits a whole time window into the chapter and centres it, not a number',
  'components/script/page/reader/layers.ts': 'a closure over the text length of the one paragraph it lays out',
  'api/teleprompterMock.ts': 'the host stand-in rounds to 0.1 as the host does, after clamping',
};

const SRC = join(__dirname);
function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name)) yield path;
  }
}

/** A source text without its comments, so prose that names a helper is not a definition. */
const code = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
// `function clamp(`, or `const clamp = (` / `= x =>` / `= function`: a definition, not a variable that happens to be called `clamp`.
const OWN_CLAMP = /\bfunction\s+clamp(?:01|To)?\s*[<(]|\b(?:const|let|var)\s+clamp(?:01|To)?\s*(?::[^;]*?)?=\s*(?:async\s+)?(?:\(|<|\w+\s*=>|function\b)/;
const definesOwnClamp = (source: string): boolean => OWN_CLAMP.test(code(source));

describe('the scan itself', () => {
  it.each([
    'const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));',
    'export const clamp = (v: number, lo: number, hi: number) => v',
    'const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));',
    'const clampTo = (value: number, range: { min: number; max: number }) => value',
    'let clamp = n => n',
    'function clamp(value: number, low: number, high: number) {}',
    'const clamp = function (n: number) { return n; }',
    'const clamp: (n: number) => number = (n) => n',
  ])('sees %s', (source) => expect(definesOwnClamp(source)).toBe(true));
  it.each([
    "import { clamp } from './clamp';",
    'const x = clamp(at, 0, 1);',
    "const clamp = bodyRows()[0]!.querySelector('.line-clamp-2') as HTMLElement;",
    'const clamped = Math.max(0, Math.min(total, elapsed));',
    'export function clampSpan(span: Span, bounds: Span) {}',
    'function clampWindow(window: TimeWindow, total: number) {}',
    '// const clamp = (n) => n, the old copy',
  ])('leaves %s alone', (source) => expect(definesOwnClamp(source)).toBe(false));
});

describe('one clamp for every number held to a range', () => {
  const found = [...sources(SRC)]
    .map((path) => relative(SRC, path).split(sep).join('/'))
    .filter((file) => file !== 'clamp.ts' && file !== 'clamp.guard.test.ts' && definesOwnClamp(readFileSync(join(SRC, file), 'utf8')));

  it('has no file defining its own clamp outside the list', () => {
    expect(found.filter((file) => !(file in DIFFERENT))).toEqual([]);
  });

  it('lists only files that still need their entry', () => {
    expect(Object.keys(DIFFERENT).filter((file) => !found.includes(file))).toEqual([]);
  });
});
