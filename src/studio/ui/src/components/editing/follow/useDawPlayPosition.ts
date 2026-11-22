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
  /** The transport event last applied, and how many have come: a backstop read that was out when one came is older than it and is dropped. */
  const heard = useRef({ transport, count: 0 });
  const live = useRef({ state, clock, playback, dispatch });
  useEffect(() => {
    live.current = { state, clock, playback, dispatch };
  });

  /** One report of the DAW's play: from the transport event or from the backstop read. */
  const apply = useCallback((playing: boolean, position: number): void => {
    const { state: s, clock: map, playback: pb, dispatch: send } = live.current;
    const started = playing && !dawPlaying.current;
    const stopped = !playing && dawPlaying.current;
    dawPlaying.current = playing;
    if (s.playT != null && s.playT !== mine.current) {
      mine.current = null;
      return;
    }
    if (!playing) {
      // The word the DAW reached stays lit, but the bar and the screen reader hear a stop.
      if (stopped && mine.current != null && s.playT === mine.current) send({ type: 'hold' });
      return;
    }
    if (started) pb.setFollow(true);
    const t = map?.docAt(position) ?? null;
    mine.current = t;
    if (s.playT !== t || s.held) send({ type: 'play', t });
  }, []);

  // The transport event (and the page becoming visible, or the DAW answering, which hears the state the session already holds).
  useEffect(() => {
    if (heard.current.transport !== transport) heard.current = { transport, count: heard.current.count + 1 };
    // A stop heard while the page is hidden is still tracked, so a DAW lost after it keeps the word as any stop does.
    if (!enabled) return;
    if (!visible) {
      if (!transport.playing || transport.recording) {
        const { state: s, dispatch: send } = live.current;
        if (dawPlaying.current && mine.current != null && s.playT === mine.current) send({ type: 'hold' });
        dawPlaying.current = false;
      }
      return;
    }
    apply(transport.playing && !transport.recording, transport.position ?? 0);
    // The word table arriving after a play started (or another chapter's) lights the word at once, not at the next heartbeat.
  }, [apply, enabled, visible, transport, clock]);

  // The backstop: a stop or a play whose event was lost is found here.
  useEffect(() => {
    if (!enabled || !visible) return;
    let alive = true;
    let reading = false;
    const read = (): void => {
      if (reading) return;
      reading = true;
      const asked = heard.current.count;
      daw.projectState().then(
        (ps) => {
          reading = false;
          // An event that came while the read was out is newer than it.
          if (alive && heard.current.count === asked) apply(ps.playState === 'playing', ps.playPosition);
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

  // The DAW stopped answering while the page showed a play of it: no event will end that play, so it ends here and its word is cleared, as when the
  // DAW stops. A word kept lit after a stop stays (it clears when the cursor moves), and a playhead the app itself moved is not touched.
  useEffect(() => {
    if (enabled) return;
    // `dawPlaying` is left as it was: the next transport event sets it, and a DAW that is still playing when it comes back is not a new play (the follow the
    // narrator turned off with a hand scroll stays off).
    const { state: s, dispatch: send } = live.current;
    if (dawPlaying.current && mine.current != null && s.playT === mine.current) {
      mine.current = null;
      send({ type: 'play', t: null });
    }
  }, [enabled]);

  // A play the app itself started (or a halt of the page's play) ends what `mine` remembered: the DAW's last word is not the app's play,
  // whatever second it starts on.
  const playT = state.playT;
  useEffect(() => {
    if (playT == null || playT !== mine.current) mine.current = null;
  }, [playT]);

  // After the DAW stops, the word it reached stays lit until the cursor or the selection moves.
  const { cursor, sel } = state;
  useEffect(() => {
    const { state: s, dispatch: send } = live.current;
    if (dawPlaying.current || mine.current == null || s.playT !== mine.current) return;
    mine.current = null;
    send({ type: 'play', t: null });
  }, [cursor, sel]);
}
