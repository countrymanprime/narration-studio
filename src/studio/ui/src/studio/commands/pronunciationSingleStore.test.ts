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

  it('only the shared row asks a source for a value or lets the narrator pick one: no second editor under another label', () => {
    const asking = outsideApi
      .filter(({ path }) => path !== 'components/storybible/source/NamePronunciation.tsx')
      .filter(({ text }) => /\.pronunciationCandidate\(|<PronSourceTag\b[^>]*\bonPick=/s.test(text))
      .map(({ path }) => path);
    expect(asking, "a source tag elsewhere is read-only; picking or asking a source is NamePronunciation's").toEqual([]);
  });

  it("Script's read cache holds the host's lists and no list of its own: the Story Bible's entries are its words", () => {
    const data = files.find(({ path }) => path === 'components/script/page/data/scriptData.ts')!.text;
    const lists = /export type ScriptList = ([^;]+);/.exec(data)![1]!.match(/'[a-z]+'/g);
    expect(lists).toEqual(["'chapters'", "'marks'", "'prep'", "'entries'", "'types'", "'cues'"]);
  });

  it('every journal key of the Story Bible is in one namespace, so its undos order with each other whichever page made them', () => {
    const keys = outsideApi.flatMap(({ path, text }) =>
      [...text.matchAll(/touches:\s*\[([^\]]*)\]/g)].flatMap((match) => [...match[1]!.matchAll(/storyBible\/([a-zA-Z]+)/g)].map((key) => `${path}: ${key[1]}`)),
    );
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => !/: (entities|cues|types)$/.test(key))).toEqual([]);
  });

  it('the Story Bible holds story elements only: no Word type and no list of my words anywhere (#2595)', () => {
    const offenders = outsideApi
      .filter(({ text }) => /['"]Word['"]\s*,\s*\[\]|WORD_TYPE|Add to my words|Remove from my words|\bmy words\b/i.test(text))
      .map(({ path }) => path);
    expect(offenders, 'a word that is no story element goes to the user dictionary, never the Story Bible').toEqual([]);
  });

  it('only the shared command changes the user dictionary', () => {
    const offenders = outsideApi
      .filter(({ path }) => path !== 'studio/commands/userDictionary.ts')
      .filter(({ text }) => /\.userDictionary(Save|Remove)\(/.test(text))
      .map(({ path }) => path);
    expect(offenders, 'save through studio/commands/userDictionary.ts, so it is one undoable entry').toEqual([]);
  });
});
