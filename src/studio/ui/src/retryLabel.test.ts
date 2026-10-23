// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';

// A failed read or action offers one label, "Retry" (the load-error panels, a failed install or save, the Schedule). "Try again" was a second
// word for it on several pages and is gone; "Check again" stays only where it re-reads a live DAW or host status ("last heard N s ago") or runs
// a recording check once more (`definition-of-done.md`, "Talking to an integration"). This scan fails when "Try again" comes back as the text of
// a control: a line that is only those words (button text in JSX) or a string that is only those words (a label, an accessible name).
// Prose that tells the narrator to try again ("Try again after clicking in the page") is a sentence and does not match.

const SRC = join(import.meta.dirname, 'components');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|stories)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('one label for retrying a failed read or action', () => {
  test('no control is labelled "Try again"', () => {
    const offenders = sources(SRC).flatMap((file) => {
      const lines = readFileSync(file, 'utf8').split('\n');
      return lines.flatMap((line, index) =>
        /^\s*Try again\s*$/.test(line) || /(['"`])Try again\1/.test(line)
          ? [
              `${relative(join(SRC, '..', '..'), file)
                .split(sep)
                .join('/')}:${index + 1}`,
            ]
          : [],
      );
    });
    expect(offenders, 'use "Retry" for a failed read or action').toEqual([]);
  });
});
