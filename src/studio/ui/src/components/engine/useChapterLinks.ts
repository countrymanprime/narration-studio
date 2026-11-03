import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePort } from '../../ports/usePort';
import { chapterTrackRows, type ChapterTrackRow } from './chapterTrackRows';
import type { ManuscriptChapter, Track, TrackMapping } from '../../types';
import type { ChapterTrackCreateResult } from '../../api/contracts/chapterTrackMap';

export type ChapterLinks = {
  /** The tracks in the project the links are read against, with any track `create` added that the track list does not have yet. */
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
  /** The chapter whose track `create` is adding, or empty. */
  creatingChapterId: string;
  /** Replaces the chapter's link with this track, then re-reads. */
  set: (chapterId: string, trackGuid: string) => void;
  /** Clears every link the chapter holds, then re-reads. */
  unlink: (chapterId: string) => void;
  /** Has the DAW add a track named after the chapter (a folder with a Narrator track in Voice folders) and link it (chapterTrackCreate), then
   * re-reads. Answers the host's result, or undefined when another change is in flight (a double press adds one track). A failed call rejects. */
  create: (chapterId: string) => Promise<ChapterTrackCreateResult | undefined>;
};

/** The tracks a created answer added, as the track list draws them, so the row is Linked before the next read of the DAW's tracks lists them. */
function createdTracks(result: Extract<ChapterTrackCreateResult, { outcome: 'created' }>): Track[] {
  const base = { color: '', muted: false, soloed: false, items: [] };
  const folder: Track = { ...base, ...result.track, depth: 0, isFolder: Boolean(result.voice) };
  return result.voice ? [folder, { ...base, ...result.voice, depth: 1, isFolder: false }] : [folder];
}

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
  const [creatingChapterId, setCreatingChapterId] = useState('');
  // Tracks create added that the caller's track list may not have read yet; dropped from view once it lists them.
  const [added, setAdded] = useState<Track[]>([]);
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

  const create = async (chapterId: string): Promise<ChapterTrackCreateResult | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setBusyChapterId(chapterId);
    setCreatingChapterId(chapterId);
    setError('');
    try {
      const result = await chapterTrackMap.chapterTrackCreate(chapterId);
      if (result.outcome === 'created') {
        setAdded((previous) => [...previous, ...createdTracks(result)]);
        // The track was added and linked: a re-read that fails is the table's error, never a failed create.
        await reload().then(onChanged, (reason: unknown) => setError(String(reason)));
      }
      return result;
    } finally {
      inFlight.current = false;
      setBusyChapterId('');
      setCreatingChapterId('');
    }
  };

  // Once the track list has read a created track, it is the list's: a track deleted in the DAW afterwards must show as missing.
  useEffect(() => {
    const known = new Set(tracks.map((track) => track.guid));
    setAdded((previous) => {
      const next = previous.filter((track) => !known.has(track.guid));
      return next.length === previous.length ? previous : next;
    });
  }, [tracks]);

  const shown = useMemo(() => {
    const known = new Set(tracks.map((track) => track.guid));
    const pending = added.filter((track) => !known.has(track.guid));
    return pending.length === 0 ? tracks : [...tracks, ...pending];
  }, [tracks, added]);

  // The chapter list holds the credits, so they are rows like any chapter.
  const rows = useMemo(() => chapterTrackRows(chapters, shown, mappings), [chapters, shown, mappings]);

  return { tracks: shown, chapters, mappings, rows, error, busyChapterId, creatingChapterId, set, unlink, create };
}
