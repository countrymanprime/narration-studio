import { createContext, useContext } from 'react';
import type { Replacement } from '../../../../api/contracts/replace';

/** Where the chapter's replacements still in place are drawn: a mark after the last word of each, naming whose audio plays there. */
export interface ReplacementMarks {
  /** Replacements by the key (`paragraphId:ordinal`) of their last word. */
  at: ReadonlyMap<string, Replacement>;
  /** Every word key a replacement in place covers. */
  keysOf: ReadonlySet<string>;
  /** Put my audio back. */
  restore: (replacement: Replacement) => Promise<void>;
}

export const ReplacementMarksContext = createContext<ReplacementMarks | null>(null);

/** The replacement whose last word is `key`, and what the mark can do with it; null outside the page or for any other word. */
export function useReplacementMark(key: string): { replacement: Replacement; restore: ReplacementMarks['restore'] } | null {
  const marks = useContext(ReplacementMarksContext);
  const replacement = marks?.at.get(key);
  return marks && replacement ? { replacement, restore: marks.restore } : null;
}
