import type { ChapterDoc } from './doc';

const normal = (text: string): string => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * The words a finding names: the `ordinal`-th match (the first is 0) of its `expected` text among the script words of paragraph `pid`, compared
 * without case or punctuation. Empty when the paragraph or the text is not there, so the caller falls back to the passage.
 */
export function findingWords(doc: ChapterDoc, pid: string, expected: string, ordinal = 0): string[] {
  const want = expected.split(/\s+/).map(normal).filter(Boolean);
  const words = doc.items.filter((i) => i.pid === pid && i.kind === 'w');
  if (!want.length || words.length < want.length) return [];
  let seen = 0;
  for (let at = 0; at + want.length <= words.length; at++) {
    if (!want.every((w, i) => normal(words[at + i].text) === w)) continue;
    if (seen++ === ordinal) return words.slice(at, at + want.length).map((i) => i.key);
  }
  return [];
}
