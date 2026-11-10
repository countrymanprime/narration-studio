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
  'components/recordingcheck/CheckResult.tsx',
  'components/editing/page/useChapterSource.ts',
  'components/editing/EditingCheckPanel.tsx',
  'components/engine/useDawToolsSource.ts',
  'components/engine/useLiveTracks.ts',
  'components/engine/EnginePanel.tsx',
  'components/production/ChapterTrackPanel.tsx',
  'components/production/useChapterTools.tsx',
  'components/proof/useChapterTimeline.ts',
  'components/pickups/list/usePlayOriginal.ts',
]);

const READ = /\.(tracksLive|tracksList|chapterTrackLinks)\(/;
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
