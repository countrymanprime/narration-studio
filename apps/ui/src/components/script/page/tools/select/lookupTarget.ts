import type { GuideEntity } from '../../../../../api/contracts/storyBible';
import { wordKey } from '../../data/script.selectors';

/** Where "Look up" sends the narrator: the entry the text names, else the word card for a single word, else the Story Bible tab with the text offered as a new entry. */
export type LookupTarget = { tab: 'bible'; entryId: string } | { tab: 'pron'; word: string } | { tab: 'bible'; miss: string };

const sameName = (a: string, b: string): boolean => wordKey(a) === wordKey(b);

export function lookupTarget(text: string, entries: readonly GuideEntity[]): LookupTarget {
  const entry = entries.find((row) => sameName(row.canonical_name, text) || row.aliases.some((alias) => sameName(alias.text, text)));
  if (entry) return { tab: 'bible', entryId: entry.id };
  const trimmed = text.trim();
  if (trimmed && !/\s/.test(trimmed)) return { tab: 'pron', word: wordKey(trimmed) };
  return { tab: 'bible', miss: trimmed };
}
