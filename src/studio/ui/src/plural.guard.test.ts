// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard for issue 3277 (reuse): a count and its noun are joined in `plural.ts` and nowhere else, so "1 take", "2 takes" and "1,234 words"
// read the same on every page. A page does not define its own helper, does not write `n === 1 ? 'take' : 'takes'` (or `n === 1 ? '' : 's'`, `n !== 1`,
// `n > 1`, or a count inside the branch), and does not write `${n} ${pluralWord(n, 'x')}` where `plural(n, 'x')` does it with the separators. A verb or
// pronoun that agrees with a count ("was"/"were", "has"/"have", "its"/"their") is not a noun and stays a ternary. `api/` (host stand-ins that write the
// host's own wording) and `fixtures/` are not UI wording and are not scanned.
const SRC = join(__dirname);

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name)) yield path;
  }
}

const OWN_HELPER = /\b(?:const|let|var|function)\s+\w*[Pp]lural\w*\b/;
const ARM = String.raw`('[^']*'|"[^"]*"|\`[^\`]*\`)`;
const EXPR = String.raw`[\w.\[\]()]+`;
const TERNARY = new RegExp(String.raw`(${EXPR})\s*(===?|!==?|>=?|<=?)\s*1\s*\?\s*${ARM}\s*:\s*${ARM}`, 'g');
const YODA = new RegExp(String.raw`1\s*(===?|!==?)\s*(${EXPR})\s*\?\s*${ARM}\s*:\s*${ARM}`, 'g');
// A count expression (length, count, total, n) followed by a literal plural noun ("${rows.length} rules"): it never reads "1 rules" and prints no separator.
const COUNT_LITERAL_NOUN =
  /(?:\$\{|(?<![\w$])\{)(?!plural\(|formatCount\()([^{}`]*?(?:length|count|Count|total|Total|\bn\b|\.n\b)[^{}`]*)\} (?:[a-z]+ )?([a-z]{3,}(?:s|ies))\b(?![=}])(?![^{}`<\n]*\})/g;
const NOT_A_NOUN = new Set([
  'markers',
  'this',
  'is',
  'was',
  'has',
  'does',
  'its',
  'as',
  'focus',
  'status',
  'process',
  'always',
  'us',
  'hours',
  'minutes',
  'seconds',
]);
const COUNT_THEN_WORD = /(?:\$\{|\{)([\w.[\]()]+)\}[^`\n{}$]{0,48}(?:\$\{|\{)pluralWord\(\1,/;

const bare = (arm: string): string => arm.slice(1, -1);
/** The many form is the one form plus "s", "es", or "y" becoming "ies": a noun, not a verb ("is"/"are") or a pronoun ("its"/"their"). */
const isNounPair = (one: string, many: string): boolean =>
  many === `${one}s` || many === `${one}es` || (one.endsWith('y') && many === `${one.slice(0, -1)}ies`);

/** Whether a ternary on `count` with these two arms is a noun being made plural; `!==` and `>` put the many form first. */
const isCountTernary = (count: string, a: string, b: string, negated: boolean): boolean => {
  const [x, y] = negated ? [bare(b), bare(a)] : [bare(a), bare(b)];
  if ((x === '' && /^e?s$/.test(y)) || (y === '' && /^e?s$/.test(x))) return true;
  if (isNounPair(x, y)) return true;
  // A count inside the branch: one arm is the bare noun (or "1 noun") and the other exactly `${count} noun`. A sentence that only changes its wording around a
  // count ("one undo step" / "3 undo steps, one per cut") is prose, not this.
  const withCount = new RegExp(String.raw`^\$\{${count.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\} [A-Za-z]+$`);
  const bareNoun = (t: string): boolean => /^((1|a|an|one) )?[A-Za-z]+$/i.test(t);
  return (withCount.test(x) && bareNoun(y)) || (withCount.test(y) && bareNoun(x));
};

const ownPluralIn = (text: string, allowCountBeforeNoun = false): string[] => {
  const found: string[] = [];
  if (OWN_HELPER.test(text)) found.push('defines its own plural helper');
  for (const m of text.matchAll(TERNARY)) if (isCountTernary(m[1]!, m[3]!, m[4]!, /^(!==?|>=?)$/.test(m[2]!))) found.push(`writes ${m[0]}`);
  for (const m of text.matchAll(YODA)) if (isCountTernary(m[2]!, m[3]!, m[4]!, m[1] === '!==' || m[1] === '!=')) found.push(`writes ${m[0]}`);
  if (!allowCountBeforeNoun)
    for (const m of text.matchAll(COUNT_LITERAL_NOUN))
      if (!NOT_A_NOUN.has(m[2]!) && !m[2]!.endsWith('ss') && !m[1]!.includes('toLocaleString') && !m[1]!.includes(' ? '))
        found.push(`writes a count before a literal plural noun: ${m[0]}`);
  if (COUNT_THEN_WORD.test(text)) found.push('writes a bare count before pluralWord: use plural(count, noun) or formatCount(count)');
  return found;
};

describe('the scan itself', () => {
  it.each([
    'const plural = (n: number) => n',
    'function pluralize(count: number) {}',
    'const pluralS = (n) => n',
    "`${n} ${n === 1 ? 'take' : 'takes'}`",
    "n === 1 ? 'entry' : 'entries'",
    "x == 1 ? 'match' : 'matches'",
    "`${n} chapter${n === 1 ? '' : 's'}`",
    "`take${n === 1 ? '' : 's'}`",
    "{n} item{n === 1 ? '' : 's'}",
    "n !== 1 ? 'takes' : 'take'",
    "n > 1 ? 'effects' : 'effect'",
    "1 === n ? 'take' : 'takes'",
    "n === 1 ? 'take' : `${n} takes`",
    "n === 1 ? '1 file' : `${n} files`",
    "(a.b.length) === 1 ? 'word' : 'words'",
    '`${count} ${pluralWord(count, "take")}`'.replace('"', "'").replace('"', "'"),
    "{count} {pluralWord(count, 'word')}",
  ])('sees %s', (code) => expect(ownPluralIn(code).length).toBeGreaterThan(0));
  it.each([
    "n === 1 ? 'was' : 'were'",
    "n === 1 ? 'has' : 'have'",
    "n === 1 ? 'its' : 'their'",
    "n === 1 ? 'sits' : 'sit'",
    "tools.length === 1 ? `Download ${tools[0].displayName}` : 'Download better analysis'",
    "days === 1 ? 'yesterday' : `${plural(days, 'day')} ago`",
    'const label = pluralWord(n, "take")',
    "const label = `Hid ${n} other ${pluralWord(m, 'take')}`",
    "`Export ${formatCount(n)} new ${pluralWord(n, 'marker')}`",
    '`Add ${formatCount(count)} as markers in ${dawName}`',
    "`${plural(rows.length, 'rule')}`",
  ])('leaves %s alone', (code) => expect(ownPluralIn(code)).toEqual([]));
});

// Files that print a number beside a plural-looking word that is not a count of things, with why. This list only shrinks.
const NOT_COUNTS: Readonly<Record<string, string>> = {
  'components/engine/chapterSyncText.ts': 'the count is a spoken word ("two tracks", COUNT_WORDS), not a number',
  'components/script/page/chapters/ChapterCard.tsx': 'words() already formats the count with separators and its own unit rules',
  'components/master/diagnosticsFormat.ts': 'a duration between words ("0.4 s between words"), not a count of words',
  'components/storybible/EntryTable.tsx': 'a pixel measure of a virtual list, not a count',
  'components/storybible/PropertiesSection.tsx': 'JSX attributes (`count={rows.length} rows={rows}`), not text',
  'components/booth/voices/VoiceControl.tsx': 'the count is the word "Several" when the DAW did not say how many',
};

describe('one plural for every count and noun', () => {
  const files = [...sources(SRC)]
    .map((path) => relative(SRC, path).split(sep).join('/'))
    .filter((file) => file !== 'plural.ts' && !file.startsWith('api/') && !file.startsWith('fixtures/'));
  it('has no file writing its own', () => {
    const found = files
      .filter((file) => !(file in NOT_COUNTS))
      .flatMap((file) => ownPluralIn(readFileSync(join(SRC, file), 'utf8')).map((what) => `${file} ${what}`));
    expect(found).toEqual([]);
  });
});
