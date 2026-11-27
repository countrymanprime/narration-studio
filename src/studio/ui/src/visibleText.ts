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
// first letter can turn the whole line around, and a digit or the full stop after it lands on the wrong side. An isolate keeps the name's direction to itself. Every control here is written as an escape,
// never as the character itself, so a reader (and a diff view that flags hidden characters) can see which one it is.

const FSI = '\u2068'; // first-strong isolate: opens an isolate whose direction its own first letter decides
const LRI = '\u2066'; // left-to-right isolate
const RLI = '\u2067'; // right-to-left isolate
const PDI = '\u2069'; // closes the nearest isolate

/** The bidi controls that are not text a narrator reads: the Arabic letter mark, the left and right marks, the embeddings and overrides (U+202A to U+202E) and the isolates (U+2066 to U+2069). */
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
/** A letter of a right-to-left script: a letter in Hebrew, Arabic and its extensions, Syriac, Thaana, N'Ko and the other blocks that read right to left, or their presentation forms (a digit, a vowel mark or a stop in those blocks is not one). */
const RTL_BLOCK = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
const IS_BIDI = new RegExp(BIDI_CONTROLS.source);

/** The text without its bidi controls (the Arabic letter mark, the left and right marks, embeddings, overrides and isolates). */
export const stripBidi = (text: string): string => text.replace(BIDI_CONTROLS, '');
const LETTER = /\p{L}/u;
const isRtlLetter = (ch: string): boolean => RTL_BLOCK.test(ch) && LETTER.test(ch);
const isLatinLetter = (ch: string): boolean => /[A-Za-z]/.test(ch);

/** The characters that end a bidi paragraph or a line (LF, CR, U+001C to U+001E, NEL, the line and paragraph separators): inside a name one would end its isolate and swap its words, so each becomes a space. */
// eslint-disable-next-line no-control-regex
const LINE_BREAKS = /[\n\r\u001C-\u001E\u0085\u2028\u2029]/g;
/** One line or paragraph break, for a test that keeps no state between characters. */
const LINE_BREAK_CHAR = new RegExp(LINE_BREAKS.source);
/** A name as it goes into a sentence: no bidi control and no line or paragraph break of its own. */
const plainName = (name: string): string => stripBidi(name).replace(LINE_BREAKS, ' ');

/**
 * A name inside a sentence, isolated: the direction of its own first strong letter, kept to itself. The name has no bidi control of its own left in it, so the pair is always balanced.
 * `direction` `ltr` isolates it as left to right whatever its letters are (a path in an Arabic sentence).
 */
export const bidiIsolated = (name: string, direction: 'auto' | 'ltr' = 'auto'): string => `${direction === 'ltr' ? LRI : FSI}${plainName(name)}${PDI}`;

/**
 * A name for a toast sentence: isolated when it holds a right-to-left letter, otherwise left as it is (an English name in an English sentence needs no isolate, and the two invisible
 * characters would be in every copy, search and character count of the sentence). Controls of its own are removed either way. A path is isolated `ltr`: the sentence round it stays intact, though folders inside the path can still be drawn in reverse.
 */
export const isolatedIfRtl = (name: string, direction: 'auto' | 'ltr' = 'auto'): string =>
  Array.from(name).some(isRtlLetter) ? bidiIsolated(name, direction) : plainName(name);

/**
 * The direction a message is laid out in: left to right when the app's own words in it (not what is inside an isolate, at any depth) have at least as many Latin letters as right-to-left ones, so a
 * sentence that begins with an Arabic name still reads left to right; otherwise `auto`, so a message that is mostly right to left (an Arabic sentence holding "REAPER") takes the direction of its own first
 * strong letter. ASCII letters on purpose: the app's own language is English, and a Latin letter outside it (an accented one) is not what the app said.
 */
export const textDirection = (text: string): 'ltr' | 'auto' => {
  let latin = 0;
  let rtl = 0;
  let depth = 0;
  for (const ch of text) {
    if (ch === FSI || ch === LRI || ch === RLI) depth++;
    else if (ch === PDI) depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      if (isLatinLetter(ch)) latin++;
      else if (isRtlLetter(ch)) rtl++;
    }
  }
  return latin > 0 && latin >= rtl ? 'ltr' : 'auto';
};

/**
 * A message with its bidi controls removed except the first-strong and left-to-right isolates the app puts round a name or a path, kept when they open and close: a stray close, an unclosed open and
 * an isolate that a removed opener (a right-to-left isolate, an embedding) left unbalanced all go, so no part of a name ends outside its pair. One pass, linear in the message. A line break inside an isolate becomes a space when the isolate is read; if that isolate is dropped later (never closed, or removed with its opener) the space stays.
 */
export const withBalancedIsolates = (text: string): string => {
  const out: string[] = [];
  const open: { at: number; kept: boolean }[] = [];
  for (const ch of text) {
    if (ch === FSI || ch === LRI) {
      open.push({ at: out.length, kept: true });
      out.push(ch);
    } else if (ch === RLI) {
      // Removed, but its close is its own: the close that matches it must go with it, not close a name opened earlier.
      open.push({ at: -1, kept: false });
    } else if (ch === PDI) {
      if (open.pop()?.kept) out.push(ch);
    } else if (open.length > 0 && LINE_BREAK_CHAR.test(ch)) {
      // A break inside an isolate would end it, so the rest of the name is drawn outside it.
      out.push(' ');
    } else if (!IS_BIDI.test(ch)) out.push(ch);
  }
  // An isolate that never closed is removed.
  for (const entry of open) if (entry.kept) out[entry.at] = '';
  return out.join('');
};
