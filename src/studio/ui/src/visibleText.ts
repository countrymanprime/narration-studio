// The one test for "this text draws something": a name typed into any field is blank when it is only spaces or only characters that draw nothing
// (zero-width and direction marks, the soft hyphen, the BOM, the braille blank, the hangul filler). `trim()` keeps those, so a field that only
// trims accepts a name nobody can see (#3382 f).

/** Characters that draw nothing, plus white space. */
export const INVISIBLE = new RegExp(String.raw`[\s\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\u2800\u3164\uFEFF]`, 'g');

/** True when the text has at least one character that draws. A value that is not a string has none. */
export const hasVisibleText = (text: unknown): boolean => typeof text === 'string' && text.replace(INVISIBLE, '') !== '';
