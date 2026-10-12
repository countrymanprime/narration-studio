import { useEffect, useRef, useState } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import type { WorkspaceItem } from '../../../api/contracts/workspace';
import { usePort } from '../../../ports/usePort';
import type { PlaylistSegment } from '../../proof/playlist';
import type { ScriptPlayback } from '../bar/useScriptPlayback';
import { useEditingPage } from '../script/EditingPageState';
import { wordAtProject } from './dawPosition';

/** How often the DAW's play position is read while the page is visible: four times a second. */
export const POLL_MS = 250;

export interface DawPlayPositionOptions {
  /** The chapter's items as its alignment holds them: where each sits in the project, from where in its source, at what rate. */
  items: readonly WorkspaceItem[];
  /** The segments the page plays, on the document's clock. */
  playlist: readonly PlaylistSegment[];
  /** What the DAW said it can do; the position is read only while it answers and its heartbeat is available. */
  caps: DawCapabilities | null;
  /** The follow state: a DAW play that starts turns it on, as a play of the app's own does. */
  playback: Pick<ScriptPlayback, 'setFollow'>;
}

/** Whether the page is visible now, and on each change. */
function useVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = (): void => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

/**
 * Lights the word the DAW is playing: reads `DawClient.projectState` a few times a second while the page is visible, maps the play position to
 * the chapter's source through its items and to a word on the document's clock, and puts the page's playhead there. It only reads the DAW.
 * The app's own playback wins: while it moves the playhead the DAW is ignored. When the DAW stops, the last word stays lit until the cursor
 * moves. A DAW that cannot report a position (not answering, no heartbeat, the built-in recorder) or a read that fails leaves the page as it was.
 */
export function useDawPlayPosition({ items, playlist, caps, playback }: DawPlayPositionOptions): void {
  const daw = usePort('daw');
  const { doc, state, dispatch } = useEditingPage();
  const visible = useVisible();
  const enabled = !!caps?.reachable && !!caps.capabilities['heartbeat']?.available;
  /** The playhead this hook put there last, so a playhead it did not put is the app's own playback. */
  const mine = useRef<number | null>(null);
  const dawPlaying = useRef(false);
  const live = useRef({ doc, state, items, playlist, playback, dispatch });
  useEffect(() => {
    live.current = { doc, state, items, playlist, playback, dispatch };
  });

  useEffect(() => {
    if (!enabled || !visible) return;
    let alive = true;
    let reading = false;
    const read = (): void => {
      if (reading) return;
      reading = true;
      daw.projectState().then(
        (ps) => {
          reading = false;
          if (!alive) return;
          const { doc: d, state: s, items: its, playlist: list, playback: pb, dispatch: send } = live.current;
          const playing = ps.playState === 'playing';
          const started = playing && !dawPlaying.current;
          dawPlaying.current = playing;
          if (s.playT != null && s.playT !== mine.current) {
            mine.current = null;
            return;
          }
          if (!playing) return;
          if (started) pb.setFollow(true);
          const t = wordAtProject(d, its, list, ps.playPosition)?.t ?? null;
          mine.current = t;
          if (s.playT !== t) send({ type: 'play', t });
        },
        () => {
          reading = false;
        },
      );
    };
    read();
    const timer = setInterval(read, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [daw, enabled, visible]);

  // After the DAW stops, the word it reached stays lit until the cursor or the selection moves.
  const { cursor, sel } = state;
  useEffect(() => {
    const { state: s, dispatch: send } = live.current;
    if (dawPlaying.current || mine.current == null || s.playT !== mine.current) return;
    mine.current = null;
    send({ type: 'play', t: null });
  }, [cursor, sel]);
}
