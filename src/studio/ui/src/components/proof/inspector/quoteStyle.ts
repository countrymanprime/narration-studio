/** A quote's box: the Studio Next mock's `.quote`, a fill and no border, so read-only text does not read as a text box (alignment audit
 * R4TB-5). `raised` is the mock's raised surface on the card; `surface` is the card's own, for a quote on a tinted banner. */
export function quoteClass(fill: 'raised' | 'surface'): string {
  return `rounded-[var(--radius-card)] px-3 py-2 text-sm [overflow-wrap:anywhere] ${fill === 'raised' ? 'bg-[var(--surface-2)]' : 'bg-[var(--surface)]'}`;
}

/** The mock's `.diff`: a word the reading lacks is struck on the danger tint, a word heard instead is on the ok tint (no underline, which
 * read as a link); the shape and the tint both say it, not the colour alone. */
export const DIFF_CLASS = {
  del: 'rounded-[0.2rem] bg-[var(--danger-soft)] px-0.5 font-medium text-[var(--danger-text)] line-through',
  ins: 'rounded-[0.2rem] bg-[var(--ok-soft)] px-0.5 font-medium text-[var(--ok-text)] no-underline',
} as const;
