// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard for issue 3277 (reuse): a DAW track with a blank name is named in `components/tracks/trackName.ts` and nowhere else, so one track reads
// the same on every page ("Track 3", or "Unnamed track" when only the name is known). A page does not write its own fallback.
// `api/` and `fixtures/` (host stand-ins and fixture builders that invent track names) are not UI wording and are not scanned.
const SRC = join(__dirname);
const OWN = 'components/tracks/trackName.ts';

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name)) yield path;
  }
}

const UNNAMED = /['"`]Unnamed track['"`]/;
const TRACK_N = /`Track \$\{[^}]*\+\s*1\s*\}`|['"]Track ['"]\s*\+\s*\(?[^)]*\+\s*1/;
const ownFallbackIn = (text: string): string[] => [
  ...(UNNAMED.test(text) ? ['writes "Unnamed track"'] : []),
  ...(TRACK_N.test(text) ? ['writes its own "Track N" fallback'] : []),
];

describe('the scan itself', () => {
  it.each([
    "track.name || 'Unnamed track'",
    'name.trim() || "Unnamed track"',
    'track.name || `Track ${track.index + 1}`',
    "label: 'Track ' + (index + 1)",
    'x.name || `Track ${i + 1}`',
  ])('sees %s', (code) => expect(ownFallbackIn(code).length).toBeGreaterThan(0));
  it.each(['trackName(track.name, track.index)', "const title = 'Track: Chapter 1'", 'Track ${n} of the take list'.replace('$', '')])(
    'leaves %s alone',
    (code) => expect(ownFallbackIn(code)).toEqual([]),
  );
});

describe('one name for a blank track', () => {
  const files = [...sources(SRC)]
    .map((path) => relative(SRC, path).split(sep).join('/'))
    .filter((file) => file !== OWN && !file.startsWith('api/') && !file.startsWith('fixtures/'));
  it('has no file writing its own', () => {
    const found = files.flatMap((file) => ownFallbackIn(readFileSync(join(SRC, file), 'utf8')).map((what) => `${file} ${what}`));
    expect(found).toEqual([]);
  });
});
