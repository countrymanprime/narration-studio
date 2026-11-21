import { hasVisibleText } from '../../../visibleText';

/**
 * A host's sentence for why a press ended, or `fallback` when it has no words: nothing, spaces, or only characters that draw nothing (zero-width, controls, format
 * characters, the filler characters, a combining mark with no letter). The message service draws nothing for such a sentence, and a press that ends in silence is the one
 * thing a refusal must not do. A real sentence with invisible characters around it is kept.
 */
export function sentenceOr(text: unknown, fallback: string): string {
  // A host's answer is not typed: a number, a flag or an object where a sentence belongs says nothing.
  return hasVisibleText(text) ? (text as string).trim() : fallback;
}
