// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard for issue 3277 (reuse): a number of seconds becomes a clock reading in `clock.ts` and nowhere else, so two screens that show the
// same length show the same text. A file that does the minutes-and-seconds arithmetic (`% 60`, or `% 600` and `% 6000` for tenths and hundredths) and pads the digits (`padStart`, or `< 10 ? '0'`) is writing its own
// clock; it fails here unless it is listed below with what it formats instead. An entry whose file no longer matches fails too, so the list only shrinks.
const ALLOWED: Readonly<Record<string, string>> = {
  'clock.ts': 'the one clock',
  'components/production/productionFormat.ts': 'hours as h:mm (the stage timer figures), not seconds',
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
