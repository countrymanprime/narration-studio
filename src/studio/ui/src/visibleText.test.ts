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

// #4113: a name in an English sentence is isolated (U+2068 … U+2069) when it is right to left, with no control of its own left in it, so a hostile name cannot unbalance the sentence.
const FSI = chars(0x2068);
const PDI = chars(0x2069);
const ARABIC = 'الفصل الأول';
const STRAY = [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069];

describe('a name inside a sentence (#4113)', () => {
  it('is wrapped in one isolate pair, and holds none of its own', () => {
    expect(bidiIsolated(ARABIC)).toBe(`${FSI}${ARABIC}${PDI}`);
    const hostile = bidiIsolated(`${chars(...STRAY)}${ARABIC}${chars(...STRAY)}`);
    expect(hostile).toBe(`${FSI}${ARABIC}${PDI}`);
  });

  it('is isolated for a toast only when it holds a right-to-left letter, and always without stray controls', () => {
    expect(isolatedIfRtl(ARABIC)).toBe(`${FSI}${ARABIC}${PDI}`);
    expect(isolatedIfRtl('שלום')).toBe(`${FSI}שלום${PDI}`);
    expect(isolatedIfRtl('Chapter 1')).toBe('Chapter 1');
    expect(isolatedIfRtl(`Chapter${chars(0x202e)} 1`)).toBe('Chapter 1');
    expect(isolatedIfRtl(`${ARABIC} 3`)).toBe(`${FSI}${ARABIC} 3${PDI}`);
  });

  it.each([
    ['right-to-left letters only', 'تم الحفظ', 'auto'],
    ['an Arabic sentence with a Latin word', 'تعذر على REAPER حفظ الفصل.', 'auto'],
    ['an English sentence with a leading Arabic name', `${ARABIC} is linked to its track.`, 'ltr'],
    ['the same with the name isolated: the name is not counted', `${FSI}${ARABIC}${PDI} is linked to its track.`, 'ltr'],
    ['a name that is all there is', `${FSI}${ARABIC}${PDI}`, 'auto'],
    ['no letters at all', '١٢٣ … 4', 'auto'],
    ['as many Latin as right-to-left letters', 'abc ابج', 'ltr'],
  ])('lays out %s: %s', (_name, text, expected) => {
    expect(textDirection(text)).toBe(expected);
  });

  it('keeps the isolates that open and close round a name, and drops stray or unclosed ones and the other controls', () => {
    const strip = /[؜‎‏‪-‮⁦-⁩]/g;
    expect(withBalancedIsolates(`${FSI}${ARABIC}${PDI} is linked.`, strip)).toBe(`${FSI}${ARABIC}${PDI} is linked.`);
    expect(withBalancedIsolates(`a ${PDI} b`, strip)).toBe('a  b');
    expect(withBalancedIsolates(`a ${FSI} b`, strip)).toBe('a  b');
    expect(withBalancedIsolates(`${FSI}x${PDI}${FSI}y`, strip)).toBe(`${FSI}x${PDI}y`);
    expect(withBalancedIsolates(`${chars(0x202e)}eslaf${chars(0x202c)}${chars(0x200f)}`, strip)).toBe('eslaf');
  });
});
