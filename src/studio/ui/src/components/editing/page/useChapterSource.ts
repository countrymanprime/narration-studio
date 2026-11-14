import { trackName as readable } from '../../tracks/trackName';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EditCut } from '../../../api/contracts/editCuts';
import type { WordFx } from '../../../api/contracts/wordFx';
import type { TrackItem } from '../../../api/contracts/tracks';
import { chapterTrackOf } from '../../../api/chapterTrackItems';
import { usePort } from '../../../ports/usePort';
import { useSpeakers } from '../../script/page/data/useScriptData';
import type { QuotedPhrase } from '../script/docFromHeard';
import type { ChapterDoc } from '../model';
import type { RangeLocator } from '../range/common/locate';
import type { PlaylistSegment } from '../../proof/playlist';
import { audioOf, docOf, lengthOf, locatorOf, playlistOf, type ChapterRead } from './chapterSource';
import { apiErrorDetails, apiErrorMessage } from '../../../api/errorMessage';
import { chapterLink, linkStateOf, type ChapterLinkState } from '../../chapterTracks/chapterLink';
import { useChapterTrackState } from '../../chapterTracks/ChapterTrackState';

type ChapterSource =
  | { status: 'loading' }
  | { status: 'error'; message: string; details?: string }
  | {
      status: 'ready';
      read: ChapterRead;
      doc: ChapterDoc;
      /** Why nothing was transcribed, when `doc.aligned` is false. */
      reason: string | null;
      locator: RangeLocator;
      playlist: PlaylistSegment[];
      /** The chapter's length now, in seconds. */
      total: number;
    };

export interface ChapterSourceState {
  source: ChapterSource;
  /** The slices hand back the lists after a change; the document is built again from them. */
  setCuts: (cuts: EditCut[]) => void;
  setEffects: (effects: WordFx[]) => void;
  /** Reads the accepted words again (after an accept or its undo). */
  reloadAccepted: () => void;
  /** Reads everything again, as for a chapter just opened: after the narrator linked the chapter to its track elsewhere in the app. */
  reread: () => void;
  /** After a failed read: forgets the error and shows the loading state, then reads again. */
  retry: () => void;
}

const why = apiErrorMessage;

/** How long the page waits for the DAW to say whether it has unsaved changes before it reads the chapter without that: a DAW that does not answer must not hold the page. */
const PROJECT_STATE_WAIT_MS = 3000;

