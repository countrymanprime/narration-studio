/** Characters that draw nothing: a message made only of them (and spaces) says nothing. */
const INVISIBLE = new RegExp('[\\s\\u00AD\\u061C\\u180E\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]', 'g');

/**
 * A host's sentence for why a press ended, or `fallback` when it has no words (nothing, spaces, a zero-width space): the message service draws nothing for such a
 * sentence, and a press that ends in silence is the one thing a refusal must not do.
 */
export function sentenceOr(text: string | undefined | null, fallback: string): string {
  return text && text.replace(INVISIBLE, '') !== '' ? text.trim() : fallback;
}
