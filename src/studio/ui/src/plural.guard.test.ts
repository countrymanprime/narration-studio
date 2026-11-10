// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard for issue 3277 (reuse): a count and its noun are joined in `plural.ts` and nowhere else, so "1 take", "2 takes" and "1,234 words"
// read the same on every page. A page does not define its own `plural` helper and does not write `n === 1 ? 'take' : 'takes'`. A verb or a
// pronoun that agrees with a count ("was"/"were", "has"/"have") is not a noun and stays a ternary. `api/` (host stand-ins that write the host's own
// wording) and `fixtures/` are not UI wording and are not scanned.
const SRC = join(__dirname);

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name)) yield path;
  }
}

const OWN_HELPER = /\b(?:const|function)\s+(?:plural|pluralize|pluralise|plurals)\b/;
const TERNARY = /===?\s*1\s*\?\s*(['"`])([^'"`]+)\1\s*:\s*(['"`])([^'"`]+)\3/g;
/** The many form is the one form plus "s", "es", or "y" becoming "ies": a noun, not a verb ("is"/"are") or a pronoun ("its"/"their"). */
const isNounPair = (one: string, many: string): boolean =>
  many === `${one}s` || many === `${one}es` || (one.endsWith('y') && many === `${one.slice(0, -1)}ies`);

const ownPluralIn = (text: string): string[] => {
  const found: string[] = [];
  if (OWN_HELPER.test(text)) found.push('defines its own plural helper');
  for (const m of text.matchAll(TERNARY)) if (isNounPair(m[2]!, m[4]!)) found.push(`writes ${m[0]}`);
  return found;
};

describe('the scan itself', () => {
  it.each([
    'const plural = (n: number) => n',
    'function pluralize(count: number) {}',
    "`${n} ${n === 1 ? 'take' : 'takes'}`",
    "n === 1 ? 'entry' : 'entries'",
    "x == 1 ? 'match' : 'matches'",
  ])('sees %s', (code) => expect(ownPluralIn(code).length).toBeGreaterThan(0));
  it.each([
    "n === 1 ? 'was' : 'were'",
    "n === 1 ? 'has' : 'have'",
    "n === 1 ? 'its' : 'their'",
    "n === 1 ? 'sits' : 'sit'",
    'const label = pluralWord(n, "take")',
  ])('leaves %s alone', (code) => expect(ownPluralIn(code)).toEqual([]));
});

describe('one plural for every count and noun', () => {
  const files = [...sources(SRC)]
    .map((path) => relative(SRC, path).split(sep).join('/'))
    .filter((file) => file !== 'plural.ts' && !file.startsWith('api/') && !file.startsWith('fixtures/'));
  it('has no file writing its own', () => {
    const found = files.flatMap((file) => ownPluralIn(readFileSync(join(SRC, file), 'utf8')).map((what) => `${file} ${what}`));
    expect(found).toEqual([]);
  });
});