/** Whether the DAW has changes its saved file lacks, or 'unknown' when it could not say in time (a refusal or no answer is not "no changes"). */
async function unsavedChanges(read: Promise<{ unsavedChanges: boolean }>): Promise<boolean | 'unknown'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'unknown'>((resolve) => {
    timer = setTimeout(() => resolve('unknown'), PROJECT_STATE_WAIT_MS);
  });
  try {
    return await Promise.race([
      read.then(
        (state) => state.unsavedChanges,
        () => 'unknown' as const,
      ),
      late,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What the page reads for one chapter through the ports: the text and what was heard (workspace and alignment), the stored cuts, effects and
 * accepted words (editLog), and the chapter's track items for playback (chapterTrackMap and tracks; a chapter with no linked track plays nothing).
 * The document is built once per answer and again whenever a slice hands back a list.
 */
export function useChapterSource(chapterId: string, chapterName: string): ChapterSourceState {
  const workspace = usePort('workspace');
  const alignment = usePort('alignment');
  const log = usePort('editLog');
  const cutsPort = usePort('editCuts');
  const fxPort = usePort('editWordFx');
  // The chapter's track is the shared state's, as the Engine list and the Booth read it: a track renamed, deleted or relinked while this page is open
  // reaches it at once, and the rest of the chapter is not read again for it (#3366).
  const tracks = useChapterTrackState();
  const daw = usePort('daw');
  type Base = Omit<ChapterRead, 'items' | 'place' | 'audio'>;
  const [state, setState] = useState<{ chapterId: string; base: Base | null; error: string | null; details?: string }>({
    chapterId,
    base: null,
    error: null,
  });
  const [reads, setReads] = useState(0);
  const speakers = useSpeakers();
  // The quotes the Story Bible found in each paragraph: the script's units follow them, and each quote opens with its speaker's chip.
  const phrasesOf = useCallback(
    (paragraphId: string): QuotedPhrase[] => speakers.phrasesOf({ id: paragraphId, chapterId }).map((p) => ({ cue: p.cueId, start: p.start, end: p.end })),
    [speakers, chapterId],
  );

  useEffect(() => {
    let live = true;
    Promise.all([
      workspace.workspaceAlignment(chapterId),
      alignment.heard(chapterId),
      cutsPort.editingCutsList(chapterId),
      fxPort.editingWordFxList(chapterId),
      log.editingAcceptedList(chapterId),
    ])
      .then(([ws, answer, cuts, fx, accepted]) => {
        if (!live) return;
        setState({ chapterId, base: { workspace: ws, answer, cuts: cuts.cuts, effects: fx.effects, accepted: accepted.words.map((w) => w.key) }, error: null });
      })
      .catch((e: unknown) => {
        if (live) setState({ chapterId, base: null, error: why(e), details: apiErrorDetails(e) });
      });
    return () => {
      live = false;
    };
  }, [workspace, alignment, log, cutsPort, fxPort, chapterId, reads]);

  // The chapter's track from the state. Until the state's first read answers there is nothing to say; a state that is not reading (no DAW file is
  // linked) or whose tracks are not there says nothing about the link, so the page does not claim there is no audio.
  const [track, setTrack] = useState<{
    chapterId: string;
    items: TrackItem[];
    place: string;
    link: ChapterLinkState | 'unknown';
    folder: boolean;
    unsaved: boolean | 'unknown';
  }>();
  // A first read that failed is not waited on either: the text shows and nothing plays, as it did when the page read the tracks itself.
  const waiting = tracks.reading && tracks.readAt === null && !tracks.live.error;
  const { project: tracksProject, mappings: tracksMappings, reread: tracksReread } = tracks;
  useEffect(() => {
    let live = true;
    if (waiting) {
      setTrack(undefined);
      return;
    }
    const guid = chapterLink(tracksMappings, chapterId).trackGuid;
    // A folder of voices has its audio on its children: the items are read through the folder (chapterTrackOf), never off the linked track alone.
    const found = tracksProject ? chapterTrackOf(tracksProject.tracks, guid) : undefined;
    const link = tracksProject ? linkStateOf(chapterLink(tracksMappings, chapterId), Boolean(found)) : ('unknown' as const);
    // Only a chapter with no items needs to know: the DAW's unsaved changes are where a take recorded since the last save is. A DAW that does not answer says no.
    (found && found.items.length > 0 ? Promise.resolve(false as const) : unsavedChanges(daw.projectState())).then((unsaved) => {
      if (!live) return;
      setTrack(
        found
          ? {
              chapterId,
              items: found.items,
              place: `${found.track.isFolder ? 'folder' : 'track'} “${readable(found.track.name)}”`,
              link,
              folder: found.track.isFolder,
              unsaved,
            }
          : { chapterId, items: [], place: chapterName, link, folder: false, unsaved },
      );
    });
    return () => {
      live = false;
    };
  }, [daw, chapterId, chapterName, waiting, tracksProject, tracksMappings, reads]);

  const base = state.chapterId === chapterId ? state.base : null;
  const trackOfChapter = track?.chapterId === chapterId ? track : undefined;
  const read = useMemo((): ChapterRead | null => {
    if (!base || !trackOfChapter) return null;
    const liveItems = base.workspace.items.filter((item) => item.live).length;
    return {
      ...base,
      items: trackOfChapter.items,
      place: trackOfChapter.place,
      audio: audioOf(trackOfChapter.link, trackOfChapter.items.length, liveItems, trackOfChapter.folder, trackOfChapter.unsaved),
    };
  }, [base, trackOfChapter]);

  const patch = useCallback((change: Partial<Base>) => setState((s) => (s.base ? { ...s, base: { ...s.base, ...change } } : s)), []);
  const setCuts = useCallback((cuts: EditCut[]) => patch({ cuts }), [patch]);
  const setEffects = useCallback((effects: WordFx[]) => patch({ effects }), [patch]);
  const reloadAccepted = useCallback(() => {
    void log.editingAcceptedList(chapterId).then(
      (a) => patch({ accepted: a.words.map((w) => w.key) }),
      () => undefined,
    );
  }, [log, chapterId, patch]);

  const error = state.chapterId === chapterId ? state.error : null;
  const details = state.chapterId === chapterId ? state.details : undefined;
  const source = useMemo((): ChapterSource => {
    if (error) return { status: 'error', message: error, details };
    if (!read) return { status: 'loading' };
    const doc = docOf(read, phrasesOf);
    return {
      status: 'ready',
      read,
      doc,
      reason: read.answer.heard ? null : read.answer.reason,
      locator: locatorOf(doc, read),
      playlist: playlistOf(doc, read),
      total: lengthOf(doc),
    };
  }, [read, error, details, phrasesOf]);

  const reread = useCallback(() => {
    setReads((n) => n + 1);
    tracksReread();
  }, [tracksReread]);
  const retry = useCallback(() => {
    setState({ chapterId, base: null, error: null });
    setReads((n) => n + 1);
  }, [chapterId]);

  return { source, setCuts, setEffects, reloadAccepted, reread, retry };
}
