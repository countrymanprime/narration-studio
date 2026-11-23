import { describe, expect, it } from 'vitest';
import { bidiIsolated, hasVisibleText, isolatedIfRtl, textDirection, visibleKey, withBalancedIsolates } from './visibleText';

// Built from code points so no invisible character sits in this file.
const chars = (...codes: number[]) => String.fromCodePoint(...codes);
const DRAWS = ['a', ' a ', 'é', '😀', 'שלום', `a${chars(0x200b)}b`];
const NOTHING = [
  '',
  '   ',
  '\t\n',
  chars(0x200b),
  chars(0x200d),
  chars(0x200b, 0x200d),
  chars(0x2060),
  chars(0xad),
  chars(0xfeff),
  chars(0x3164),
  chars(0x2800),
  chars(0x202e),
];

describe('hasVisibleText', () => {
  it.each(DRAWS)('%j draws something', (text) => expect(hasVisibleText(text)).toBe(true));
  it.each(NOTHING)('%j draws nothing', (text) => expect(hasVisibleText(text)).toBe(false));
  it('a value that is not a string draws nothing and never throws', () => {
    expect(hasVisibleText(undefined)).toBe(false);
    expect(hasVisibleText(null)).toBe(false);
    expect(hasVisibleText(7)).toBe(false);
  });
});

describe('every code point the Unicode properties call blank', () => {
  // Generated from the properties, not a hand list: a hand list is how U+034F, the variation selectors and the tag characters slipped past (#3382 f).
  const BLANK = /^[\s\p{Cc}\p{Default_Ignorable_Code_Point}]$/u;
  it('draws nothing, alone and doubled', () => {
    const missed: string[] = [];
    for (let code = 0; code <= 0x10ffff; code += 1) {
      if (code >= 0xd800 && code <= 0xdfff) continue;
      const char = String.fromCodePoint(code);
      if (BLANK.test(char) && (hasVisibleText(char) || hasVisibleText(char + char))) missed.push(`U+${code.toString(16).toUpperCase()}`);
    }
    expect(missed).toEqual([]);
  });

  it('visibleKey makes a lookalike the same key', () => {
    expect(visibleKey(`Mad${chars(0x200b)} Hatter`)).toBe('Mad Hatter');
    expect(visibleKey(`${chars(0x34f)}Alice${chars(0x200d)}`)).toBe('Alice');
  });
});

// #4113: a name in an English sentence is isolated when it is right to left, with no control of its own left in it, so a hostile name cannot unbalance the sentence. The isolate controls are
// FSI (first-strong isolate), LRI and RLI (left-to-right and right-to-left isolates) and PDI (closes one).
const FSI = '\u2068';
const LRI = '\u2066';
const RLI = '\u2067';
const PDI = '\u2069';
const ARABIC = '\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u0623\u0648\u0644'; // "the first chapter", in Arabic
const STRAY = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069];

