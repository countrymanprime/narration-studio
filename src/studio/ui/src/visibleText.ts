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
/**
 * A right-to-left character that is not a letter but is strong all the same (bidi class R or AL): the Arabic and Hebrew punctuation (U+05BE, U+05C0, U+05C3, U+05C6, U+05F3, U+05F4, U+061B to U+061F), the rial and
 * Afghani signs, Syriac and Samaritan punctuation, N'Ko digits, and the same kinds in Adlam, Hanifi Rohingya and the other right-to-left scripts. A name made of these has no letter, and with none of them isolated a count
 * after it is drawn before it. The comma (U+060C), the digits (Arabic-Indic, extended, U+066B and U+066C), the percent sign U+066A, the marks (class NSM) and the zero-width non-joiner are weak or neutral: they take the
 * direction round them, so a name that holds only those stays bare.
 *
 * Generated, not hand-picked: every assigned code point of Unicode 15.0 (Python 3.12 `unicodedata`) whose bidi class is R or AL and whose category is not a letter (L*), less the bidi controls this module strips
 * (U+061C, U+200E, U+200F, U+202A to U+202E, U+2066 to U+2069); merged into ranges, plus U+10D8E and U+10D8F (the Garay plus and minus signs, class R, added in Unicode 16.0, which Python's data does not have). JavaScript
 * has no Bidi_Class property escape, so the table is written out; a character a later Unicode version adds (U+10EC9 and U+10ECA in 18.0) is missed by a name made only of it until the table is made again. The test holds the
 * table as data and checks every code point of the right-to-left blocks against it, so a range that loses or gains a code point fails. `textDirection` does not count these: it counts the right-to-left letters, on purpose.
 */
const RTL_STRONG_NOT_LETTER =
  /[\u05BE\u05C0\u05C3\u05C6\u05F3-\u05F4\u0608\u060B\u060D\u061B\u061D-\u061F\u066D\u06D4\u06FD-\u06FE\u0700-\u070D\u070F\u07C0-\u07C9\u07FE-\u07FF\u0830-\u083E\u085E\u0888\uFBB2-\uFBC2\uFDFC\u{10857}-\u{1085F}\u{10877}-\u{1087F}\u{108A7}-\u{108AF}\u{108FB}-\u{108FF}\u{10916}-\u{1091B}\u{1093F}\u{109BC}-\u{109BD}\u{109C0}-\u{109CF}\u{109D2}-\u{109FF}\u{10A40}-\u{10A48}\u{10A50}-\u{10A58}\u{10A7D}-\u{10A7F}\u{10A9D}-\u{10A9F}\u{10AC8}\u{10AEB}-\u{10AF6}\u{10B58}-\u{10B5F}\u{10B78}-\u{10B7F}\u{10B99}-\u{10B9C}\u{10BA9}-\u{10BAF}\u{10CFA}-\u{10CFF}\u{10D8E}-\u{10D8F}\u{10EAD}\u{10F1D}-\u{10F26}\u{10F51}-\u{10F59}\u{10F86}-\u{10F89}\u{10FC5}-\u{10FCB}\u{1E8C7}-\u{1E8CF}\u{1E950}-\u{1E959}\u{1E95E}-\u{1E95F}\u{1EC71}-\u{1ECB4}\u{1ED01}-\u{1ED3D}]/u;
const isStrongRtl = (ch: string): boolean => isRtlLetter(ch) || RTL_STRONG_NOT_LETTER.test(ch);
const isLatinLetter = (ch: string): boolean => /[A-Za-z]/.test(ch);

/**
 * The characters that end a bidi paragraph or a line (LF, CR, U+001C to U+001E, NEL, the line and paragraph separators) or are a bidi segment separator (the line tabulation U+000B and the unit separator U+001F):
 * inside a name one would end its isolate or split its words into runs that are laid out on their own, so each becomes a space.
 */
// eslint-disable-next-line no-control-regex
const LINE_BREAKS = /[\n\r\u000B\u001C-\u001F\u0085\u2028\u2029]/g;
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
 * A name for a toast sentence: isolated when it holds a strong right-to-left character (a letter, or a non-letter of class R or AL, see `RTL_STRONG_NOT_LETTER`), otherwise left as it is (an English name in an English sentence needs no isolate, and the two invisible
 * characters would be in every copy, search and character count of the sentence). Controls of its own are removed either way. A path is isolated `ltr`: the sentence round it stays intact, though folders inside the path can still be drawn in reverse.
 */
export const isolatedIfRtl = (name: string, direction: 'auto' | 'ltr' = 'auto'): string =>
  Array.from(plainName(name)).some(isStrongRtl) ? bidiIsolated(name, direction) : plainName(name);

/** A character that joins the word it is in: a letter, a combining mark, the zero-width joiner and non-joiner. */
const INSIDE_A_WORD = /[\p{L}\p{M}\u{200C}\u{200D}]/u;

/**
 * A sentence the host worded that names someone ("Replaced 2 words with Sara's audio in REAPER."): the name in it isolated left to right the way `isolatedIfRtl(name, 'ltr')` does, so a right-to-left name keeps its own run and the
 * words after it stay where they were written. The sentence is left as it is when it does not hold the name (the host worded it another way), when the name is empty, or where the name is part of a longer word or already
 * directly inside an isolate.
 */
export const isolateNameIn = (sentence: string, name: string): string => {
  // The host trims the name it words into a sentence (Go `strings.TrimSpace`; JavaScript's trim differs on U+0085 and U+FEFF), so the trimmed name is what the sentence holds.
  const candidate = name.trim();
  if (candidate === '') return sentence;
  // Left to right, as the page draws a name written in plain text (the replaced-stretch mark, the Name fields): a first-strong isolate would draw an Arabic name followed by "(Sara) 2" with the 2 on its left.
  const isolated = isolatedIfRtl(candidate, 'ltr');
  let out = '';
  let from = 0;
  for (let at = sentence.indexOf(candidate); at !== -1; at = sentence.indexOf(candidate, at + candidate.length)) {
    const end = at + candidate.length;
    const before = Array.from(sentence.slice(Math.max(0, at - 2), at)).at(-1) ?? '';
    const after = Array.from(sentence.slice(end, end + 2))[0] ?? '';
    // A match next to a letter, a combining mark or a joiner is inside a longer word, not the name (a one-letter name inside an Arabic word would split its joining letters).
    if (INSIDE_A_WORD.test(before) || INSIDE_A_WORD.test(after)) continue;
    // Already directly inside an isolate that the overlay keeps (the host may isolate it one day, #4126). A right-to-left isolate does not count: the overlay removes it with its close, and the name would be bare.
    if ((before === FSI || before === LRI) && after === PDI) continue;
    out += sentence.slice(from, at) + isolated;
    from = end;
  }
  return from > 0 ? out + sentence.slice(from) : sentence;
};

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
 * an isolate that a removed right-to-left isolate (U+2067) left unbalanced all go, so no part of a name ends outside its pair. Only isolate openers (U+2066, U+2067, U+2068) go on the stack: an embedding or override (U+202A to U+202E) is removed on its own and never opens a pair, and a U+2069 closes the last isolate opener only. One pass, linear in the message. A line break inside an isolate becomes a space when the isolate is read; if that isolate is dropped later (never closed, or removed with its opener) the space stays.
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
