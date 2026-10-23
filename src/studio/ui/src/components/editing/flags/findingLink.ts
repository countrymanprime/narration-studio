import type { Finding } from '../../../api/contracts/findings';
import { findingWords, type ChapterDoc } from '../model';

/** The kinds of finding that say what was heard against the script's words: the ones a flagged word can be. */
const WORD_CATEGORIES: ReadonlySet<string> = new Set(['transcript_discrepancy', 'pickup']);

/**
 * The findings of this chapter that name any of the flagged words (`paragraphId:ordinal` keys): a note on Proof whose expected text,
 * found in its paragraph by `findingWords` (its ordinal says which repeat), overlaps them. This is how Editing's accept and Mark for
 * pickup reach the same finding Proof decides (research note A2), so a decision made on either page shows on both. A finding with no
 * expected text (words said and not written) names no script words and is never matched.
 */
export function findingsAt(doc: ChapterDoc, chapterId: string, findings: readonly Finding[], keys: readonly string[]): Finding[] {
  if (keys.length === 0) return [];
  const flagged = new Set(keys);
  return findings.filter((finding) => {
    const m = finding.manuscript;
    if (!m || m.chapter_id !== chapterId || !WORD_CATEGORIES.has(finding.category) || !m.span?.paragraph_id || !m.expected) return false;
    return findingWords(doc, m.span.paragraph_id, m.expected, m.span.ordinal ?? 0).some((key) => flagged.has(key));
  });
}
