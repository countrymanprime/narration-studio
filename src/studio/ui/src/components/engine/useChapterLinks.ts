import { apiErrorMessage } from '../../api/errorMessage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePort } from '../../ports/usePort';
import { useChapterTrackState } from '../chapterTracks/ChapterTrackState';
import { headingName } from '../../chapterHeading';
import { chapterTrackRows, type ChapterTrackRow } from './chapterTrackRows';
import { keptTitle } from '../mapping/trackHeldBy';
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
  /** What the last change did beyond the chapter asked for: the chapter a picked track was taken from and is now not linked; empty otherwise. */
  notice: string;
  /** Drops the notice, for a surface that shows it opening anew (the dialog, so a takeover from an earlier session is not repeated). */
  clearNotice: () => void;
  /** The chapter whose link is being changed, or empty. */
  busyChapterId: string;
  /** The chapter whose track `create` is adding, or empty: from any mount, so a panel opened again while a create runs shows it busy. */
  creatingChapterId: string;
  /** Replaces the chapter's link with this track, then re-reads. */
  set: (chapterId: string, trackGuid: string) => void;
  /** Clears every link the chapter holds, then re-reads. */
  unlink: (chapterId: string) => void;
  /** Has the DAW add a track named after the chapter (a folder with a Narrator track in Voice folders) and link it (chapterTrackCreate), then
   * re-reads. Answers the host's result, or undefined when the press is ignored: another change or create is in flight (from this mount or
   * another), or a create answered less than CREATE_QUIET_MS ago (a fast second click lands on the row that moved under the pointer). A failed
   * call rejects. */
  create: (chapterId: string) => Promise<ChapterTrackCreateResult | undefined>;
};

/** How long after a create answers that a create press is ignored: the rows shift when one is linked, so a fast second click would land on
 * the next row's button (walkthrough F1, #2958). */
export const CREATE_QUIET_MS = 600;

/** The one create in flight, for every mount of this hook: the host serialises creates too (chapterTrackCreates), and a panel closed and
 * opened again while one runs must neither press again nor lose its busy state. */
const createGuard: { pending: { chapterId: string; done: Promise<unknown> } | null; quietUntil: number } = { pending: null, quietUntil: 0 };

/** Clears the create guard. Only for tests, where one test's create must not hold back the next test's press. */
export function resetChapterTrackCreateGuard(): void {
  createGuard.pending = null;
  createGuard.quietUntil = 0;
}

/** A track a create answered with, as the track list draws it, and when the answer came. */
type AddedTrack = { track: Track; answeredAt: number };

/** The tracks a created answer added, as the track list draws them, so the row is Linked before the next read of the DAW's tracks lists them. */
function createdTracks(result: Extract<ChapterTrackCreateResult, { outcome: 'created' }>, answeredAt: number): AddedTrack[] {
  const base = { color: '', muted: false, soloed: false, items: [] };
  const folder: Track = { ...base, ...result.track, depth: 0, isFolder: Boolean(result.voice) };
  const made = result.voice ? [folder, { ...base, ...result.voice, depth: 1, isFolder: false }] : [folder];
  return made.map((track) => ({ track, answeredAt }));
}

/**
 * The one reader of the chapter-to-track mapping in the audio engine panel. The Chapter links section, the Link chapters dialog and the
 * track list all draw from the value this returns, and a change goes through its `set` and `unlink` (chapterTrackSet and chapterTrackUnlink),
 * so no surface keeps a copy that can disagree with another. "Linked" means a confirmed mapping whose track is still in the project
 * (`chapterTrackRows`). `refreshKey` asks for a re-read after a change made elsewhere; `onChanged` tells the panel one was made here; not `enabled`, nothing is read yet.
 */
