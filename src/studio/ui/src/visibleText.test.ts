import { describe, expect, it } from 'vitest';
import { bidiIsolated, hasVisibleText, isolateNameIn, isolatedIfRtl, textDirection, visibleKey, withBalancedIsolates } from './visibleText';

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
    // The segment separators: not line ends, but each splits a name into runs laid out on their own (#4129).
    ['line tabulation U+000B', '\u000B'],
    ['unit separator U+001F', '\u001F'],
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
    // The Arabic comma is weak (it takes the direction round it). The Arabic full stop U+06D4 is strong, so it moved out of this list in #4129 (see the next test).
    ['an Arabic comma', '\u060C'],
    // The other weak or neutral characters of the right-to-left blocks: extended digits (EN), the percent sign (ET), the decimal and thousands separators (AN), a mark (NSM), the zero-width non-joiner (BN).
    ['extended Arabic-Indic digits', '\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9'],
    ['the Arabic percent sign', '\u066A'],
    ['the Arabic decimal and thousands separators', '\u066B\u066C'],
    ['a vowel mark alone', '\u064B'],
    ['a zero-width non-joiner', '\u200C'],
    ['a Latin name with an Arabic comma', 'Take 1\u060C 2'],
  ])('does not isolate a name that holds only %s', (_label, name) => {
    expect(isolatedIfRtl(name)).toBe(name);
  });

  // A name of only right-to-left characters that are not letters is strong all the same (bidi class R or AL): left bare, a count after it is drawn before it (#4129).
  it.each([
    ['the Arabic semicolon U+061B', '\u061B'],
    ['the Arabic question mark U+061F', '\u061F'],
    ['the Arabic five-pointed star U+066D', '\u066D'],
    ['the Arabic full stop U+06D4', '\u06D4'],
    ['the Hebrew geresh U+05F3', '\u05F3'],
    ['the Hebrew gershayim U+05F4', '\u05F4'],
    ['the Hebrew maqaf U+05BE', '\u05BE'],
    ['the Hebrew sof pasuq U+05C3', '\u05C3'],
    // The rest of the strong right-to-left non-letters, one of each kind (the table in visibleText.ts is generated from Unicode 15.0, not picked by hand).
    ['the Hebrew punctuation paseq U+05C0', '\u05C0'],
    ['the Arabic-Indic cube root sign U+0608', '\u0608'],
    ['the Afghani sign U+060B', '\u060B'],
    ['the Arabic end of text mark U+061D', '\u061D'],
    ['the Syriac end of paragraph U+0700', '\u0700'],
    ['the N\u2019Ko digit zero U+07C0', '\u07C0'],
    ['the Samaritan punctuation U+0830', '\u0830'],
    ['the Arabic ligature rial sign U+FDFC', '\uFDFC'],
    ['an Adlam digit U+1E950 (outside the basic plane)', '\u{1E950}'],
  ])('isolates a name made of %s, though it holds no letter', (_label, name) => {
    expect(isolatedIfRtl(name)).toBe(`${FSI}${name}${PDI}`);
    expect(isolatedIfRtl(`${name}${name}`, 'ltr')).toBe(`${LRI}${name}${name}${PDI}`);
  });

  // The strong right-to-left non-letters of Unicode 15.0 (bidi class R or AL, not a letter, less the bidi controls the module strips), plus the two Garay signs of 16.0, as data: a code point the table in
  // visibleText.ts loses or gains, at either end of a range or inside it, fails the scan below (#4129).
  const STRONG_NOT_LETTER: ReadonlyArray<readonly [number, number]> = [
    [0x5be, 0x5be],
    [0x5c0, 0x5c0],
    [0x5c3, 0x5c3],
    [0x5c6, 0x5c6],
    [0x5f3, 0x5f4],
    [0x608, 0x608],
    [0x60b, 0x60b],
    [0x60d, 0x60d],
    [0x61b, 0x61b],
    [0x61d, 0x61f],
    [0x66d, 0x66d],
    [0x6d4, 0x6d4],
    [0x6fd, 0x6fe],
    [0x700, 0x70d],
    [0x70f, 0x70f],
    [0x7c0, 0x7c9],
    [0x7fe, 0x7ff],
    [0x830, 0x83e],
    [0x85e, 0x85e],
    [0x888, 0x888],
    [0xfbb2, 0xfbc2],
    [0xfdfc, 0xfdfc],
    [0x10857, 0x1085f],
    [0x10877, 0x1087f],
    [0x108a7, 0x108af],
    [0x108fb, 0x108ff],
    [0x10916, 0x1091b],
    [0x1093f, 0x1093f],
    [0x109bc, 0x109bd],
    [0x109c0, 0x109cf],
    [0x109d2, 0x109ff],
    [0x10a40, 0x10a48],
    [0x10a50, 0x10a58],
    [0x10a7d, 0x10a7f],
    [0x10a9d, 0x10a9f],
    [0x10ac8, 0x10ac8],
    [0x10aeb, 0x10af6],
    [0x10b58, 0x10b5f],
    [0x10b78, 0x10b7f],
    [0x10b99, 0x10b9c],
    [0x10ba9, 0x10baf],
    [0x10cfa, 0x10cff],
    [0x10d8e, 0x10d8f],
    [0x10ead, 0x10ead],
    [0x10f1d, 0x10f26],
    [0x10f51, 0x10f59],
    [0x10f86, 0x10f89],
    [0x10fc5, 0x10fcb],
    [0x1e8c7, 0x1e8cf],
    [0x1e950, 0x1e959],
    [0x1e95e, 0x1e95f],
    [0x1ec71, 0x1ecb4],
    [0x1ed01, 0x1ed3d],
  ];

  it('isolates exactly the strong right-to-left characters of the right-to-left blocks: every code point of every range, none just outside one', () => {
    expect(STRONG_NOT_LETTER.reduce((sum, [first, last]) => sum + (last - first + 1), 0)).toBe(435);
    const inTable = (cp: number) => STRONG_NOT_LETTER.some(([first, last]) => cp >= first && cp <= last);
    const wrong: string[] = [];
    // The blocks the module reads as right to left; a letter in them is isolated whatever the table says.
    for (const [from, to] of [
      [0x0590, 0x08ff],
      [0xfb1d, 0xfdff],
      [0xfe70, 0xfefc],
      [0x10800, 0x10fff],
      [0x1e800, 0x1efff],
    ] as const) {
      for (let cp = from; cp <= to; cp++) {
        const ch = String.fromCodePoint(cp);
        const expected = inTable(cp) || /\p{L}/u.test(ch);
        if (isolatedIfRtl(ch).includes(FSI) !== expected) wrong.push(`U+${cp.toString(16).toUpperCase()} should be ${expected ? 'isolated' : 'bare'}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('isolates a Latin name that holds one of them, and leaves one that holds only weak characters bare', () => {
    expect(isolatedIfRtl('Take\u061F')).toBe(`${FSI}Take\u061F${PDI}`);
    expect(isolatedIfRtl('Take \u0661\u0662\u0663')).toBe('Take \u0661\u0662\u0663');
  });

  // A narrator named in both scripts, as the host words a sentence with the name in the middle.
  const SARA = '\u0633\u0627\u0631\u0629 (Sara) 2';
  const SARA_WORD = '\u0633\u0627\u0631\u0629';
  const BA = '\u0628';
  const BAYT = '\u0628\u064A\u062A';

  it('isolateNameIn isolates the name left to right wherever a sentence holds it, and leaves a sentence without it as it is', () => {
    expect(isolateNameIn(`Replaced 2 words with ${SARA}'s audio in REAPER.`, SARA)).toBe(`Replaced 2 words with ${LRI}${SARA}${PDI}'s audio in REAPER.`);
    expect(isolateNameIn(`${SARA} and ${SARA}.`, SARA)).toBe(`${LRI}${SARA}${PDI} and ${LRI}${SARA}${PDI}.`);
    expect(isolateNameIn('Replaced 2 words with Eric Leach’s audio.', 'Eric Leach')).toBe('Replaced 2 words with Eric Leach’s audio.');
    expect(isolateNameIn('Done.', SARA)).toBe('Done.');
    expect(isolateNameIn('Done.', '  ')).toBe('Done.');
    expect(isolateNameIn('Done.', '')).toBe('Done.');
  });

  // The host trims the name it words into the sentence, so the trimmed name is looked for and the spaces round it stay outside the isolate.
  it('isolateNameIn looks the trimmed name up, so the spaces of a stored name stay outside the isolate', () => {
    expect(isolateNameIn(`Replaced 2 words with ${SARA_WORD}'s audio.`, ` ${SARA_WORD} `)).toBe(`Replaced 2 words with ${LRI}${SARA_WORD}${PDI}'s audio.`);
    expect(isolateNameIn(`x ${BA} y`, ` ${BA} `)).toBe(`x ${LRI}${BA}${PDI} y`);
  });

  // Go's TrimSpace trims U+0085 (next line) and JavaScript's trim does not: the lookup trims it too.
  it("isolateNameIn trims U+0085 from the name as the host's TrimSpace does", () => {
    expect(isolateNameIn(`x ${BA} y`, `\u0085${BA}\u0085`)).toBe(`x ${LRI}${BA}${PDI} y`);
  });

  it('isolateNameIn leaves a name alone inside a longer word, so its joining letters are not split, and still isolates a whole-word match', () => {
    expect(isolateNameIn(`In chapter ${BAYT}, with ${BA}.`, BA)).toBe(`In chapter ${BAYT}, with ${LRI}${BA}${PDI}.`);
    // The name after a letter (the letter is the first half of the adjacency rule) and before one (the second half).
    expect(isolateNameIn(`\u0627${BA}`, BA)).toBe(`\u0627${BA}`);
    expect(isolateNameIn(`${BA}\u0627`, BA)).toBe(`${BA}\u0627`);
    // A letter outside the basic plane before the name (two UTF-16 code units).
    expect(isolateNameIn(`\u{10400}${SARA_WORD}`, SARA_WORD)).toBe(`\u{10400}${SARA_WORD}`);
    // A right-to-left name inside a longer name of the same kind; the English narrator needs no isolate either way.
    expect(isolateNameIn(`${SARA_WORD}\u0629 and ${SARA_WORD}`, SARA_WORD)).toBe(`${SARA_WORD}\u0629 and ${LRI}${SARA_WORD}${PDI}`);
    expect(isolateNameIn('Sara and Sarah', 'Sara')).toBe('Sara and Sarah');
    expect(isolateNameIn("Replaced 2 words with Sara's audio in REAPER.", 'Sara')).toBe("Replaced 2 words with Sara's audio in REAPER.");
  });

  // A combining mark or a joiner next to the match is part of the same word: "in \u0628\u0651\u064A\u062A" must not split the shadda off its letter.
  it.each([
    ['a combining mark after the name', `${BA}\u0651\u064A\u062A`],
    ['a combining mark before the name', `\u064B${BA}`],
    ['a zero-width joiner after the name', `${BA}\u200D\u064A`],
    ['a zero-width non-joiner before the name', `\u200C${BA}`],
  ])('isolateNameIn leaves a name alone next to %s', (_label, text) => {
    expect(isolateNameIn(`in ${text}`, BA)).toBe(`in ${text}`);
  });

  it('isolateNameIn is idempotent: a name the sentence already isolates is not isolated again', () => {
    const once = `Replaced 2 words with ${LRI}${SARA_WORD}${PDI}'s audio.`;
    expect(isolateNameIn(once, SARA_WORD)).toBe(once);
    const twice = isolateNameIn(`Replaced 2 words with ${SARA_WORD}'s audio.`, SARA_WORD);
    expect(isolateNameIn(twice, SARA_WORD)).toBe(twice);
    expect(isolateNameIn(`${LRI}${SARA_WORD}${PDI} and ${SARA_WORD}.`, SARA_WORD)).toBe(`${LRI}${SARA_WORD}${PDI} and ${LRI}${SARA_WORD}${PDI}.`);
  });

  // A first-strong isolate round the name (what the host may add one day, #4126) draws a name by its first letter, "2 (Sara) <Arabic>": the name gets the left-to-right isolate inside it, and the overlay keeps the nested pair.
  it('isolateNameIn makes a first-strong isolate round the name left to right', () => {
    const sentence = `with ${FSI}${SARA}${PDI}'s audio`;
    const isolated = isolateNameIn(sentence, SARA);
    expect(isolated).toBe(`with ${FSI}${LRI}${SARA}${PDI}${PDI}'s audio`);
    expect(withBalancedIsolates(isolated)).toBe(isolated);
  });

  // The overlay removes a right-to-left isolate with its close, so a name inside one is bare once it gets there: it is isolated again, and the pair that stays is the new one.
  it('isolateNameIn does not take a name inside a right-to-left isolate for isolated: after the overlay it still holds a pair', () => {
    const sentence = `with ${RLI}${SARA_WORD}${PDI}'s audio`;
    const isolated = isolateNameIn(sentence, SARA_WORD);
    expect(isolated).not.toBe(sentence);
    expect(withBalancedIsolates(isolated)).toBe(`with ${LRI}${SARA_WORD}${PDI}'s audio`);
  });

  // The break set is exact: U+001B (escape) is not a separator and U+0009 (tab, also a bidi segment separator) is not handled here, so each stays as it is.
  it.each([
    ['U+001B', '\u001B'],
    ['U+0009', '\u0009'],
  ])('a %s inside a name is left as it is', (_label, character) => {
    const name = `\u0648\u0627\u062D\u062F${character}\u0627\u062B\u0646\u0627\u0646`;
    expect(isolatedIfRtl(name)).toBe(`${FSI}${name}${PDI}`);
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

  it('isolates an Arabic file name left to right, so its extension stays last (#4113)', () => {
    const file = '\u0623\u0644\u064a\u0633.rpp';
    expect(isolatedIfRtl(file, 'ltr')).toBe(`\u2066${file}\u2069`);
    expect(withBalancedIsolates(isolatedIfRtl(file, 'ltr'))).toBe(`\u2066${file}\u2069`);
    expect(isolatedIfRtl(file)).toBe(`\u2068${file}\u2069`);
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
