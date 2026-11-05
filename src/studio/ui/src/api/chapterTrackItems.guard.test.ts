import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// #3041: a chapter linked to a folder of voices has its audio on the folder's children, so a page that reads `.items` off the linked track itself
// sees an empty folder and says the chapter has no audio. Every page turns a link into items through `chapterTrackOf` (src/api/chapterTrackItems.ts).

const ROOT = join(__dirname, '..');
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });

// `tracks.find((t) => t.guid === guid)?.items` and `const track = project.tracks.find(...); ... track.items`.
const FIND_THEN_ITEMS = /\.find\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.guid\s*===\s*[^)]*\)\)?\s*\??\.items/;
const FIND_BOUND = /(?:const|let)\s+(\w+)\s*=[^;]*?tracks\.find\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.guid\s*===/g;

// Reads that mean the linked track's own items, with the reason.
const ONE_TRACK = new Map([
  [
    join('components', 'engine', 'LinkChaptersDialog.tsx'),
    "the Link chapters dialog's 'To stamp' count is of the linked track's own items; the stamp is a separate feature and not changed here",
  ],
]);

describe('no page reads the audio of a linked track off the track alone', () => {
  const files = sources(ROOT).filter((file) => !file.endsWith('chapterTrackItems.ts') && !ONE_TRACK.has(relative(ROOT, file)));

  it('scans the UI sources', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('no `tracks.find(by guid)?.items` anywhere: use chapterTrackOf', () => {
    const hits = files.filter((file) => FIND_THEN_ITEMS.test(readFileSync(file, 'utf8'))).map((file) => relative(ROOT, file));
    expect(hits, 'read the items through chapterTrackOf(project.tracks, guid) so a folder of voices is read through its children').toEqual([]);
  });

  it('no track found by guid then read for `.items` in the same file', () => {
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(FIND_BOUND)) {
        if (new RegExp(`\\b${match[1]}\\??\\.items\\b`).test(text.slice(match.index))) hits.push(relative(ROOT, file));
      }
    }
    expect(hits, 'read the items through chapterTrackOf(project.tracks, guid)').toEqual([]);
  });

  it('the guard itself catches the shape it bans', () => {
    expect(FIND_THEN_ITEMS.test('project.tracks.find((track) => track.guid === trackGuid)?.items ?? []')).toBe(true);
    expect(FIND_THEN_ITEMS.test('chapterTrackOf(project.tracks, trackGuid)?.items ?? []')).toBe(false);
  });
});
