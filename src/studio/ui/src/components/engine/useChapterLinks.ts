import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePort } from '../../ports/usePort';
import { CREDITS_ID, CREDITS_NAME, creditsEntries, ownsOpeningCredits } from '../credits/creditsEntries';
import { useCreditsRows } from '../credits/useCreditsRows';
import { chapterTrackRows, type ChapterTrackRow } from './chapterTrackRows';
import type { ManuscriptChapter, Track, TrackMapping } from '../../types';

export type ChapterLinks = {
  /** The tracks in the project the links are read against. */
  tracks: Track[];
  /** The manuscript's own chapters; the credits are not among them. */
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
    setBusyChapterId(chapterId);
    setError('');
    write()
      .then(() => reload())
      .then(() => onChanged())
      .catch((reason) => setError(String(reason)))
      .finally(() => setBusyChapterId(''));
  };
  // Set, not Confirm: it replaces the chapter's link rather than adding a second one beside it, so a Change never leaves it on two tracks.
  const set = (chapterId: string, trackGuid: string) => change(chapterId, () => chapterTrackMap.chapterTrackSet(chapterId, trackGuid));
  const unlink = (chapterId: string) => change(chapterId, () => chapterTrackMap.chapterTrackUnlink(chapterId));

  const credits = useCreditsRows(String(refreshKey), () => undefined);
  // The credits are recorded like a chapter and linked through the same bindings, but the manuscript's chapter list never holds them, so
  // they join the rows here: opening before the first chapter, closing after the last.
  const rows = useMemo(() => {
    const entries = creditsEntries(credits.rows, ownsOpeningCredits(chapters));
    const asChapter = (kind: 'opening' | 'closing', index: number): ManuscriptChapter[] =>
      entries[kind]
        ? [{ id: CREDITS_ID[kind], title: CREDITS_NAME[kind], index, wordCount: entries[kind].words, status: entries[kind].status, contentKind: 'narration' }]
        : [];
    return chapterTrackRows([...asChapter('opening', -2), ...chapters, ...asChapter('closing', chapters.length + 1)], tracks, mappings);
  }, [credits.rows, chapters, tracks, mappings]);

  return { tracks, chapters, mappings, rows, error, busyChapterId, set, unlink };
}
