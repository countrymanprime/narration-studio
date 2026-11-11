/** Characters that draw nothing: white space, every default-ignorable code point (zero-width, variation selectors, tags, the filler characters) and the blank braille and Hangul fillers. */
const INVISIBLE = new RegExp('[\\s\\p{Default_Ignorable_Code_Point}\\u2800\\u3164]', 'gu');

/**
 * A host's sentence for why a press ended, or `fallback` when it has no words (nothing, spaces, a zero-width space): the message service draws nothing for such a
 * sentence, and a press that ends in silence is the one thing a refusal must not do.
 */
export function sentenceOr(text: string | undefined | null, fallback: string): string {
  return text && text.replace(INVISIBLE, '') !== '' ? text.trim() : fallback;
}
