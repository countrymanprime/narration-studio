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

/**
 * The items each chapter owns when several chapters are linked, so an item is never answered for two of them. `links` maps a chapter to the track
 * guid it is linked to. A linked folder owns the items of every voice inside it, nested folders included, except those under a track linked to
 * another chapter: an item belongs to the chapter linked to the nearest linked track above it (the track itself counts). A chapter with no items, or
 * whose track the project does not hold, is absent from the answer. The one place the UI splits a project's items between chapters.
 */
export function chapterItemsByNearestLink(tracks: readonly Track[], links: ReadonlyMap<string, string>): Map<string, TrackItem[]> {
  const chapterOfTrack = new Map<string, string>();
  for (const [chapter, guid] of links) if (!chapterOfTrack.has(guid)) chapterOfTrack.set(guid, chapter);
  const out = new Map<string, TrackItem[]>();
  tracks.forEach((track, at) => {
    let owner = chapterOfTrack.get(track.guid);
    let depth = track.depth;
    for (let above = at - 1; owner === undefined && above >= 0 && depth > 0; above--) {
      const candidate = tracks[above];
      if (candidate.isFolder && candidate.depth < depth) {
        owner = chapterOfTrack.get(candidate.guid);
        depth = candidate.depth;
      }
    }
    if (owner === undefined) return;
    out.set(owner, [...(out.get(owner) ?? []), ...track.items]);
  });
  return out;
}
