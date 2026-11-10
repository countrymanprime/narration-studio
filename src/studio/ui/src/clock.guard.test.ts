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
  'state.ts': 'a retail sample length written "2m 05s" for the host-refusal wording; move it to clock.ts when that wording changes',
};

const SRC = join(__dirname);
function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name)) yield path;
  }
}

const writesItsOwnClock = (text: string): boolean => /%\s*(?:60|600|6000)\b/.test(text) && /\.padStart\(|\?\s*'0'\s*:/.test(text);

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
