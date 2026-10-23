import type { ManuscriptParagraph } from '../../../api/contracts/manuscript';

/** A note's paragraph and the ones either side of it, and where the note's own words are in it. */
export type Around = {
  before?: string;
  at: string;
  after?: string;
  /** The note's words in `at`, in UTF-16 offsets; absent when they are not found there. */
  mark?: { start: number; end: number };
};

/** Where the `ordinal`th (from 0) `text` is in `paragraph`, or undefined. */
function find(paragraph: string, text: string, ordinal: number): { start: number; end: number } | undefined {
  if (text === '') return undefined;
  let from = 0;
  for (let n = 0; ; n += 1) {
    const start = paragraph.indexOf(text, from);
    if (start < 0) return undefined;
    if (n === ordinal) return { start, end: start + text.length };
    from = start + text.length;
  }
}

/**
 * The paragraph a note names (`manuscript.span.paragraph_id`) and its neighbours in manuscript order, for Show where on Proof and
 * Pickups (research note A4 and A5). `words` marks the note's script text in the paragraph, the `ordinal`th occurrence for a repeat
 * (the finding id's own ordinal, findings-contract.md). The span's character offsets are not used: the contract gives no unit for them.
 */
export function paragraphsAround(
  paragraphs: readonly ManuscriptParagraph[],
  paragraphId: string | null | undefined,
  words?: { text: string; ordinal?: number },
): Around | undefined {
  if (!paragraphId) return undefined;
  const ordered = [...paragraphs].sort((a, b) => a.index - b.index);
  const at = ordered.findIndex((p) => p.id === paragraphId);
  if (at < 0) return undefined;
  const text = ordered[at].text;
  const mark = words ? find(text, words.text, words.ordinal ?? 0) : undefined;
  return { before: ordered[at - 1]?.text, at: text, after: ordered[at + 1]?.text, ...(mark ? { mark } : {}) };
}
