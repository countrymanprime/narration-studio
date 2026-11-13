import type { ChapterTrackMatch, TrackMapping } from '../../api/contracts/chapterTrackMap';
import type { Track } from '../../types';
import { trackName } from '../tracks/trackName';
import { keptTitle } from '../chapterTracks/useChapterLinkActions';

/**
 * The name a track's holder is shown by in "(linked to X)": the manuscript's current heading when the caller has it, else the title the host kept with
 * the link, cleaned and clipped by the one rule the takeover sentence uses (`keptTitle`), else "another chapter" (an empty name left the label off,
 * or read "linked to " with no one). One rule and one source for every picker (#3398).
 */
export function holderName(current: string | undefined, kept: string | undefined): string {
  return keptTitle(current) ?? keptTitle(kept) ?? 'another chapter';
}

/** Names a chapter by the manuscript's current heading, when the caller has the manuscript (`useChapterNameOf`). */
export type ChapterNameOf = (chapterId: string) => string | undefined;

/** The link of a track another chapter holds, or undefined: every picker finds a holder here, so none disagrees with another about who it is. */
export const holderOf = <T extends { trackGuid: string; chapterId: string }>(links: readonly T[], trackGuid: string, chapterId?: string): T | undefined =>
  links.find((link) => link.trackGuid === trackGuid && link.chapterId !== chapterId);

/** What says who holds a track ("linked to X") and a track's option text with it: the one place the template is written (`holderTemplate.guard.test.ts`). */
export const heldNote = (heldBy: string): string => `linked to ${heldBy}`;
export const heldLabel = (name: string, heldBy?: string): string => (heldBy ? `${name} (${heldNote(heldBy)})` : name);

/** One track the narrator can link a chapter to: `best` is the matcher's pick, `heldBy` the chapter the track is linked to now, if another one. */
export type TrackChoice = {
  guid: string;
  name: string;
  best: boolean;
  heldBy?: string;
  /** The track's place in the project and its REAPER folder depth; absent on a flat list, which the picker draws as a plain select. */
  index?: number;
  depth?: number;
  isFolder?: boolean;
  /** False for a folder with no audio of its own, which cannot be a link target. */
  hasAudio?: boolean;
  color?: string;
};

type Placed = { index: number; depth: number; isFolder: boolean; items?: readonly unknown[]; hasAudio?: boolean; color?: string };
const placement = (t: Placed): Pick<TrackChoice, 'index' | 'depth' | 'isFolder' | 'hasAudio' | 'color'> => ({
  index: t.index,
  depth: t.depth,
  isFolder: t.isFolder,
  color: t.color ?? '',
  hasAudio: t.hasAudio ?? (t.items?.length ?? 0) > 0,
});

/**
 * The tracks the chapter-track matcher (`chapterTrackMatch`, src/studio/desktop/chaptermatch.go) offers for a chapter: its candidates first, best
 * first, then every other track in project order. Only the closest track is preselected, and a tie or no match preselects nothing: the narrator
 * picks. `links` (every confirmed link) says which tracks another chapter holds.
 */
export function trackChoices(
  match: ChapterTrackMatch,
  links: readonly TrackMapping[] = [],
  chapterId = match.chapterId,
  nameOf?: ChapterNameOf,
): TrackChoice[] {
  const named = new Map(match.tracks.map((t) => [t.guid, trackName(t.name, t.index)]));
  const summaries = new Map(match.tracks.map((t) => [t.guid, t]));
  const ranked = match.candidates.filter((c) => named.has(c.trackGuid)).map((c) => c.trackGuid);
  const order = [...ranked, ...match.tracks.map((t) => t.guid).filter((g) => !ranked.includes(g))];
  const best = match.status === 'ambiguous' || match.status === 'none' ? null : (match.track?.trackGuid ?? ranked[0] ?? null);
  return order.map((guid) => {
    const holder = holderOf(links, guid, chapterId);
    const summary = summaries.get(guid);
    return {
      guid,
      name: named.get(guid) ?? guid,
      best: guid === best,
      ...(summary ? placement(summary) : {}),
      ...(holder ? { heldBy: holderName(nameOf?.(holder.chapterId), holder.chapterTitle) } : {}),
    };
  });
}

/** The part of a confirmed link that says which chapter holds a track. */
type TrackHolder = Pick<TrackMapping, 'trackGuid' | 'chapterId' | 'chapterTitle'>;

/**
 * The same choices for a list of tracks with no match behind it (the engine panel's Chapter links, the recording check): project order, nothing
 * preselected. `links` and `chapterId` name the tracks another chapter holds, as `trackChoices` does.
 */
export const plainTrackChoices = (tracks: readonly Track[], links: readonly TrackHolder[] = [], chapterId?: string, nameOf?: ChapterNameOf): TrackChoice[] =>
  tracks.map((t) => {
    const holder = holderOf(links, t.guid, chapterId);
    return {
      guid: t.guid,
      name: trackName(t.name, t.index),
      best: false,
      ...placement(t),
      ...(holder ? { heldBy: holderName(nameOf?.(holder.chapterId), holder.chapterTitle) } : {}),
    };
  });

/** The track to preselect: the matcher's best, or null. */
export const bestChoice = (choices: readonly TrackChoice[]): string | null => choices.find((c) => c.best)?.guid ?? null;
