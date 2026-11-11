/** Fillers that are letters or symbols to Unicode and draw nothing: the blank braille pattern and the Hangul fillers. */
const FILLERS = new RegExp('[\\u2800\\u115F\\u1160\\u3164\\uFFA0]', 'g');

/** A character that draws something: a letter, a number, punctuation or a symbol. White space, controls, format characters, fillers and lone combining marks do not. */
const DRAWS = /[\p{L}\p{N}\p{P}\p{S}]/u;

/**
 * A host's sentence for why a press ended, or `fallback` when it has no words: nothing, spaces, or only characters that draw nothing (zero-width, controls, format
 * characters, the filler characters, a combining mark with no letter). The message service draws nothing for such a sentence, and a press that ends in silence is the one
 * thing a refusal must not do. A real sentence with invisible characters around it is kept.
 */
export function sentenceOr(text: string | undefined | null, fallback: string): string {
  return text && DRAWS.test(text.replace(FILLERS, '')) ? text.trim() : fallback;
}
