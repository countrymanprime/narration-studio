import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EditCut } from '../../../api/contracts/editCuts';
import type { WordFx } from '../../../api/contracts/wordFx';
import { chapterTrackOf } from '../../../api/chapterTrackItems';
import { usePort } from '../../../ports/usePort';
import { useSpeakers } from '../../script/page/data/useScriptData';
import type { QuotedPhrase } from '../script/docFromHeard';
import type { ChapterDoc } from '../model';
import type { RangeLocator } from '../range/common/locate';
import type { PlaylistSegment } from '../../proof/playlist';
import { audioOf, docOf, lengthOf, locatorOf, playlistOf, type ChapterRead } from './chapterSource';
import { apiErrorDetails, apiErrorMessage } from '../../../api/errorMessage';
import { chapterLink } from '../../chapterTracks/chapterLink';
import { useChapterTrackSnapshot } from '../../chapterTracks/useChapterTrackSnapshot';

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
  const snapshot = useChapterTrackSnapshot();
  const daw = usePort('daw');
  const [state, setState] = useState<{ chapterId: string; read: ChapterRead | null; error: string | null; details?: string }>({
    chapterId,
    read: null,
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
    const trackOf = async () => {
      try {
        const { project, mappings } = await snapshot();
        if (!project) throw new Error('The tracks could not be read.');
        const guid = chapterLink(mappings, chapterId).trackGuid;
        // A folder of voices has its audio on its children: the items are read through the folder (chapterTrackOf), never off the linked track alone.
        const found = chapterTrackOf(project.tracks, guid);
        const link = guid === undefined ? ('unlinked' as const) : found ? ('linked' as const) : ('missing' as const);
        // Only a chapter with no items needs to know: the DAW's unsaved changes are where a take recorded since the last save is. A DAW that does not answer says no.
        const unsaved = found && found.items.length > 0 ? false : await unsavedChanges(daw.projectState());
        return found
          ? { items: found.items, place: `${found.track.isFolder ? 'folder' : 'track'} “${found.track.name}”`, link, folder: found.track.isFolder, unsaved }
          : { items: [], place: chapterName, link, folder: false, unsaved };
      } catch {
        // The saved project could not be read: the text still shows, and nothing plays.
        return { items: [], place: chapterName, link: 'unknown' as const, folder: false, unsaved: false };
      }
    };
    Promise.all([
      workspace.workspaceAlignment(chapterId),
      alignment.heard(chapterId),
      cutsPort.editingCutsList(chapterId),
      fxPort.editingWordFxList(chapterId),
      log.editingAcceptedList(chapterId),
      trackOf(),
    ])
      .then(([ws, answer, cuts, fx, accepted, track]) => {
        if (!live) return;
        const read: ChapterRead = {
          workspace: ws,
          answer,
          cuts: cuts.cuts,
          effects: fx.effects,
          accepted: accepted.words.map((w) => w.key),
          items: track.items,
          place: track.place,
          audio: audioOf(track.link, track.items.length, ws.items.filter((item) => item.live).length, track.folder, track.unsaved),
        };
        setState({ chapterId, read, error: null });
      })
      .catch((e: unknown) => {
        if (live) setState({ chapterId, read: null, error: why(e), details: apiErrorDetails(e) });
      });
    return () => {
      live = false;
    };
  }, [workspace, alignment, log, cutsPort, fxPort, snapshot, daw, chapterId, chapterName, reads]);

  const patch = useCallback((change: Partial<ChapterRead>) => setState((s) => (s.read ? { ...s, read: { ...s.read, ...change } } : s)), []);
  const setCuts = useCallback((cuts: EditCut[]) => patch({ cuts }), [patch]);
  const setEffects = useCallback((effects: WordFx[]) => patch({ effects }), [patch]);
  const reloadAccepted = useCallback(() => {
    void log.editingAcceptedList(chapterId).then(
      (a) => patch({ accepted: a.words.map((w) => w.key) }),
      () => undefined,
    );
  }, [log, chapterId, patch]);

  const read = state.chapterId === chapterId ? state.read : null;
  // While the chapter has no audio to edit, the link or the recording may be made elsewhere (REAPER, the audio engine panel): read again whenever the
  // window is focused, not only when the chapter was opened.
  const noAudio = read !== null && read.audio.kind !== 'ready';
  useEffect(() => {
    if (!noAudio) return;
    const again = () => setReads((n) => n + 1);
    window.addEventListener('focus', again);
    return () => window.removeEventListener('focus', again);
  }, [noAudio]);
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

  const reread = useCallback(() => setReads((n) => n + 1), []);
  const retry = useCallback(() => {
    setState({ chapterId, read: null, error: null });
    setReads((n) => n + 1);
  }, [chapterId]);

  return { source, setCuts, setEffects, reloadAccepted, reread, retry };
}
