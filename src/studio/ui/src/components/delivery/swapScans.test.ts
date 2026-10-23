import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEUTRAL_PROFILE, PLATFORM_PROFILES } from '../schedule/profiles';

// The PRD's metrics for the swapped pages (SN-M5): a feature gated on a platform asks `platformHas`, so no component of Settings,
// Master & QC or Delivery names a profile id; and Settings writes no capability row by hand (the capability section draws them).
const components = join(__dirname, '..');
const sourcesUnder = (folder: string): string[] =>
  readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return sourcesUnder(path);
    return /\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) && !/fixtures?\.ts$/.test(name) && !/^test[A-Z]/.test(name) ? [path] : [];
  });
const swapped = ['settings', 'master', 'masterqc', 'delivery'].flatMap((folder) => sourcesUnder(join(components, folder)));

describe('the swapped pages (SN-M5)', () => {
  it('profile-gated-features-all-use-platformHas: no component names a profile id', () => {
    const named = new RegExp(`['"\`](${PLATFORM_PROFILES.map((profile) => profile.id).join('|')})['"\`]`);
    const offending = swapped.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        // `none` is a word of its own too, so it counts only on a line that is about a profile.
        .filter((line) => (line.match(named)?.[1] === NEUTRAL_PROFILE ? /profile/i.test(line) : named.test(line)))
        .map((line) => `${relative(components, file)}: ${line.trim()}`),
    );
    expect(offending).toEqual([]);
  });

  // BackupsSection is a section registered into the DAW category that shows itself only for a DAW with the backups capability
  // (it asks for that one capability on purpose); it draws no capability row.
  const GATED_SECTIONS = new Set(['settings/BackupsSection.tsx']);
  it('no-hand-written-capability-row: no Settings file reads one capability by name', () => {
    const offending = swapped
      .filter((file) => relative(components, file).startsWith('settings') && !GATED_SECTIONS.has(relative(components, file)))
      .filter((file) => /capabilities\.[a-z]\w*|capabilities\[['"`]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(components, file));
    expect(offending).toEqual([]);
  });
});
