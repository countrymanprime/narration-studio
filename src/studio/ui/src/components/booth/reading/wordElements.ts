/** A word of the Booth text by its sentence and its number in it (`BoothText`'s `data-unit` and `data-word`). */
export type WordSpot = { cur: number; wcur: number };

/**
 * The drawn words at `spots`, null for one that is not in the markup. The chapter's sentences are listed once and each word is looked for
 * inside its own sentence: a selector search per word walks the whole chapter (300,000 nodes in 1,000 paragraphs), and a resize or a scroll of
 * the column measured every page break and bookmark that way (#2630).
 */
export function wordElements(column: ParentNode, spots: readonly WordSpot[]): (HTMLElement | null)[] {
  if (spots.length === 0) return [];
  const units = new Map<number, HTMLElement>();
  for (const unit of column.querySelectorAll<HTMLElement>('[data-unit]')) units.set(Number(unit.dataset.unit), unit);
  return spots.map(({ cur, wcur }) => units.get(cur)?.querySelector<HTMLElement>(`[data-word="${wcur}"]`) ?? null);
}
