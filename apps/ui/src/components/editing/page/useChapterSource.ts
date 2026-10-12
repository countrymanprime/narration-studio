import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EditCut } from '../../../api/contracts/editCuts';
import type { WordFx } from '../../../api/contracts/wordFx';
import { usePort } from '../../../ports/usePort';
import type { ChapterDoc } from '../model';
import type { RangeLocator } from '../range/common/locate';
import type { PlaylistSegment } from '../../proof/playlist';
import { docOf, lengthOf, locatorOf, playlistOf, type ChapterRead } from './chapterSource';

type ChapterSource =
  | { status: 'loading' }
  | { status: 'error'; message: string }
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
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

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
  const trackMap = usePort('chapterTrackMap');
  const tracks = usePort('tracks');
  const [state, setState] = useState<{ chapterId: string; read: ChapterRead | null; error: string | null }>({ chapterId, read: null, error: null });

  useEffect(() => {
    let live = true;
    const trackOf = async () => {
      try {
        const [map, project] = await Promise.all([trackMap.chapterTrackMapList(), tracks.tracksList()]);
        const guid = map.mappings.find((m) => m.chapterId === chapterId)?.trackGuid;
        const track = project.tracks.find((t) => t.guid === guid);
        return track ? { items: track.items, place: `track “${track.name}”` } : { items: [], place: chapterName };
      } catch {
        // The saved project could not be read: the text still shows, and nothing plays.
        return { items: [], place: chapterName };
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
        };
        setState({ chapterId, read, error: null });
      })
      .catch((e: unknown) => {
        if (live) setState({ chapterId, read: null, error: why(e) });
      });
    return () => {
      live = false;
    };
  }, [workspace, alignment, log, cutsPort, fxPort, trackMap, tracks, chapterId, chapterName]);

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
  const error = state.chapterId === chapterId ? state.error : null;
  const source = useMemo((): ChapterSource => {
    if (error) return { status: 'error', message: error };
    if (!read) return { status: 'loading' };
    const doc = docOf(read);
    return {
      status: 'ready',
      read,
      doc,
      reason: read.answer.heard ? null : read.answer.reason,
      locator: locatorOf(doc, read),
      playlist: playlistOf(doc, read),
      total: lengthOf(doc),
    };
  }, [read, error]);

  return { source, setCuts, setEffects, reloadAccepted };
}
