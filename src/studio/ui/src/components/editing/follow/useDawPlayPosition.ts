import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { useDawState } from '../../../daw/useDawSession';
import { usePort } from '../../../ports/usePort';
import type { ScriptPlayback } from '../bar/useScriptPlayback';
import { useEditingPage } from '../script/EditingPageState';
import type { WordClock } from './wordClock';

/** How often the DAW is asked where it is when no event has said: the backstop for a transport event that was lost. The transport event carries the play position (as of the last heartbeat) while the DAW plays, which is all a read here ever returned. */
export const BACKSTOP_MS = 30_000;

export interface DawPlayPositionOptions {
  /** Where each word plays in the project (the host's word table), or null while there is none. */
  clock: WordClock | null;
  /** What the DAW said it can do; the position is read only while it answers and its heartbeat is available. */
  caps: DawCapabilities | null;
  /** The follow state: a DAW play that starts turns it on, as a play of the app's own does. */
  playback: Pick<ScriptPlayback, 'setFollow'>;
}

/** Whether the page is visible now, and on each change. */
export function useVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = (): void => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

/**
 * Lights the word the DAW is playing: hears the DAW's transport from the app's DAW session (`daw_transport_changed`, which carries the play position as of
 * the last heartbeat while the DAW plays) while the page is visible, maps the play position to the chapter's source through its items and to a word on the
 * document's clock, and puts the page's playhead there. A slow read of `DawClient.projectState` (`BACKSTOP_MS`) is the backstop for an event that was lost.
 * It only reads the DAW. The app's own playback wins: while it moves the playhead the DAW is ignored. When the DAW stops, the last word stays lit until the
 * cursor moves. A DAW that cannot report a position (not answering, no heartbeat, the built-in recorder) or a read that fails leaves the page as it was.
 */
export function useDawPlayPosition({ clock, caps, playback }: DawPlayPositionOptions): void {
  const daw = usePort('daw');
  const { state, dispatch } = useEditingPage();
  const visible = useVisible();
  const transport = useDawState((session) => session.transport);
  const enabled = !!caps?.reachable && !!caps.capabilities['heartbeat']?.available;
  /** The playhead this hook put there last, so a playhead it did not put is the app's own playback. */
  const mine = useRef<number | null>(null);
  const dawPlaying = useRef(false);
  const live = useRef({ state, clock, playback, dispatch });
  useEffect(() => {
    live.current = { state, clock, playback, dispatch };
  });

  /** One report of the DAW's play: from the transport event or from the backstop read. */
  const apply = useCallback((playing: boolean, position: number): void => {
    const { state: s, clock: map, playback: pb, dispatch: send } = live.current;
    const started = playing && !dawPlaying.current;
    dawPlaying.current = playing;
    if (s.playT != null && s.playT !== mine.current) {
      mine.current = null;
      return;
    }
    if (!playing) return;
    if (started) pb.setFollow(true);
    const t = map?.docAt(position) ?? null;
    mine.current = t;
    if (s.playT !== t) send({ type: 'play', t });
  }, []);

  // The transport event (and the page becoming visible, or the DAW answering, which hears the state the session already holds).
  useEffect(() => {
    if (!enabled || !visible) return;
    apply(transport.playing && !transport.recording, transport.position ?? 0);
  }, [apply, enabled, visible, transport]);

  // The backstop: a stop or a play whose event was lost is found here.
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
          if (alive) apply(ps.playState === 'playing', ps.playPosition);
        },
        () => {
          reading = false;
        },
      );
    };
    const timer = setInterval(read, BACKSTOP_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [daw, apply, enabled, visible]);

  // After the DAW stops, the word it reached stays lit until the cursor or the selection moves.
  const { cursor, sel } = state;
  useEffect(() => {
    const { state: s, dispatch: send } = live.current;
    if (dawPlaying.current || mine.current == null || s.playT !== mine.current) return;
    mine.current = null;
    send({ type: 'play', t: null });
  }, [cursor, sel]);
}
