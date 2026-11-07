import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #2826: "Show in {DAW}" is one component over one source. The three host calls that put the DAW's cursor or selection on a place, `workspaceGoTo`,
 * `findingsGoTo` and `trackSelectInReaper`, are made by `ShowInDaw.tsx` and nowhere else in the pages, so a second button, a second label or a second
 * copy of the call's wording cannot appear. The API layer (the clients, mocks and contracts) and tests define or fake the calls; they are not callers.
 */
const SRC = join(__dirname, '..', '..');
const CALLS = /\b(?:workspaceGoTo|findingsGoTo|trackSelectInReaper)\s*\(/;
const OWNER = ['components', 'engine', 'ShowInDaw.tsx'].join(sep);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'api' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories|spec)\./.test(name) ? [path] : [];
  });
}

describe('one Show in {DAW} (#2826)', () => {
  it('only ShowInDaw.tsx calls workspaceGoTo, findingsGoTo and trackSelectInReaper', () => {
    const callers = sources(SRC)
      .filter((file) => CALLS.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(callers).toEqual([OWNER]);
  });

  it('no page words its own Show in / Go to {DAW} label', () => {
    const own = sources(join(SRC, 'components'))
      .filter((file) => !file.endsWith('ShowInDaw.tsx'))
      .filter((file) =>
        /label[=:]\s*[`'"](?:Show in the DAW|Show in REAPER|Go to (?:the DAW|REAPER|this chapter in)|Select in REAPER)/.test(readFileSync(file, 'utf8')),
      )
      .map((file) => relative(SRC, file));
    expect(own).toEqual([]);
  });

  it('only ShowInDaw.tsx draws the show-in-the-DAW icon, whatever it is labelled', () => {
    const own = sources(join(SRC, 'components'))
      .filter((file) => !file.endsWith('ShowInDaw.tsx'))
      .filter((file) => /action=["{']+showInReaper/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(own).toEqual([]);
  });
});
