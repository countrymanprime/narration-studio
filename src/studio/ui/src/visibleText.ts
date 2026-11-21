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
export const visibleKey = (text: string): string => text.replace(/[\p{Cf}\p{Cc}\p{Default_Ignorable_Code_Point}]/gu, '').replace(FILLERS, '');
