// The chapter track button's state: one of seven states from a ChapterTrackLink, each with a distinct look and an accessible name that says
// the state out loud, since colour is never the only signal (WCAG 1.4.1).
import type { ChapterTrackLink } from '../../types';
import { plural } from '../../plural';

export type ChapterTrackButtonState =
  | { kind: 'linked'; trackName: string; trackGuid: string }
  | { kind: 'renamed'; trackName: string; trackGuid: string }
  | { kind: 'suggested'; trackName: string; trackGuid: string }
  | { kind: 'ambiguous'; count: number }
  | { kind: 'missing' }
  | { kind: 'unlinked' };

/** Derives the button's state from one chapter's link (the matcher's status, its warnings and its confirmed links).
 * A missing track wins over every other signal: a chapter cannot be "linked" to a track that is gone. */
export function chapterTrackButtonState(link: ChapterTrackLink): ChapterTrackButtonState {
  if (link.warnings.includes('confirmed-track-missing')) return { kind: 'missing' };
  if (link.status === 'ambiguous' || link.warnings.includes('confirmed-links-conflict')) {
    return { kind: 'ambiguous', count: Math.max(link.candidates.length, link.links.length, 2) };
  }
  if (link.status === 'confirmed' && link.track) {
    const state = link.warnings.includes('confirmed-track-renamed') ? 'renamed' : 'linked';
    return { kind: state, trackName: link.track.trackName, trackGuid: link.track.trackGuid };
  }
  if ((link.status === 'matched' || link.status === 'uncertain') && link.track) {
    return { kind: 'suggested', trackName: link.track.trackName, trackGuid: link.track.trackGuid };
  }
  return { kind: 'unlinked' };
}

/**
 * A chapter's link as the project's tracks are now (the shared state's list: REAPER's when it has the project open, else the saved file's), for
 * a screen that draws from the per-chapter read. A confirmed link to one track the list no longer has is missing, one that is there is not (and
 * is drawn under its name now), and a chapter with several links is several however many of their tracks are there, as the Engine row says
 * (#3415). Not followed: a missing warning on a track the list now has (an undone delete); the next read of the links settles it.
 */
export function followLiveTracks(link: ChapterTrackLink, tracks: readonly { guid: string; name: string }[] | undefined): ChapterTrackLink {
  if (!tracks) return link;
  // Several links are several links, whichever of their tracks is there: the Engine row says so, so the panel does not call it missing.
  if (link.links.length > 1) {
    const warnings = link.warnings.filter((warning) => warning !== 'confirmed-track-missing');
    return warnings.length === link.warnings.length && link.warnings.includes('confirmed-links-conflict')
      ? link
      : { ...link, warnings: warnings.includes('confirmed-links-conflict') ? warnings : [...warnings, 'confirmed-links-conflict'] };
  }
  if (link.status !== 'confirmed' || link.links.length !== 1) return link;
  const live = tracks.find((track) => track.guid === link.links[0].trackGuid);
  if (!live) {
    return link.warnings.includes('confirmed-track-missing') ? link : { ...link, warnings: [...link.warnings, 'confirmed-track-missing'] };
  }
  return link.track && link.track.trackName !== live.name ? { ...link, track: { ...link.track, trackName: live.name } } : link;
}

/** The track REAPER may be asked to show for a chapter: only a confirmed link to a track that is in the saved project. A suggestion, an
 * ambiguous match and a missing track have none. The row menu and the chapter track panel both read it, so they are on or off together. */
export function showableTrackGuid(link: ChapterTrackLink | undefined): string | undefined {
  const state = link && chapterTrackButtonState(link);
  return state?.kind === 'linked' || state?.kind === 'renamed' ? state.trackGuid : undefined;
}

/** The button's accessible name (Solution Detail's examples: "Track for Chapter 6: CHAPTER SIX, linked"). */
export function chapterTrackButtonLabel(chapterTitle: string, state: ChapterTrackButtonState): string {
  switch (state.kind) {
    case 'linked':
      return `Track for ${chapterTitle}: ${state.trackName}, linked`;
    case 'renamed':
      return `Track for ${chapterTitle}: linked, track renamed to ${state.trackName}`;
    case 'suggested':
      return `Track for ${chapterTitle}: suggested ${state.trackName}, not confirmed`;
    case 'ambiguous':
      return `Track for ${chapterTitle}: ${plural(state.count, 'possible track')}, choose one`;
    case 'missing':
      return `Track for ${chapterTitle}: linked track is missing`;
    case 'unlinked':
      return `Track for ${chapterTitle}: not linked`;
  }
}
