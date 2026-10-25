import type { ChapterTrackMatch, TrackMapping } from '../../api/contracts/chapterTrackMap';
import type { Track } from '../../types';

/** One track the narrator can link a chapter to: `best` is the matcher's pick, `heldBy` the chapter the track is linked to now, if another one. */
export type TrackChoice = { guid: string; name: string; best: boolean; heldBy?: string };

const nameOf = (track: { name: string; index: number }): string => track.name || `Track ${track.index + 1}`;

/**
 * The tracks the chapter-track matcher (`chapterTrackMatch`, src/studio/desktop/chaptermatch.go) offers for a chapter: its candidates first, best
 * first, then every other track in project order. Only the closest track is preselected, and a tie or no match preselects nothing: the narrator
 * picks. `links` (every confirmed link) says which tracks another chapter holds.
 */
export function trackChoices(match: ChapterTrackMatch, links: readonly TrackMapping[] = [], chapterId = match.chapterId): TrackChoice[] {
  const named = new Map(match.tracks.map((t) => [t.guid, nameOf(t)]));
  const ranked = match.candidates.filter((c) => named.has(c.trackGuid)).map((c) => c.trackGuid);
  const order = [...ranked, ...match.tracks.map((t) => t.guid).filter((g) => !ranked.includes(g))];
  const best = match.status === 'ambiguous' || match.status === 'none' ? null : (match.track?.trackGuid ?? ranked[0] ?? null);
  return order.map((guid) => {
    const holder = links.find((l) => l.trackGuid === guid && l.chapterId !== chapterId);
    return { guid, name: named.get(guid) ?? guid, best: guid === best, ...(holder ? { heldBy: holder.chapterTitle } : {}) };
  });
}

/** The part of a confirmed link that says which chapter holds a track. */
export type TrackHolder = Pick<TrackMapping, 'trackGuid' | 'chapterId' | 'chapterTitle'>;

/**
 * The same choices for a list of tracks with no match behind it (the engine panel's Chapter links, the recording check): project order, nothing
 * preselected. `links` and `chapterId` name the tracks another chapter holds, as `trackChoices` does.
 */
export const plainTrackChoices = (tracks: readonly Track[], links: readonly TrackHolder[] = [], chapterId?: string): TrackChoice[] =>
  tracks.map((t) => {
    const holder = links.find((l) => l.trackGuid === t.guid && l.chapterId !== chapterId);
    return { guid: t.guid, name: nameOf(t), best: false, ...(holder ? { heldBy: holder.chapterTitle } : {}) };
  });

/** The track to preselect: the matcher's best, or null. */
export const bestChoice = (choices: readonly TrackChoice[]): string | null => choices.find((c) => c.best)?.guid ?? null;
