import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A screen changes a chapter's link only through `useChapterLinkActions` (#3365): one binding for set (the replacing `chapterTrackSet`),
 * one for unlink and one for create, and one sentence for the chapter that lost its track. Before, six callers did it on two bindings and
 * only two said who lost the track. The upserting `chapterTrackMapConfirm` is not called by a screen at all.
 */
const WRITE = /\.(chapterTrackSet|chapterTrackMapConfirm|chapterTrackUnlink|chapterTrackCreate)\(/;
const OWNER = 'components/chapterTracks/useChapterLinkActions.ts';
const root = join(__dirname, '..', '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The component files that call a link-writing binding, relative to `src`. */
export function linkWriters(files: Array<{ path: string; text: string }>): string[] {
  return files
    .filter((f) => WRITE.test(f.text))
    .map((f) => f.path)
    .sort();
}

describe('the chapter-link writers', () => {
  it('only the actions hook calls a link-writing binding', () => {
    const files = sources(join(root, 'components')).map((path) => ({ path: relative(root, path).split('\\').join('/'), text: readFileSync(path, 'utf8') }));
    expect(linkWriters(files)).toEqual([OWNER]);
  });
  it('sees each binding it guards', () => {
    for (const call of ['chapterTrackSet', 'chapterTrackMapConfirm', 'chapterTrackUnlink', 'chapterTrackCreate'])
      expect(linkWriters([{ path: 'x.tsx', text: `await api.${call}(a, b);` }])).toEqual(['x.tsx']);
    expect(linkWriters([{ path: 'x.tsx', text: 'actions.set(a, b)' }])).toEqual([]);
  });
});