export function useChapterLinks(tracks: Track[], refreshKey: number, onChanged: () => void, tracksReadAt: number | null = null, enabled = true): ChapterLinks {
  const manuscript = usePort('manuscript');
  const chapterTrackMap = usePort('chapterTrackMap');
  const [chapters, setChapters] = useState<ManuscriptChapter[]>([]);
  // The links are the shared state's (#3269): read once for every screen, so the table, the dialog and the Booth cannot disagree. This hook
  // wants only the links; the tracks are the caller's.
  const trackState = useChapterTrackState({ enabled, tracks: false });
  const mappings: TrackMapping[] = trackState.mappings;
  const { applyMappings, refreshLinks } = trackState;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyChapterId, setBusyChapterId] = useState('');
  const [creatingChapterId, setCreatingChapterId] = useState(createGuard.pending?.chapterId ?? '');
  // Tracks create added that the caller's track list may not have read yet; dropped once it lists them, or once a read answered after the
  // create leaves them out (`tracksReadAt`, the read's answer time): then the DAW does not have them and the row must say Track missing.
  const [added, setAdded] = useState<AddedTrack[]>([]);
  // The state above reaches a second press only after a re-render; this one answers at once, so a double click changes the link once.
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    const [nextChapters] = await Promise.all([manuscript.manuscriptChapters(), refreshLinks()]);
    setChapters(nextChapters);
  }, [manuscript, refreshLinks]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    reload().catch((reason) => {
      if (active) setError(apiErrorMessage(reason));
    });
    return () => {
      active = false;
    };
    // refreshKey has no meaning of its own: it only asks this effect to run again after a change made elsewhere (chapter sync's panel).
  }, [reload, refreshKey, enabled]);

  const change = (chapterId: string, write: () => Promise<unknown>, quietAfter = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusyChapterId(chapterId);
    setError('');
    setNotice('');
    write()
      .then((result) => {
        // ChapterTrackSet moves a track another chapter holds; say so, or that chapter goes to "Not linked" unseen (#3053).
        const displaced = (result as { displaced?: { chapterId: string; chapterTitle?: string } | null } | undefined)?.displaced;
        // A chapter the manuscript no longer lists is still named, by the title the host kept with its link, so no takeover is silent.
        const taken = displaced && chapters.find((chapter) => chapter.id === displaced.chapterId);
        if (displaced)
          setNotice(
            `${taken ? headingName(taken) : (keptTitle(displaced.chapterTitle) ?? 'A chapter no longer in the manuscript')} was linked to that track and is now not linked.`,
          );
      })
      .then(() => reload())
      .then(() => onChanged())
      .catch((reason) => setError(apiErrorMessage(reason)))
      .finally(() => {
        inFlight.current = false;
        setBusyChapterId('');
        // An Unlink puts "Create a track" where Clear was, so a fast second click would press it: same quiet window as after a create (#3272).
        if (quietAfter) createGuard.quietUntil = Date.now() + CREATE_QUIET_MS;
      });
  };
  // Set, not Confirm: it replaces the chapter's link rather than adding a second one beside it, so a Change never leaves it on two tracks.
  // Pressing Confirm again for the pair already linked changes nothing, and must not reach the host twice.
  const set = (chapterId: string, trackGuid: string) => {
    if (mappings.some((mapping) => mapping.chapterId === chapterId && mapping.trackGuid === trackGuid)) return;
    change(chapterId, () => chapterTrackMap.chapterTrackSet(chapterId, trackGuid));
  };
  // Unlink answers with the links that remain, so the row shows Not linked at once; the re-read that follows reconciles (#3272).
  const unlink = (chapterId: string) =>
    change(
      chapterId,
      async () => {
        const result = await chapterTrackMap.chapterTrackUnlink(chapterId);
        applyMappings(result.mappings);
        return result;
      },
      true,
    );

  // Mounted while a create from an earlier mount runs (the panel closed and opened again): busy until it ends, then read the links again.
  useEffect(() => {
    const pending = createGuard.pending;
    if (!pending) return;
    let active = true;
    // Settled either way: the mount that pressed shows the answer or the failure as a toast; this one only reads the links again.
    const settled = () => {
      if (!active) return;
      setCreatingChapterId('');
      reload().then(onChanged, (reason: unknown) => setError(apiErrorMessage(reason)));
    };
    pending.done.then(settled, settled);
    return () => {
      active = false;
    };
    // Once per mount: the create it waits for was pressed before this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async (chapterId: string): Promise<ChapterTrackCreateResult | undefined> => {
    if (inFlight.current || createGuard.pending || Date.now() < createGuard.quietUntil) return undefined;
    inFlight.current = true;
    setBusyChapterId(chapterId);
    setCreatingChapterId(chapterId);
    setError('');
    const request = chapterTrackMap.chapterTrackCreate(chapterId);
    createGuard.pending = { chapterId, done: request };
    try {
      const result = await request;
      if (result.outcome === 'created') {
        setAdded((previous) => [...previous, ...createdTracks(result, Date.now())]);
        // The track was added and linked: a re-read that fails is the table's error, never a failed create.
        await reload().then(onChanged, (reason: unknown) => setError(apiErrorMessage(reason)));
      }
      return result;
    } finally {
      if (createGuard.pending?.done === request) createGuard.pending = null;
      createGuard.quietUntil = Date.now() + CREATE_QUIET_MS;
      inFlight.current = false;
      setBusyChapterId('');
      setCreatingChapterId('');
    }
  };

  // A created track the list has read is the list's: a track deleted in the DAW afterwards must show as missing. One a read answered after
  // the create leaves out is not in the DAW (deleted or undone at once), so it is dropped too (breaker B4, #2958).
  useEffect(() => {
    const known = new Set(tracks.map((track) => track.guid));
    setAdded((previous) => {
      const next = previous.filter(({ track, answeredAt }) => !known.has(track.guid) && !(tracksReadAt !== null && tracksReadAt > answeredAt));
      return next.length === previous.length ? previous : next;
    });
  }, [tracks, tracksReadAt]);

  const shown = useMemo(() => {
    const known = new Set(tracks.map((track) => track.guid));
    const pending = added.map(({ track }) => track).filter((track) => !known.has(track.guid));
    return pending.length === 0 ? tracks : [...tracks, ...pending];
  }, [tracks, added]);

  // The chapter list holds the credits, so they are rows like any chapter.
  const rows = useMemo(() => chapterTrackRows(chapters, shown, mappings), [chapters, shown, mappings]);

  const clearNotice = () => setNotice('');
  return { tracks: shown, chapters, mappings, rows, error, notice, clearNotice, busyChapterId, creatingChapterId, set, unlink, create };
}
