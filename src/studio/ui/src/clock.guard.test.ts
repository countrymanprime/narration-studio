// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard for issue 3277 (reuse): a number of seconds becomes a clock reading in `clock.ts` and nowhere else, so two screens that show the
// same length show the same text. A file that does the minutes-and-seconds arithmetic (`% 60`, or `% 600` and `% 6000` for tenths and hundredths) and pads the digits (`padStart`, or `< 10 ? '0'`) is writing its own
// clock; it fails here unless it is listed below with what it formats instead. An entry whose file no longer matches fails too, so the list only shrinks.
const ALLOWED: Readonly<Record<string, string>> = {
  'clock.ts': 'the one clock',
  'components/schedule/dates.ts':
    'calendar dates ("2026-11-16", zero-padded) and agoText\'s count of minutes and hours since a reading, "3 min ago": words about the age of a reading, not a clock; its hours figure `hm` only delegates to `clock`',
  'state.ts':
    'a retail sample length written "2m 05s" (Settings, Manuscript retail range), the same text and rounding as the host\'s refusal message; move it to clock.ts with that message',
};

const SRC = join(__dirname);
function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name)) yield path;
  }
}

// Minutes-and-seconds arithmetic (a modulo, a minutes product taken off, or a division by 60) together with digit padding, or an ISO-string slice.
const ARITHMETIC = /%\s*(?:\(?60\)?|600|6000|0x3c|SECONDS_PER_MINUTE)\b|-\s*\w+\s*\*\s*60\b|\/\s*60\)/;
const PADDING = /\.padStart\(|\.padEnd\(|\?\s*['"`]0['"`]\s*:|['"]0['"]\s*\+|\.slice\(-2\)|minimumIntegerDigits/;
const writesItsOwnClock = (text: string): boolean => (ARITHMETIC.test(text) && PADDING.test(text)) || /toISOString\(\)\.slice\(1[1-9]/.test(text);

describe('the scan itself', () => {
  it.each([
    "String(s % 60).padStart(2, '0')",
    's % 60 < 10 ? "0" : ""',
    's % 60 < 10 ? `0` : ""',
    "const r = s - m * 60; r < 10 ? '0' + r : r",
    "('0' + (s % 60)).slice(-2)",
    'Math.floor(s / 60) + n.toLocaleString("en", { minimumIntegerDigits: 2 })',
    "x % SECONDS_PER_MINUTE; String(x).padStart(2, '0')",
    'new Date(s * 1000).toISOString().slice(14, 19)',
  ])('sees %s', (code) => expect(writesItsOwnClock(code)).toBe(true));
  it.each(['const label = `${count} words`', "String(n).padStart(4, '0')", 'const minutes = Math.round(seconds)'])('leaves %s alone', (code) =>
    expect(writesItsOwnClock(code)).toBe(false),
  );
});

describe('one clock for every duration', () => {
  const found = [...sources(SRC)]
    .map((path) => relative(SRC, path).split(sep).join('/'))
    .filter((file) => !file.startsWith('api/mock') && writesItsOwnClock(readFileSync(join(SRC, file), 'utf8')));

  it('has no file writing its own minutes:seconds outside the list', () => {
    expect(found.filter((file) => !(file in ALLOWED))).toEqual([]);
  });

  it('lists only files that still need their entry', () => {
    expect(Object.keys(ALLOWED).filter((file) => !found.includes(file))).toEqual([]);
  });
});

// #3443 (owner, 2026-11-16): every POSITION (a point or range in the recording) on Editing and Proof is written in the full hh:mm:ss.fff form, and no other screen uses
// it, so the same cursor or selection never reads two ways on one screen. A `clock(` call under components/editing or components/proof is either `full: true` or a duration
// (a length, an estimate, an elapsed time), and each such CALL is on the list below, by its text, with what it measures: a new floored clock(position) in a file that
// already has a duration is a new call and fails here. A stale entry fails, so the list only shrinks. `clockTenths` (a fine reading with tenths) is not used there at all.
const FINE = /^components\/(editing|proof)\//;
const DURATIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'components/editing/backups/BackupsInspector.tsx': { 'clock(total)': "the chapter's whole length beside a backup's span" },
  'components/editing/bar/SelectionBar.tsx': { 'clock(end)': "the chapter's length after the transport position" },
  'components/editing/takes/TakeLines.tsx': { 'clock(take.sourceLength)': "a take's source length" },
  'components/editing/range/replace/ReplaceDialog.tsx': {
    'clock(f.length)': 'the length of their file',
    'clock(length)': "the length of their file, in the waveform's name",
  },
  'components/proof/PreviewPanel.tsx': {
    'clock(candidate.estimatedSeconds) x2': 'an estimated length of a preview',
    'clock(pinned.candidate.estimatedSeconds)': 'the same estimate, pinned',
  },
  'components/proof/CompareRun.tsx': { 'clock(state.elapsed) x2': 'the elapsed time of a comparison' },
  'components/proof/checkcard/cardSelectors.ts': {
    'clock(seconds)': 'the recorded length',
    'clock(Math.round((wordCount / WPH) * 3600))': "the script's estimate",
  },
  'components/proof/deliveryFindingFormat.ts': { 'clock(value)': "a file's duration in a delivery finding" },
};
/** A source text without its comments (they say "the clock (x)" in prose). */
const code = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
/** The `clock(...)` calls of a source text, each with its balanced argument list (`clock (x)` with a space too). */
function clockCalls(text: string): string[] {
  const calls: string[] = [];
  text = code(text);
  for (const match of text.matchAll(/(?<![\w$.])clock\s*\(/g)) {
    const at = match.index;
    let depth = 0;
    let end = at + match[0].length - 1;
    for (; end < text.length; end += 1) {
      if (text[end] === '(') depth += 1;
      if (text[end] === ')' && (depth -= 1) === 0) break;
    }
    calls.push(text.slice(at, end + 1));
  }
  return calls;
}
/** `clock` used as a value (`.map(clock)`, `[clock][0](x)`, `when={clock}`, `= clock`), outside its import and comments: a call this scan cannot see. */
const bareClock = (text: string): string[] =>
  [
    ...text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/^import[^;]*;$/gm, '')
      .matchAll(/[([{=,:?]\s*clock\s*(?=[)\]},;])/g),
  ].map((m) => m[0]);
/** The import clauses of `clock.ts` in a source text: `{ clock }`, `{ clock as c }`, `* as ck`, with or without the `.ts` suffix. */
const clockImports = (source: string): string[] =>
  [...source.matchAll(/import\s+(?:type\s+)?([^;]*?)\s*from\s*['"][./]*\/clock(?:\.[jt]sx?)?['"]/g)].map((m) => m[1]);
const importsClock = (source: string): boolean => clockImports(source).some((clause) => /\bclock\b/.test(clause) || /\*\s*as\b/.test(clause));
/** An import that renames `clock` or takes the whole module, so a call or a reference to it is no longer written `clock(`. */
const aliasesClock = (source: string): boolean => clockImports(source).some((clause) => /\bclock\s+as\b/.test(clause) || /\*\s*as\b/.test(clause));
/** A `<ShowInDawButton ... />` that passes no `when`, or passes `when={undefined}`. */
const lacksWhen = (markup: string): boolean => !/\bwhen=/.test(markup) || /\bwhen=\{\s*undefined\s*\}/.test(markup);
const files = [...sources(SRC)].map((path) => relative(SRC, path).split(sep).join('/'));
const text = (file: string) => readFileSync(join(SRC, file), 'utf8');

describe('the full form is only for Editing and Proof, and every position there uses it', () => {
  it('sees a bare clock reference (its own check)', () => {
    for (const code of ['xs.map(clock)', 'const f = clock;', '[clock][0](x)', '<B when={clock} />', 'fn(a, clock)'])
      expect(bareClock(code), code).not.toEqual([]);
    for (const code of ["import { clock } from '../clock';", '// the clock', 'clock(x)', "const label = 'the clock'", 'clockTenths(x)'])
      expect(bareClock(code), code).toEqual([]);
    expect(clockCalls('clock (x) + [clock][0](y)')).toEqual(['clock (x)']);
  });
  it('is used as a bare value by no file on Editing or Proof: every use there is a call the lists above can see', () => {
    // (A file that does not import the formatter and has a variable of its own called `clock` is not about it.)
    expect(files.filter((file) => FINE.test(file) && importsClock(text(file)) && bareClock(text(file)).length > 0)).toEqual([]);
  });
  it('sees an import that hides the formatter behind another name (its own check)', () => {
    for (const code of ["import { clock as c } from '../clock';", "import * as ck from '../../clock';", "import { clock as c } from '../clock.ts';"])
      expect(aliasesClock(code), code).toBe(true);
    for (const code of ["import { clock } from '../clock';", "import { clock, clockTenths } from '../../clock.ts';", "import { x as y } from '../other';"])
      expect(aliasesClock(code), code).toBe(false);
    expect(importsClock("import { clock } from '../clock.ts';")).toBe(true);
    expect(importsClock("import { plural } from '../plural';")).toBe(false);
  });
  it('imports the formatter by its own name on Editing and Proof, never under another name or as a namespace', () => {
    expect(files.filter((file) => FINE.test(file) && aliasesClock(text(file)))).toEqual([]);
  });
  it('gives every Show in {DAW} button on Editing and Proof its position formatter (`when`), so the shared component never falls back to the plain clock there', () => {
    const missing: string[] = [];
    for (const file of files.filter((f) => FINE.test(f))) {
      for (const match of text(file).matchAll(/<ShowInDawButton\b[\s\S]*?\/>/g)) if (lacksWhen(match[0])) missing.push(file);
    }
    expect(missing).toEqual([]);
    expect(files.some((f) => FINE.test(f) && /<ShowInDawButton\b/.test(text(f)))).toBe(true);
  });
  it('sees a Show in {DAW} button without a formatter (its own check)', () => {
    expect(lacksWhen('<ShowInDawButton target={t} />')).toBe(true);
    expect(lacksWhen('<ShowInDawButton target={t} when={undefined} />')).toBe(true);
    expect(lacksWhen('<ShowInDawButton target={t} when={noteTime} />')).toBe(false);
  });
  it('scans clock calls (its own check)', () => {
    expect(clockCalls('a(clock(x, { full: true }), clock(y))')).toEqual(['clock(x, { full: true })', 'clock(y)']);
    expect(clockCalls('noclock(x) + this.clock(y)')).toEqual([]);
  });
  it('is asked for by no file outside components/editing and components/proof', () => {
    const asking = files.filter((file) => file !== 'clock.ts' && clockCalls(text(file)).some((call) => /\bfull:\s*true\b/.test(call)));
    expect(asking.filter((file) => !FINE.test(file))).toEqual([]);
    expect(asking.some((file) => file.startsWith('components/editing/'))).toBe(true);
    expect(asking.some((file) => file.startsWith('components/proof/'))).toBe(true);
  });
  // #3590 (owner, 2026-11-22): a Pickups time is hh:mm:ss to the nearest second, and nowhere else is. `pickupTime` in pickupRows.ts is the one Pickups time, so it is the one file that asks.
  it('hh:mm:ss (hms) is asked for by pickupRows.ts and no other file', () => {
    expect(files.filter((file) => file !== 'clock.ts' && clockCalls(text(file)).some((call) => /\bhms:\s*true\b/.test(call)))).toEqual([
      'components/pickups/list/pickupRows.ts',
    ]);
  });
  // The duration calls of a file: each call's text (whitespace collapsed), "x2" when it appears twice.
  const durationCalls = (source: string): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const call of clockCalls(source)) if (!/\bfull:\s*true\b/.test(call)) counts[call.replace(/\s+/g, ' ')] = (counts[call.replace(/\s+/g, ' ')] ?? 0) + 1;
    return counts;
  };
  const named = (counts: Record<string, number>): string[] =>
    Object.entries(counts)
      .map(([call, n]) => (n > 1 ? `${call} x${n}` : call))
      .sort();
  const actual: Record<string, string[]> = {};
  for (const file of files)
    if (FINE.test(file)) {
      const calls = named(durationCalls(text(file)));
      if (calls.length > 0) actual[file] = calls;
    }
  it('counts duration calls by their text (its own check)', () => {
    expect(named(durationCalls('a(clock(x), clock(x), clock(y, { full: true }), clock(\n  z,\n))'))).toEqual(
      ['clock( z, ) x1'.replace(' x1', ''), 'clock(x) x2'].sort(),
    );
  });
  it('has no duration call on Editing or Proof outside the list, in a listed file or any other', () => {
    const listed = Object.fromEntries(Object.entries(DURATIONS).map(([file, calls]) => [file, Object.keys(calls).sort()]));
    expect(actual).toEqual(listed);
  });
  it('uses no clockTenths on Editing or Proof: a position there is `full`', () => {
    expect(files.filter((file) => FINE.test(file) && /\bclockTenths\(/.test(text(file)))).toEqual([]);
  });
  // The full-form helper `noteTime` (a position as Editing and Proof write it) is imported by no file outside those folders: a shared component takes its
  // position formatter from the caller (`ShowInDawButton`'s `when`, `AddMarkersTarget.at`), so Pickups and Production keep their own text.
  const importing = files.filter((file) => !FINE.test(file) && /\bnoteTime\b/.test(text(file)) && file !== 'components/proof/findingFormat.ts');
  it('has no import of the full-form helper from outside Editing and Proof', () => {
    expect(importing).toEqual([]);
  });
});
