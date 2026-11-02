// @vitest-environment node
// Audit cluster 13 (#2595): a pronunciation has one home, the Story Bible entry's name. These guards fail when a second store, a second
// edit path or a second row component for it comes back, which is how Script's flagged-word list once grew beside the Story Bible.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });
const files = sources(SRC).map((path) => ({ path: relative(SRC, path).split(sep).join('/'), text: readFileSync(path, 'utf8') }));
/** The API layer (contracts, schemas, the Wails client and the browser mock) names every call; the feedback table lists them. */
const outsideApi = files.filter(({ path }) => !path.startsWith('api/') && !path.startsWith('interactionFeedback/'));

describe('one pronunciation store (#2595)', () => {
  it('no file but the shared commands changes a pronunciation on the host', () => {
    const offenders = outsideApi
      .filter(({ path }) => path !== 'studio/commands/pronounce.ts')
      .filter(({ text }) => /\.guidePronounce(User)?\(|\.guidePronunciation(UseAlternate|Restore)\(/.test(text))
      .map(({ path }) => path);
    expect(offenders, 'change a pronunciation through studio/commands/pronounce.ts, so it is one undoable entry on every page').toEqual([]);
  });

  it('the host API has no second place a word is said: the Script prep record keeps chapter states only', () => {
    const contract = files.find(({ path }) => path === 'api/contracts/scriptPrep.ts')!.text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(contract).not.toMatch(/\bsay\b|\bword\b|ScriptWord|pronunciation\s*:/i);
    const offenders = files.filter(({ text }) => /\bScriptWord\b|scriptWord(Flag|Say|Unflag)\b/.test(text)).map(({ path }) => path);
    expect(offenders, 'a word is a Story Bible entry of the type Word; do not bring back the Script word list').toEqual([]);
  });

  it("one row component draws and edits a name's pronunciation: Script's Words card renders the Story Bible's", () => {
    // A text box labelled for how a word or name is said, anywhere but the shared row, is a second editor of the same value.
    const editors = outsideApi
      .filter(({ path }) => path.endsWith('.tsx') && path !== 'components/storybible/source/NamePronunciation.tsx')
      .filter(({ text }) => /(?<![-\w])label=\{?[`'"]How I (will )?say/.test(text))
      .map(({ path }) => path);
    expect(editors, 'render NamePronunciation for the name instead of a field of your own').toEqual([]);
    const card = files.find(({ path }) => path === 'components/script/page/rail/words/WordCard.tsx')!.text;
    expect(card).toMatch(/<NamePronunciation\b/);
  });
});
