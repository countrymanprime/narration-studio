// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard for issue 3962 (reuse): a number is held between two bounds by `clamp` in `clamp.ts` and nowhere else, so every page clamps the same way
// (NaN stays NaN, low wins when the bounds cross). A file fails here, tests and stories included, when it defines a function named `clamp...` (`clamp`,
// `clamp01`, `clampValue`; a declaration, an arrow or function bound to a name, or an object property or method), or a three-parameter function under
// any name whose whole body is `Math.max` around `Math.min` (or the other way round) of exactly those parameters, unless it is listed below with why
// its helper is not that one. An entry whose file no longer matches fails too, so the list only shrinks. A second rule fails source outside tests
// that writes the clamp inline, `Math.max(a, Math.min(b, c))` or `Math.min(a, Math.max(b, c))` in any order of operands, multi-line or inside a
// longer body (a one-parameter helper with fixed bounds such as `(p) => Math.min(99, Math.max(1, p))` included), unless `INLINE_KEPT` lists the file
// with how many such sites it keeps and why they are not `clamp`.
const DIFFERENT: Readonly<Record<string, string>> = {
  'components/primitives/NumberInput.tsx': 'optional bounds (null is no bound) and high wins when they cross; the step snap follows it',
  'components/editing/ribbon/useRibbonView.ts': '`clampTo` fits a whole time window into the chapter and centres it, not a number',
  'components/editing/ribbon/rangeMath.ts': '`clampSpan` keeps a span inside its bounds and at least a minimum wide, not a number',
  'components/proof/frame/windowMath.ts': '`clampWindow` fits a time window and its zoom minimum into the chapter, not a number',
  'components/booth/page/useBoothPage.ts': '`clampAt` keeps a reading position (unit and word) inside the units, not a number',
  'components/editing/ribbon/scrollStep.ts': '`clampScrollStep` rounds to whole seconds and turns a non-number into the default step',
};

