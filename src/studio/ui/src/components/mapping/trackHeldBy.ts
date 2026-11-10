import type { TrackMapping } from '../../types';

/** The sentence refusing a link that would take `trackGuid` from another chapter, or '' when no other chapter holds it. The in-panel pickers
 * (Editing check, Check recordings) link a chapter that has no link yet; chapterTrackMapConfirm replaces whichever chapter held the track
 * without saying so (#3053), so they ask first, refuse with this sentence as a toast, and leave the move to the Chapter links list, which
 * names the chapter that loses it. */
export function trackHeldByOther(mappings: readonly TrackMapping[], trackGuid: string, chapterId: string): string {
  const holder = mappings.find((mapping) => mapping.trackGuid === trackGuid && mapping.chapterId !== chapterId);
  return holder ? `That track is already linked to ${holder.chapterTitle}. Unlink it there first, or pick another track.` : '';
}

/** The title the host kept with a displaced chapter's link, trimmed, or undefined when it is empty: the takeover notices then say "a chapter no
 * longer in the manuscript", so none is silent or reads "It was linked to , which is now unlinked" (#3053). */
export function keptTitle(storedTitle: string | undefined): string | undefined {
  return storedTitle?.trim() || undefined;
}
