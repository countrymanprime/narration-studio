import type { TrackMapping } from '../../types';

/**
 * A chapter's link to a REAPER track, read one way for every screen (#3363). The host can hold several confirmed mappings for one chapter
 * (a link made by track upserts, it does not replace), and the screens used to read that list five ways: the first mapping, no link at all
 * when there were two, or every chapter per track. `several` is the one answer: the chapter has more than one link, so it is not linked to
 * one track; `trackGuid` is still the first of them, for a screen that plays what the chapter has (Editing, Proof, Pickups) and can go on,
 * while one that must pick a single track to act on (the Booth's record target) refuses.
 */
export type ChapterLink = {
  state: 'unlinked' | 'linked' | 'several';
  /** The chapter's track: the one link, or the first of several; undefined when unlinked. */
  trackGuid?: string;
  /** Every confirmed mapping of the chapter, in the host's order. */
  mappings: TrackMapping[];
};

/** The chapter `chapterId`'s link among `mappings` (the host's confirmed mappings, every chapter's). */
export function chapterLink(mappings: readonly TrackMapping[], chapterId: string): ChapterLink {
  const mine = mappings.filter((mapping) => mapping.chapterId === chapterId);
  if (mine.length === 0) return { state: 'unlinked', mappings: mine };
  return { state: mine.length === 1 ? 'linked' : 'several', trackGuid: mine[0].trackGuid, mappings: mine };
}
