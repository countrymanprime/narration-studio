import type { PickupItem } from '../../../api/contracts/pickups';
import type { BoothUnit } from '../reading/boothUnits';

// The pickup session's lines and what is drawn from them (the Studio Next mock's `sessionLines`, `nextPick` and the pickup branch of
// `stopTake` in `state/commands/booth.ts`). Pure: the list and the text arrive as input.

/** The lines the session names, in the order it named them; an id the list no longer holds is dropped. */
export function sessionLines(list: readonly PickupItem[], ids: readonly string[]): PickupItem[] {
  return ids.map((id) => list.find((item) => item.id === id)).filter((item): item is PickupItem => !!item);
}

/** How many of the lines are still to record. */
export const openCount = (lines: readonly PickupItem[]): number => lines.filter((item) => !item.done).length;

/** The bar in the text beside each placed line of this chapter: `BoothText`'s `pickupLines`. */
export function pickupBars(lines: readonly PickupItem[], chapterId: string): Array<{ paragraphId: string; done: boolean }> {
  return lines.flatMap((item) => (item.chapterId === chapterId && item.paragraphId ? [{ paragraphId: item.paragraphId, done: item.done }] : []));
}

/** The line after (or before) the current one, across chapters, wrapping at the ends. With no current line: the first (or last). */
export function nextLine(lines: readonly PickupItem[], currentId: string | null, direction: 1 | -1): PickupItem | undefined {
  if (lines.length === 0) return undefined;
  const index = lines.findIndex((item) => item.id === currentId);
  if (index < 0) return direction === 1 ? lines[0] : lines[lines.length - 1];
  return lines[(index + direction + lines.length) % lines.length];
}

/** The index of a line's first sentence in the chapter's units, or -1 when its paragraph is not in the text. */
const unitOf = (item: PickupItem, units: readonly BoothUnit[]): number => units.findIndex((unit) => unit.paragraphId === item.paragraphId);

/**
 * The open lines of this chapter that a take read over: those whose paragraph lies between the sentence it began on and the one it
 * stopped on, either way round (a punch can begin after where the take stopped). A line the take stopped before stays open.
 */
export function ranOver(lines: readonly PickupItem[], chapterId: string, units: readonly BoothUnit[], began: number, stopped: number): string[] {
  const from = Math.min(began, stopped);
  const to = Math.max(began, stopped);
  return lines
    .filter((item) => {
      if (item.done || item.chapterId !== chapterId || !item.paragraphId) return false;
      const at = unitOf(item, units);
      return at >= from && at <= to;
    })
    .map((item) => item.id);
}
