import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #3869: "there is audio on the track" has ONE threshold, `hasAudio` in recordedThrough.ts (one whole second or more). A page that tests a recorded length against 0 itself brings
// back two thresholds, and a take under a second reads 0% on one page and "<0h 01m" or 1% on another. No file under components may compare `recordedSeconds` or `measuredSeconds`
// with 0 or 1 outside this list; each entry says why it is not a "has audio" test.
const ALLOWED: Record<string, string> = {};

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });

describe('one threshold for audio on the track', () => {
  it('compares no recorded length with 0 or 1 outside recordedThrough.ts', () => {
    const offenders: string[] = [];
    for (const path of files(join(__dirname, 'components'))) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (/(recordedSeconds|measuredSeconds)\b[^;]*?(<=?|>=?|===?|!==?)\s*[01]\b/.test(line) && !(path in ALLOWED))
            offenders.push(`${path.slice(__dirname.length + 1)}:${index + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
