import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A screen changes a chapter's link only through `useChapterLinkActions` (#3365): one binding for set (the replacing `chapterTrackSet`),
 * one for unlink and one for create, and one sentence for the chapter that lost its track. Before, six callers did it on two bindings and
 * only two said who lost the track. The upserting `chapterTrackMapConfirm` is gone from the host (#3396).
 */
const WRITE = /\.(chapterTrackSet|chapterTrackUnlink|chapterTrackCreate)\(/;
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
  // One sentence for a failed link write, raised as a toast (#3365): a screen that wrote its own "could not be made" line would say it differently.
  it('only linkFailure.ts words a failed link write', () => {
    const files = sources(join(root, 'components')).map((path) => ({ path: relative(root, path).split('\\').join('/'), text: readFileSync(path, 'utf8') }));
    const own = files
      .filter(
        (f) => /useChapterLinkActions/.test(f.text) && /`The link could not be|The link could not be (made|removed): |\bcould not be added: /.test(f.text),
      )
      .map((f) => f.path);
    expect(own).toEqual([]);
  });
  // A caller of the actions hook that catches a failed write must word it through linkFailureSentence (#3365), not describeApiError or its own string.
  it('every screen that writes a link words its failure with linkFailureSentence', () => {
    const files = sources(join(root, 'components')).map((path) => ({ path: relative(root, path).split('\\').join('/'), text: readFileSync(path, 'utf8') }));
    const writers = files.filter((f) => /\bactions\.(set|unlink|create)\(/.test(f.text) && f.path !== OWNER).map((f) => f.path);
    expect(writers.length).toBeGreaterThan(3);
    for (const path of writers) expect(files.find((f) => f.path === path)?.text, path).toContain('linkFailureSentence');
  });
  it('sees each binding it guards', () => {
    for (const call of ['chapterTrackSet', 'chapterTrackUnlink', 'chapterTrackCreate'])
      expect(linkWriters([{ path: 'x.tsx', text: `await api.${call}(a, b);` }])).toEqual(['x.tsx']);
    expect(linkWriters([{ path: 'x.tsx', text: 'actions.set(a, b)' }])).toEqual([]);
  });
});
