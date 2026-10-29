import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePort } from '../../ports/usePort';
import { chapterTrackRows, type ChapterTrackRow } from './chapterTrackRows';
import type { ManuscriptChapter, Track, TrackMapping } from '../../types';

export type ChapterLinks = {
  /** The tracks in the project the links are read against. */
  tracks: Track[];
  /** The chapter list as the host sends it: the opening and closing credits are the first and last of them. */
  chapters: ManuscriptChapter[];
  /** Every confirmed chapter-to-track link the host holds. */
  mappings: TrackMapping[];
  /** One row per linkable chapter, the opening and closing credits included, each with its link state. */
  rows: ChapterTrackRow[];
  /** Why the last read or change failed; empty when it did not. */
  error: string;
  /** The chapter whose link is being changed, or empty. */
  busyChapterId: string;
  /** Replaces the chapter's link with this track, then re-reads. */
  set: (chapterId: string, trackGuid: string) => void;
  /** Clears every link the chapter holds, then re-reads. */
  unlink: (chapterId: string) => void;
};

/**
 * The one reader of the chapter-to-track mapping in the audio engine panel. The Chapter links section, the Link chapters dialog and the
 * track list all draw from the value this returns, and a change goes through its `set` and `unlink` (chapterTrackSet and chapterTrackUnlink),
 * so no surface keeps a copy that can disagree with another. "Linked" means a confirmed mapping whose track is still in the project
 * (`chapterTrackRows`). `refreshKey` asks for a re-read after a change made elsewhere; `onChanged` tells the panel one was made here.
 */
export function useChapterLinks(tracks: Track[], refreshKey: number, onChanged: () => void): ChapterLinks {
  const manuscript = usePort('manuscript');
  const chapterTrackMap = usePort('chapterTrackMap');
  const [chapters, setChapters] = useState<ManuscriptChapter[]>([]);
  const [mappings, setMappings] = useState<TrackMapping[]>([]);
  const [error, setError] = useState('');
  const [busyChapterId, setBusyChapterId] = useState('');
  // The state above reaches a second press only after a re-render; this one answers at once, so a double click changes the link once.
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    const [nextChapters, mapping] = await Promise.all([manuscript.manuscriptChapters(), chapterTrackMap.chapterTrackMapList()]);
    setChapters(nextChapters);
    setMappings(mapping.mappings);
  }, [manuscript, chapterTrackMap]);

  useEffect(() => {
    let active = true;
    reload().catch((reason) => {
      if (active) setError(String(reason));
    });
    return () => {
      active = false;
    };
    // refreshKey has no meaning of its own: it only asks this effect to run again after a change made elsewhere (chapter sync's panel).
  }, [reload, refreshKey]);

  const change = (chapterId: string, write: () => Promise<unknown>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusyChapterId(chapterId);
    setError('');
    write()
      .then(() => reload())
      .then(() => onChanged())
      .catch((reason) => setError(String(reason)))
      .finally(() => {
        inFlight.current = false;
        setBusyChapterId('');
      });
  };
  // Set, not Confirm: it replaces the chapter's link rather than adding a second one beside it, so a Change never leaves it on two tracks.
  // Pressing Confirm again for the pair already linked changes nothing, and must not reach the host twice.
  const set = (chapterId: string, trackGuid: string) => {
    if (mappings.some((mapping) => mapping.chapterId === chapterId && mapping.trackGuid === trackGuid)) return;
    change(chapterId, () => chapterTrackMap.chapterTrackSet(chapterId, trackGuid));
  };
  const unlink = (chapterId: string) => change(chapterId, () => chapterTrackMap.chapterTrackUnlink(chapterId));

  // The chapter list holds the credits, so they are rows like any chapter.
  const rows = useMemo(() => chapterTrackRows(chapters, tracks, mappings), [chapters, tracks, mappings]);

  return { tracks, chapters, mappings, rows, error, busyChapterId, set, unlink };
}