// The inline sites that stay, with why each gives a different result from `clamp` (most: the outer `Math.min` must win when the bounds cross).
const INLINE_KEPT: Readonly<Record<string, { sites: number; why: string }>> = {
  'api/teleprompterMock.ts': { sites: 1, why: '`sentenceStart` has no `tokens > 0` guard: on no words the high bound (-1) must win' },
  'components/editing/model/audioTail.ts': { sites: 1, why: 'a loop bound: `last` must win over `from` when a caller passes a limit before the end' },
  'components/editing/range/replace/ReplaceDialog.tsx': { sites: 1, why: 'a file shorter than REPLACE_MIN_SECONDS: its length (the high bound) must win' },
  'components/editing/ribbon/peaksWindow.ts': {
    sites: 2,
    why: 'a loop bound where `first` can pass the last bucket and the loop must then run empty; and the larger of two magnitudes capped at 127, not a clamp',
  },
  'components/editing/ribbon/useChapterSound.ts': { sites: 1, why: 'the larger of two magnitudes capped at full scale, not a clamp' },
  'components/layout/JumpMenu.tsx': { sites: 1, why: 'the remembered index can be -1 (ArrowDown on an empty list) and the outer `Math.min` must keep it' },
  'components/primitives/Table.tsx': { sites: 1, why: 'on no rows the high bound (-1) wins; `clamp` would give 0' },
  'components/script/bookmarks/ui/ribbonTops.ts': {
    sites: 1,
    why: 'a stored bookmark offset is not checked to be 0 or more, so the outer `Math.min` must win',
  },
  'components/primitives/NumberInput.tsx': { sites: 1, why: 'optional bounds (null is no bound) and high wins when they cross' },
  'components/settings/numberSetting.ts': { sites: 1, why: '`snapToStep`: optional bounds (null is no bound) and high wins when they cross' },
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

// What a function bound to a name starts with after its `=` or `:`: `(`, `<T>(`, `x =>`, `function`, optionally `async`.
const FUNCTION_VALUE = String.raw`(?:async\s+)?(?:\(|<|\w+\s*=>|function\b)`;
// `function clampX(`, `const clampX = (` (or `: Type =`), a property `clampX: (v) =>`, a method `clampX(v) {`: a definition, not a variable or a
// call that happens to be called `clamp`.
const NAMED_CLAMP = new RegExp(
  [
    String.raw`\bfunction\s*\*?\s+clamp\w*\s*[<(]`,
    String.raw`\b(?:const|let|var)\s+clamp\w*\s*(?::[^;=]*?(?:=>[^;=]*?)?)?=\s*${FUNCTION_VALUE}`,
    String.raw`(?:^|[{,])\s*clamp\w*\s*:\s*${FUNCTION_VALUE}`,
    String.raw`^\s*(?:(?:static|public|private|protected|async)\s+)*clamp\w*\s*\([^()]*\)\s*(?::[^{;]+)?\{`,
  ].join('|'),
  'm',
);

const PARAMS = String.raw`\(\s*(\w+)\s*(?::[^,()]*)?,\s*(\w+)\s*(?::[^,()]*)?,\s*(\w+)\s*(?::[^,()]*)?\)`;
// A three-parameter function under any name, up to the start of its body: an arrow (`= (a, b, c) =>` or `: (a, b, c) =>`), a declaration or a method.
const THREE_PARAM_HEAD = new RegExp(
  [
    String.raw`[=:]\s*(?:async\s+)?(?:<[^>]*>\s*)?${PARAMS}\s*(?::[^=;{]+?)?=>\s*(?:\{\s*return\s+)?`,
    String.raw`(?:\bfunction\b\s*\w*|^\s*\w+)\s*(?:<[^>]*>\s*)?${PARAMS}\s*(?::[^{;]+)?\{\s*return\s+`,
  ].join('|'),
  'gm',
);
const OPERAND = String.raw`\s*(\w+)\s*`;
// `Math.max(a, Math.min(b, c))`, with the inner call on either side and max and min either way round.
const MIN_MAX_NEST = new RegExp(
  String.raw`^Math\.(max|min)\((?:${OPERAND},\s*Math\.(max|min)\(${OPERAND},${OPERAND}\)|\s*Math\.(max|min)\(${OPERAND},${OPERAND}\)\s*,${OPERAND})\s*\)`,
);

/** Whether `body` (the text after a function's head) is a clamp of exactly the three `params`, each once. */
const isClampOf = (params: readonly string[], body: string): boolean => {
  const nest = MIN_MAX_NEST.exec(body);
  if (!nest) return false;
  const [, outer, a, innerA, b, c, innerB, d, e, f] = nest;
  if (outer === (innerA ?? innerB)) return false;
  const operands = (a !== undefined ? [a, b, c] : [d, e, f]).sort();
  return new Set(params).size === 3 && operands.join() === [...params].sort().join();
};

const definesUnnamedClamp = (text: string): boolean =>
  [...text.matchAll(THREE_PARAM_HEAD)].some((head) => {
    const params = head.slice(1, 4)[0] !== undefined ? head.slice(1, 4) : head.slice(4, 7);
    return isClampOf(params as string[], text.slice(head.index + head[0].length));
  });

const definesOwnClamp = (source: string): boolean => {
  const text = code(source);
  return NAMED_CLAMP.test(text) || definesUnnamedClamp(text);
};

/** The arguments of the call whose `(` is at `open`, split at its top-level commas, and the index of its `)`. */
const callArgs = (text: string, open: number): { args: string[]; close: number } | null => {
  const args: string[] = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1;
      // A multi-line call Prettier formats ends in a trailing comma, which adds no argument.
      if (depth === 0) return { args: [...args, text.slice(start, i)].filter((arg, at, all) => at < all.length - 1 || arg.trim() !== ''), close: i };
    } else if (c === ',' && depth === 1) {
      args.push(text.slice(start, i));
      start = i + 1;
    }
  }
  return null;
};

