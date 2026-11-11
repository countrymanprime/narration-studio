import type { TrackMapping } from '../../types';

/**
 * A chapter's link to a REAPER track, read one way for every screen (#3363). The host can hold several confirmed mappings for one chapter
 * (a link made by track upserts, it does not replace), and the screens used to read that list five ways: the first mapping, no link at all
 * when there were two, or every chapter per track. `several` is the one answer: the chapter has more than one link, so it is not linked to
 * one track; `trackGuid` is still the first of them, for a screen that plays what the chapter has (Editing, Proof, Pickups) and can go on,
 * while one that must pick a single track to act on (the Booth's record target) refuses.
 */
/** The one vocabulary for a chapter's link to a track, on every screen (#3368). `missing` is a link to a track the project no longer has; the
 * wire's own words for the same states (`unlinked`, `several_links`, `unmapped_track`) stay the host's and are read once, where they arrive. */
export type ChapterLinkState = 'unlinked' | 'linked' | 'missing' | 'several';

/** What each state is called wherever it is named, so a page does not write its own ("Missing", "Track missing", "not linked"). */
export const LINK_STATE_LABEL: Record<ChapterLinkState, string> = {
  unlinked: 'Not linked',
  linked: 'Linked',
  missing: 'Track missing',
  several: 'Several tracks',
};

export type ChapterLink = {
  state: Exclude<ChapterLinkState, 'missing'>;
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

/** The chapter's state once the project's tracks are known: `missing` when it is linked to one track and the project no longer has it. One place
 * decides it, for the Engine rows and the Editing source alike. */
export function linkStateOf(link: ChapterLink, trackExists: boolean): ChapterLinkState {
  if (link.state === 'linked' && !trackExists) return 'missing';
  return link.state;
}

/** The state's name as a label, in the project's words: a Voice folders chapter is linked to folders, not tracks. */
export function linkStateLabel(state: ChapterLinkState, folders: boolean): string {
  return state === 'several' && folders ? 'Several folders' : LINK_STATE_LABEL[state];
}
