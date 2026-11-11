import type { ManuscriptChapter, Track, TrackMapping } from '../../types';
import { isNarrationChapter } from '../../chapterKinds';
import { chapterLink, linkStateOf, type ChapterLinkState } from '../chapterTracks/chapterLink';

/** A chapter's link state for the audio engine panel list `linked` when the
 * confirmed track still exists in the current REAPER project, `missing` when the confirmed trackGuid no longer
 * resolves to a track (the track was deleted or the project points elsewhere), `unlinked` when nothing is confirmed yet, `several` when the
 * chapter holds more than one link (chapterLink). */
export type { ChapterLinkState };

export type ChapterTrackRow = {
  chapter: ManuscriptChapter;
  mapping?: TrackMapping;
  trackName?: string;
  state: ChapterLinkState;
};

/** Builds one row per narration chapter (reference chapters are hidden here the way the page-flip reader hides them,
 * since they have no audio to link) joined against the confirmed mappings and the tracks currently in the project.
 * A chapter with more than one confirmed track (the store may hold several links) is `several`, with its first mapping shown. */
export function chapterTrackRows(chapters: ManuscriptChapter[], tracks: Track[], mappings: TrackMapping[]): ChapterTrackRow[] {
  const trackByGuid = new Map(tracks.map((track) => [track.guid, track]));
  return chapters.filter(isNarrationChapter).map((chapter) => {
    const link = chapterLink(mappings, chapter.id);
    const mapping = link.mappings[0];
    if (!mapping) return { chapter, state: 'unlinked' as const };
    const track = trackByGuid.get(mapping.trackGuid);
    const state = linkStateOf(link, Boolean(track));
    return { chapter, mapping, trackName: track?.name, state };
  });
}