/** How many `Math.max(a, Math.min(b, c))` / `Math.min(a, Math.max(b, c))` a source writes, the inner call being a whole argument of the outer. */
const inlineClamps = (source: string): number => {
  const text = code(source);
  let count = 0;
  for (const call of text.matchAll(/\bMath\.(max|min)\(/g)) {
    const outer = callArgs(text, call.index + call[0].length - 1);
    if (outer?.args.length !== 2) continue;
    const other = call[1] === 'max' ? 'min' : 'max';
    const nested = outer.args.some((arg) => {
      const inner = arg.trim();
      if (!inner.startsWith(`Math.${other}(`)) return false;
      const args = callArgs(inner, `Math.${other}`.length);
      return args?.args.length === 2 && args.close === inner.length - 1;
    });
    if (nested) count += 1;
  }
  return count;
};

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
    'export function clampSpan(span: Span, bounds: Span) {}',
    'function clampWindow(window: TimeWindow, total: number) {}',
    'const clampValue = (v: number) => v',
    'function clampValue(v: number, lo: number, hi: number) { return v; }',
    'const helpers = { clamp: (v: number) => Math.min(1, Math.max(0, v)) };',
    'const helpers = { min: 0, clampLevel: function (v: number) { return v; } };',
    '  clamp(value: number): number {',
    'const bounded = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));',
    'const bounded = (v, lo, hi) => Math.min(Math.max(v, lo), hi);',
    'export const within = <T extends number>(lo: T, v: T, hi: T): number => { return Math.max(Math.min(hi, v), lo); };',
    'function keepIn(value: number, low: number, high: number): number {\n  return Math.min(high, Math.max(low, value));\n}',
    'const ops = { fit: (x: number, a: number, b: number) => Math.max(a, Math.min(b, x)) };',
  ])('sees %s', (source) => expect(definesOwnClamp(source)).toBe(true));
  it.each([
    "import { clamp } from './clamp';",
    'const x = clamp(at, 0, 1);',
    "const clamp = bodyRows()[0]!.querySelector('.line-clamp-2') as HTMLElement;",
    'const clamped = Math.max(0, Math.min(total, elapsed));',
    '// const clamp = (n) => n, the old copy',
    'const level = clamp(value, -100, 0);',
    'if (clampOn(x)) {',
    "const style = { clamp: 'line-clamp-2' };",
    'const top = (a: number, b: number, c: number) => Math.max(a, Math.max(b, c));',
    'const pct = (t: number, from: number, to: number) => Math.min(100, Math.max(0, ((t - from) / (to - from)) * 100));',
    'const pick = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, 0));',
  ])('leaves %s alone', (source) => expect(definesOwnClamp(source)).toBe(false));
});

describe('the inline scan itself', () => {
  it.each([
    'const x = Math.max(0, Math.min(1, v));',
    'const x = Math.min(hi, Math.max(lo, v));',
    'const x = Math.min(Math.max(at.x, r.x1), r.x2);',
    'const x = Math.max(Math.min(v, hi), lo);',
    'const atLeastOne = (p: number) => Math.min(99, Math.max(1, p));',
    'return rows[Math.max(0, Math.min(rows.length - 1, at + (down ? 1 : -1)))];',
    'el.style.left = `${Math.max(EDGE, Math.min(left - width / 2, room))}px`;',
    'const y = Math.max(\n  0,\n  Math.min(\n    total,\n    elapsed,\n  ),\n);',
  ])('sees %s', (source) => expect(inlineClamps(source)).toBe(1));
  it.each([
    'const spread = Math.max(...values) - Math.min(...values);',
    'const paragraph = Math.max(0, Math.min(...numbers) - 1);',
    'const x = Math.min(a, Math.min(b, c));',
    'const v = Math.min(127, Math.abs(Math.max(a, b)));',
    'const v = Math.max(a, Math.min(...rest));',
    '// const x = Math.max(0, Math.min(1, v));',
    'const x = clamp(v, 0, 1);',
  ])('leaves %s alone', (source) => expect(inlineClamps(source)).toBe(0));
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

describe('no clamp written inline', () => {
  const found = Object.fromEntries(
    [...sources(SRC)]
      .map((path) => relative(SRC, path).split(sep).join('/'))
      .filter((file) => file !== 'clamp.ts' && !/\.test\.tsx?$/.test(file))
      .map((file) => [file, inlineClamps(readFileSync(join(SRC, file), 'utf8'))] as const)
      .filter(([, sites]) => sites > 0),
  );

  it('has no inline clamp outside the list, and no more in a listed file than it keeps', () => {
    expect(Object.entries(found).filter(([file, sites]) => sites > (INLINE_KEPT[file]?.sites ?? 0))).toEqual([]);
  });

  it('lists only sites that are still there', () => {
    expect(Object.entries(INLINE_KEPT).filter(([file, kept]) => (found[file] ?? 0) < kept.sites)).toEqual([]);
  });
});
