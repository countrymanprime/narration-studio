import type { Track, TrackItem } from './contracts/tracks';

/**
 * The track a chapter is linked to and the audio on it. A chapter linked to a folder of voices (the Voice folders layout) has its audio on the
 * folder's children, so a folder answers the items of every track inside it, nested folders included: the tracks after it whose `depth` is greater
 * than its own. A plain track answers its own. Undefined when there is no link or the project does not hold the track. The one place the UI turns a
 * link into items: a page that reads `track.items` of the linked track itself sees an empty folder and says the chapter has no audio.
 */
export function chapterTrackOf(tracks: readonly Track[], guid: string | undefined): { track: Track; items: TrackItem[] } | undefined {
  if (guid === undefined) return undefined;
  const at = tracks.findIndex((candidate) => candidate.guid === guid);
  if (at < 0) return undefined;
  const track = tracks[at];
  const items = [...track.items];
  if (track.isFolder) {
    for (const inner of tracks.slice(at + 1)) {
      if (inner.depth <= track.depth) break;
      items.push(...inner.items);
    }
  }
  return { track, items };
}
