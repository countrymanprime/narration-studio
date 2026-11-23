// The one test for "this text draws something": a name or a sentence is blank when it is only spaces or only characters that draw nothing
// (zero-width and direction marks, other format and control characters, the Hangul fillers, the braille blank, the musical null notehead,
// the object replacement mark, a combining mark with no letter). `trim()` keeps those, so a field that only trims accepts a name nobody can see
// (#3382 f). The track-name fallback, the host-sentence fallback (`sentenceOr`) and the mastering dialog's name all use it.

/** Fillers that are letters or symbols to Unicode and draw nothing; chain.go's `blankLooking` is the host's copy. */
const FILLERS = new RegExp('[\\u2800\\u115F\\u1160\\u3164\\uFFA0\\uFFFC\\u{1D159}]', 'gu');

/** A character that draws something: a letter, a number, punctuation or a symbol. */
const DRAWS = /[\p{L}\p{N}\p{P}\p{S}]/u;

/** True when the text has at least one character that draws. A value that is not a string has none. */
export const hasVisibleText = (text: unknown): boolean => typeof text === 'string' && DRAWS.test(text.replace(FILLERS, ''));

/**
 * The text with everything that draws nothing taken out, for comparing two names: "Mad Hatter with a zero-width space after Mad" and "Mad Hatter" look alike, so they are the same name.
 * Not for storing or showing: a zero-width joiner inside an emoji or a Persian word is part of that text.
 */
const NOT_DRAWN = /[\p{Cf}\p{Cc}\p{Default_Ignorable_Code_Point}]/gu;
export const visibleKey = (text: string): string => text.replace(NOT_DRAWN, '').replace(FILLERS, '');

/** The text with each character that draws nothing (controls, format and bidi marks, zero-width characters, fillers) turned into a space, for text someone else wrote. */
// Narrower than NOT_DRAWN: a variation selector, a joiner or a tag character belongs to an emoji, keycap, flag or ideograph that draws.
const CONTROL_OR_FORMAT = /^[\p{Cf}\p{Cc}]$/u;
const KEPT_FORMAT = (code: number) => code === 0x200c || code === 0x200d || (code >= 0xe0000 && code <= 0xe007f);
export const spaceOutInvisible = (text: string): string =>
  Array.from(text, (ch) => (CONTROL_OR_FORMAT.test(ch) && !KEPT_FORMAT(ch.codePointAt(0) ?? 0) ? ' ' : ch))
    .join('')
    .replace(FILLERS, ' ');

// A name inside a sentence of another direction (#4113). A narrator's chapter or track name can be right to left while the sentence round it is English: left alone, the name's
// first letter can turn the whole line around, and a digit or the full stop after it lands on the wrong side. An isolate (U+2068 … U+2069) keeps the name's direction to itself.

/** The controls that open an embedding, an override or an isolate (U+202A to U+202E, U+2066 to U+2069): a name carries none of its own, or a hostile one could unbalance the sentence it sits in. */
const STRAY_BIDI = /[‪-‮⁦-⁩]/g;
/** A letter of a right-to-left script: Hebrew, Arabic and its extensions, Syriac, Thaana, N'Ko and the other blocks that read right to left, and their presentation forms. */
const RTL_LETTER = /[֐-ࣿיִ-﷿ﹰ-ﻼ\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
const LATIN_LETTER = /[A-Za-z]/;
/** A name the app put in a sentence: an isolate that opens and closes with nothing of its own inside. */
const ISOLATED_NAME = /⁨[^⁨⁩]*⁩/g;

/** A name inside a sentence, isolated (first-strong direction of its own): the name has no controls of its own left in it, so the pair is always balanced. */
export const bidiIsolated = (name: string): string => `⁨${name.replace(STRAY_BIDI, '')}⁩`;

/**
 * A name for a toast sentence: isolated when it holds a right-to-left letter, otherwise left as it is (an English name in an English sentence needs no isolate, and the two invisible
 * characters would be in every copy, search and character count of the sentence). Controls of its own are removed either way.
 */
export const isolatedIfRtl = (name: string): string => (RTL_LETTER.test(name) ? bidiIsolated(name) : name.replace(STRAY_BIDI, ''));

/**
 * The direction a message is laid out in: left to right when the app's own words in it (not the names it isolated) have at least as many Latin letters as right-to-left ones, so a sentence
 * that begins with an Arabic name still reads left to right; otherwise `auto`, so a message that is mostly right to left (an Arabic sentence holding "REAPER") takes the direction of its own first strong letter.
 * ASCII letters on purpose: the app's own language is English, and a Latin letter outside it (an accented one) is not what the app said.
 */
export const textDirection = (text: string): 'ltr' | 'auto' => {
  let latin = 0;
  let rtl = 0;
  for (const ch of text.replace(ISOLATED_NAME, '')) {
    if (LATIN_LETTER.test(ch)) latin++;
    else if (RTL_LETTER.test(ch)) rtl++;
  }
  return latin > 0 && latin >= rtl ? 'ltr' : 'auto';
};

/** A message with the bidi controls matching `strip` removed, and the isolates that open and close round a name kept (the app wraps names in them); an unbalanced one goes too. */
export const withBalancedIsolates = (text: string, strip: RegExp): string => {
  let out = '';
  const open: number[] = [];
  for (const ch of text) {
    if (ch === '⁨') {
      open.push(out.length);
      out += ch;
    } else if (ch === '⁩') {
      if (open.pop() !== undefined) out += ch;
    } else out += ch.replace(strip, '');
  }
  // An isolate that never closed is removed (from the last to the first, so the indexes stay right).
  for (const at of open.reverse()) out = out.slice(0, at) + out.slice(at + 1);
  return out;
};
