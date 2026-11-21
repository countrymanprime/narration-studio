import type { BoothUnit } from '../reading/boothUnits';

/** Where the DAW goes when the Booth opens (useMoveDawOnOpen): the end of the chapter's audio. */
type MoveTarget = { where: 'end' };

/**
 * The place the DAW is moved to when the Booth opens at a chapter: the end of the chapter's audio, whatever place the Booth opened at (#3858: one start
 * rule). A place the narrator chose, a line from the Script, a pickup or a bookmark, is looked up by Record itself when the take starts, so opening no
 * longer sends the DAW to where that line was recorded. Null until the chapter's words are read.
 */
export function useMoveTarget({ units }: { units: readonly BoothUnit[] }): MoveTarget | null {
  return units.length === 0 ? null : { where: 'end' };
}
