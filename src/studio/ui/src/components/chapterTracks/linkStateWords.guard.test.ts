import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The words for a chapter's link state ("Not linked", "Track missing", and the retired "Track gone", "No track yet") are written once, in
 * `chapterTracks/chapterLink.ts` (`LINK_STATE_LABEL`, read only through `linkStateLabel(state, folders)`, which names a folder where the project
 * has Voice folders), so one state never reads two ways on a page (#3368: Production's panel said "Not linked"
 * where its board said "No track"). A component that needs a label imports it. The files listed here are the DAW project file's own states, a
 * different thing from a chapter's link; the list may not grow.
 */
const OWN_WORDS = new Set(['kinds/statusTone.ts', 'components/layout/EngineChip.tsx']);
const WORDS = /(['"`])(Not linked|Track missing|Track gone|No track yet|Several tracks|Several folders|Folder missing)\1/;
/** The table is read through `linkStateLabel(state, folders)` only, so a Voice folders project never shows a flat word (#3363). */
const TABLE = /\bLINK_STATE_LABEL\b/;
const root = join(__dirname, '..', '..');
const here = 'components/chapterTracks/chapterLink.ts';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The code without its comments, which may name the words they talk about. */
const codeOf = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

const offenders = (files: Record<string, string>): string[] =>
  Object.entries(files)
    .filter(([file, text]) => file !== here && !OWN_WORDS.has(file) && WORDS.test(codeOf(text)))
    .map(([file]) => file);

const tableReaders = (files: Record<string, string>): string[] =>
  Object.entries(files)
    .filter(([file, text]) => file !== here && TABLE.test(codeOf(text)))
    .map(([file]) => file);

describe('chapter link state words', () => {
  it('are written only in chapterLink.ts', () => {
    const files = Object.fromEntries(sources(root).map((path) => [relative(root, path), readFileSync(path, 'utf8')]));
    expect(offenders(files)).toEqual([]);
  });

  it('the table itself is read only inside chapterLink.ts, through linkStateLabel', () => {
    const files = Object.fromEntries(sources(root).map((path) => [relative(root, path), readFileSync(path, 'utf8')]));
    expect(tableReaders(files)).toEqual([]);
    expect(tableReaders({ 'components/x/Page.tsx': 'const a = LINK_STATE_LABEL.missing;' })).toEqual(['components/x/Page.tsx']);
    expect(tableReaders({ 'components/x/Page.tsx': 'const a = linkStateLabel(state, folders);' })).toEqual([]);
  });

  it('the scan finds each spelling it guards', () => {
    for (const word of ['Not linked', 'Track missing', 'Track gone', 'No track yet', 'Several tracks', 'Several folders', 'Folder missing']) {
      expect(offenders({ 'components/x/Page.tsx': `const a = '${word}';` })).toEqual(['components/x/Page.tsx']);
      expect(offenders({ 'components/x/Page.tsx': `const a = \`${word}\`;` })).toEqual(['components/x/Page.tsx']);
    }
    expect(offenders({ 'components/x/Page.tsx': `const a = 'Not linked to a track';` })).toEqual([]);
  });
});