describe('a name inside a sentence (#4113)', () => {
  it('is wrapped in one isolate pair, and holds none of its own', () => {
    expect(bidiIsolated(ARABIC)).toBe(`${FSI}${ARABIC}${PDI}`);
    expect(bidiIsolated(ARABIC, 'ltr')).toBe(`${LRI}${ARABIC}${PDI}`);
    expect(bidiIsolated(`${chars(...STRAY)}${ARABIC}${chars(...STRAY)}`)).toBe(`${FSI}${ARABIC}${PDI}`);
  });

  // A paragraph or line break inside a name ends its isolate (the words swap, a count after it jumps into it, NEL draws a box): each becomes a space.
  it.each([
    ['LF', '\n'],
    ['CR', '\r'],
    ['U+001C', '\u001C'],
    ['U+001D', '\u001D'],
    ['U+001E', '\u001E'],
    ['NEL', '\u0085'],
    ['line separator', '\u2028'],
    ['paragraph separator', '\u2029'],
  ])('bidiIsolated and isolatedIfRtl turn a %s in a name into a space', (_label, separator) => {
    expect(bidiIsolated(`\u0648\u0627\u062D\u062F${separator}\u0627\u062B\u0646\u0627\u0646`)).toBe(
      `${FSI}\u0648\u0627\u062D\u062F \u0627\u062B\u0646\u0627\u0646${PDI}`,
    );
    expect(isolatedIfRtl(`\u0648\u0627\u062D\u062F${separator}\u0627\u062B\u0646\u0627\u0646`)).toBe(
      `${FSI}\u0648\u0627\u062D\u062F \u0627\u062B\u0646\u0627\u0646${PDI}`,
    );
    expect(isolatedIfRtl(`one${separator}two`)).toBe('one two');
  });

  it('is isolated for a toast only when it holds a right-to-left letter, and always without stray controls', () => {
    expect(isolatedIfRtl(ARABIC)).toBe(`${FSI}${ARABIC}${PDI}`);
    expect(isolatedIfRtl('\u05E9\u05DC\u05D5\u05DD')).toBe(`${FSI}\u05E9\u05DC\u05D5\u05DD${PDI}`);
    expect(isolatedIfRtl('Chapter 1')).toBe('Chapter 1');
    expect(isolatedIfRtl(`Chapter${chars(0x202e)} 1`)).toBe('Chapter 1');
    expect(isolatedIfRtl(`${ARABIC} 3`)).toBe(`${FSI}${ARABIC} 3${PDI}`);
  });

  // The right-to-left blocks hold digits, vowel marks and stops too: only a letter makes a name right to left.
  it.each([
    ['Arabic-Indic digits', '\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'],
    ['a vowel mark on a Latin letter', 'A\u064B'],
    ['an Arabic comma and full stop', '\u060C\u06D4'],
  ])('does not isolate a name that holds only %s', (_label, name) => {
    expect(isolatedIfRtl(name)).toBe(name);
  });

  it.each([
    ['right-to-left letters only', '\u062A\u0645 \u0627\u0644\u062D\u0641\u0638', 'auto'],
    ['an Arabic sentence with a Latin word', '\u062A\u0639\u0630\u0631 \u0639\u0644\u0649 REAPER \u062D\u0641\u0638 \u0627\u0644\u0641\u0635\u0644.', 'auto'],
    ['an English sentence with a leading Arabic name', `${ARABIC} is linked to its track.`, 'ltr'],
    ['the same with the name isolated: the name is not counted', `${FSI}${ARABIC}${PDI} is linked to its track.`, 'ltr'],
    ['a longer Arabic name than the English words, isolated', `${FSI}${ARABIC}${PDI} restored.`, 'ltr'],
    ['a name nested in another isolate: neither is counted', `${FSI}${ARABIC}${FSI}${ARABIC}${PDI}${ARABIC}${PDI} restored.`, 'ltr'],
    ['a name that is all there is', `${FSI}${ARABIC}${PDI}`, 'auto'],
    ['no letters at all', '\u0661\u0662\u0663 … 4', 'auto'],
    ['Arabic-Indic digits are not letters: the Latin word decides', 'Take \u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669', 'ltr'],
    ['as many Latin as right-to-left letters', 'abc \u0627\u0628\u062C', 'ltr'],
  ])('lays out %s: %s', (_name, text, expected) => {
    expect(textDirection(text)).toBe(expected);
  });

  it('keeps the isolates that open and close round a name, and drops stray or unclosed ones and the other controls', () => {
    expect(withBalancedIsolates(`${FSI}${ARABIC}${PDI} is linked.`)).toBe(`${FSI}${ARABIC}${PDI} is linked.`);
    expect(withBalancedIsolates(`a ${PDI} b`)).toBe('a  b');
    expect(withBalancedIsolates(`a ${FSI} b`)).toBe('a  b');
    expect(withBalancedIsolates(`${FSI}x${PDI}${FSI}y`)).toBe(`${FSI}x${PDI}y`);
    expect(withBalancedIsolates(`${chars(0x202e)}eslaf${chars(0x202c)}${chars(0x200f)}`)).toBe('eslaf');
  });

  it('drops the close of an isolate whose opener it removed, so part of a name never ends outside its pair', () => {
    expect(withBalancedIsolates(`${FSI}a${LRI}b${PDI}c${PDI}`)).toBe(`${FSI}a${LRI}b${PDI}c${PDI}`);
    expect(withBalancedIsolates(`${FSI}a${RLI}b${PDI}c${PDI}`)).toBe(`${FSI}abc${PDI}`);
    expect(withBalancedIsolates(`${LRI}a${PDI} b`)).toBe(`${LRI}a${PDI} b`);
    expect(withBalancedIsolates(`${LRI}a b`)).toBe('a b');
    // A path is isolated left to right, and the toast keeps that isolate.
    expect(withBalancedIsolates(isolatedIfRtl('C:\\\u05e1\\book', 'ltr'))).toBe(`${LRI}` + 'C:\\\u05e1\\book' + `${PDI}`);
  });

  it('turns a line or paragraph break inside a kept isolate into a space, so the isolate holds', () => {
    for (const sep of ['\u0085', '\u2029', '\u001c', '\n', '\r']) {
      expect(withBalancedIsolates(`${FSI}a${sep}b${PDI}: 3`)).toBe(`${FSI}a b${PDI}: 3`);
    }
    // Outside an isolate a line break is the host's own and stays (a two-line toast).
    expect(withBalancedIsolates('a\nb')).toBe('a\nb');
  });

  it('removes forty thousand unclosed isolates and keeps forty thousand closed ones', () => {
    // A pass that looked back for each opener would be quadratic here; the answer is what is checked, not how long it took.
    expect(withBalancedIsolates(`${FSI.repeat(40_000)}tail`)).toBe('tail');
    expect(withBalancedIsolates(`${FSI.repeat(40_000)}a${PDI.repeat(40_000)}`)).toBe(`${FSI.repeat(40_000)}a${PDI.repeat(40_000)}`);
  });
});
