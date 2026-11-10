import type { TrackMapping } from '../../types';

/** The sentence refusing a link that would take `trackGuid` from another chapter, or '' when no other chapter holds it. The in-panel pickers
 * (Editing check, Check recordings) link a chapter that has no link yet; chapterTrackMapConfirm replaces whichever chapter held the track
 * without saying so (#3053), so they ask first and leave the move to the Chapter links list, which names the chapter that loses it. */
export function trackHeldByOther(mappings: readonly TrackMapping[], trackGuid: string, chapterId: string): string {
  const holder = mappings.find((mapping) => mapping.trackGuid === trackGuid && mapping.chapterId !== chapterId);
  return holder ? `That track is already linked to ${holder.chapterTitle}. Choose another track, or unlink it from ${holder.chapterTitle} first.` : '';
}
