import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every component file that reads the project's tracks or the chapter links straight from a port (`tracksLive`, `tracksList`,
 * `chapterTrackLinks`) instead of the one chapter-track state (#3269: "those should all be a synchronized thing"). Each reads on its own
 * schedule with its own error handling, so two screens can show different tracks for the same chapter. This list only shrinks: a file
 * moves onto `useChapterTrackState` and leaves it; a new file must not be added, it reads the state instead.
 */
const DIRECT_READERS = new Set([
  // Drawn by the overlay host, outside the track state's provider, so it reads its own (tracked in #3350 with the Link chapters dialog).
  'components/recordingcheck/CheckResult.tsx',
  'components/editing/page/useChapterSource.ts',
  'components/editing/EditingCheckPanel.tsx',
  // The state's own reader of the live track list (the Engine panel no longer has a second instance).
  'components/engine/useLiveTracks.ts',
  'components/engine/EnginePanel.tsx',
  // The Production board's per-chapter link read (status, suggestions, warnings): not the mapping list the state holds, so it stays until the state carries those.
  'components/production/useChapterTools.tsx',
  'components/proof/useChapterTimeline.ts',
  'components/pickups/list/usePlayOriginal.ts',
  // Reads the links together with the chapter's match as one snapshot (the dialog's check: its match and its links must be one moment); moving it onto the state is tracked in #3350.
  'components/connection/ChapterLinkDialog.tsx',
  'components/proof/ProofChapterPage.tsx',
  // The state itself: the one reader every screen above is meant to move onto.
  'components/chapterTracks/ChapterTrackState.tsx',
]);

const READ = /\.(tracksLive|tracksList|chapterTrackLinks|chapterTrackMapList)\(|\buseLiveTracks\(/;
const root = join(__dirname, '..', '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('direct track readers', () => {
  const readers = sources(join(root, 'components'))
    .filter((path) => READ.test(readFileSync(path, 'utf8')))
    .map((path) => relative(root, path).split('\\').join('/'));

  it('are only the listed files', () => {
    expect(readers.filter((path) => !DIRECT_READERS.has(path))).toEqual([]);
  });

  it('are all still readers, so the list shrinks as files move onto the state', () => {
    expect([...DIRECT_READERS].filter((path) => !readers.includes(path))).toEqual([]);
  });
});
