import type { ManuscriptContentKind } from '../../api/contracts/manuscript';

/** How a removed chapter's new kind reads in a sentence: "removed today as not a chapter". A chapter is only ever removed as that, so every kind
 * reads the same; `narration` never appears here - a chapter holding it isn't removed. */
export function removalKindLabel(_kind: ManuscriptContentKind): string {
  return 'not a chapter';
}

const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "today" / "yesterday" / a plain date, for "removed <when> as <kind>". */
export function removedWhenLabel(kindChangedAt: string, now: Date): string {
  const changed = new Date(kindChangedAt);
  if (isSameDay(changed, now)) return 'today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(changed, yesterday)) return 'yesterday';
  return changed.toLocaleDateString(undefined, { dateStyle: 'medium' });
}
