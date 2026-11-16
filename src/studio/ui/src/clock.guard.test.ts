// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard for issue 3277 (reuse): a number of seconds becomes a clock reading in `clock.ts` and nowhere else, so two screens that show the
// same length show the same text. A file that does the minutes-and-seconds arithmetic (`% 60`, or `% 600` and `% 6000` for tenths and hundredths) and pads the digits (`padStart`, or `< 10 ? '0'`) is writing its own
// clock; it fails here unless it is listed below with what it formats instead. An entry whose file no longer matches fails too, so the list only shrinks.
const ALLOWED: Readonly<Record<string, string>> = {
  'clock.ts': 'the one clock',
  'components/schedule/dates.ts': 'calendar dates and hours as h:mm (the schedule), not seconds',
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
// (a length, an estimate, an elapsed time), and a file that still has a duration call is on the list below with what it measures; a stale entry fails, so the list only shrinks.
const FINE = /^components\/(editing|proof)\//;
const DURATIONS: Readonly<Record<string, string>> = {
  'components/editing/backups/BackupsInspector.tsx': "the chapter's whole length beside a backup's span",
  'components/editing/bar/SelectionBar.tsx': "the chapter's length after the transport position",
  'components/editing/takes/TakeLines.tsx': "a take's source length",
  'components/editing/range/replace/ReplaceDialog.tsx': 'the length of their file',
  'components/proof/PreviewPanel.tsx': 'an estimated length of a preview',
  'components/proof/CompareRun.tsx': 'the elapsed time of a comparison',
  'components/proof/checkcard/cardSelectors.ts': "the recorded length and the script's estimate",
  'components/proof/deliveryFindingFormat.ts': "a file's duration in a delivery finding",
};
/** The `clock(...)` calls of a source text, each with its balanced argument list. */
function clockCalls(text: string): string[] {
  const calls: string[] = [];
  for (let at = text.indexOf('clock('); at >= 0; at = text.indexOf('clock(', at + 1)) {
    if (/[\w.]/.test(text[at - 1] ?? '')) continue;
    let depth = 0;
    let end = at + 'clock'.length;
    for (; end < text.length; end += 1) {
      if (text[end] === '(') depth += 1;
      if (text[end] === ')' && (depth -= 1) === 0) break;
    }
    calls.push(text.slice(at, end + 1));
  }
  return calls;
}
const files = [...sources(SRC)].map((path) => relative(SRC, path).split(sep).join('/'));
const text = (file: string) => readFileSync(join(SRC, file), 'utf8');

describe('the full form is only for Editing and Proof, and every position there uses it', () => {
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
  const durations = files.filter((file) => FINE.test(file) && clockCalls(text(file)).some((call) => !/\bfull:\s*true\b/.test(call)));
  it('has no duration call on Editing or Proof outside the list', () => {
    expect(durations.filter((file) => !(file in DURATIONS))).toEqual([]);
  });
  it('lists only files that still have a duration call', () => {
    expect(Object.keys(DURATIONS).filter((file) => !durations.includes(file))).toEqual([]);
  });
  // The full-form helper `noteTime` (a position as Editing and Proof write it) is imported outside those folders only where the position is theirs: the marker's place and the Show-in-DAW result.
  const IMPORTS: Readonly<Record<string, string>> = {
    'components/engine/AddMarkers.tsx': 'the place of a marker already on a note: a position, shown on Editing and Proof',
    'components/engine/ShowInDaw.tsx': 'where Show in REAPER moved to: a position on Editing and Proof',
  };
  const importing = files.filter((file) => !FINE.test(file) && /\bnoteTime\b/.test(text(file)) && file !== 'components/proof/findingFormat.ts');
  it('has no import of the full-form helper from outside Editing and Proof except the listed ones', () => {
    expect(importing.filter((file) => !(file in IMPORTS))).toEqual([]);
    expect(Object.keys(IMPORTS).filter((file) => !importing.includes(file))).toEqual([]);
  });
});
