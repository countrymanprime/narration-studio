import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #2830: Add marker is one component over one source. `daw.addMarker` and `daw.addPickupMarkers` are called by `AddMarkers.tsx` and nowhere else in the
 * pages, only it draws the `addMarker` icon, and no page words its own "Add marker in" label, so a second button, label or copy of the sentences
 * cannot appear. The DAW port, the API layer and tests define and fake the calls; they are not callers.
 */
const SRC = join(__dirname, '..', '..');
const OWNER = ['components', 'engine', 'AddMarkers.tsx'].join(sep);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'api' || name === 'ports' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories|spec)\./.test(name) ? [path] : [];
  });
}
const matching = (pattern: RegExp, except = OWNER): string[] =>
  sources(SRC)
    .map((file) => relative(SRC, file))
    .filter((file) => file !== except && pattern.test(readFileSync(join(SRC, file), 'utf8')));

describe('one Add marker (#2830)', () => {
  it('only AddMarkers.tsx calls daw.addMarker and daw.addPickupMarkers', () => {
    expect(matching(/\.(?:addMarker|addPickupMarkers)\s*\(/)).toEqual([]);
  });

  it('only AddMarkers.tsx draws the add-marker icon, whatever it is labelled', () => {
    expect(matching(/action=["{']+addMarker/)).toEqual([]);
  });

  it('no page words its own Add marker label', () => {
    expect(matching(/label[=:]\s*[`'"]Add (?:marker|\$\{[^}]*\} as markers)/)).toEqual([]);
  });
});
