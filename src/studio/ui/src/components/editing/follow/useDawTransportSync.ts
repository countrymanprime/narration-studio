import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities, DawPosition } from '../../../api/contracts/daw';
import type { WorkspaceItem } from '../../../api/contracts/workspace';
import { usePort } from '../../../ports/usePort';
import { totalDuration, type PlaylistSegment } from '../../proof/playlist';
import { useEditingPage } from '../script/EditingPageState';
import { playable, playingKey } from '../script/playing';
import type { ChapterDoc } from '../model';
import { docAt, projectAt, type ClosedCut } from './clockMap';
import { EchoGuard } from './echoGuard';
import { useVisible } from './useDawPlayPosition';

/** How often the watch lease is renewed. The host asks for a lease of 6 s (transportsync.Lease), so one renewal can be lost and the stream goes on. */
export const LEASE_RENEW_MS = 3000;
/** How long a play the app started may go without a position from the DAW before the page stops and says so. */
export const SILENT_MS = 3000;
/** A run of cursor moves in the page is written to the DAW once, this long after the last. */
const WRITE_DEBOUNCE_MS = 80;

const LOST = 'The DAW stopped answering, so playback stopped.';

/**
 * What `useScriptPlayback` asks of the DAW's transport. `refusal` is a plain read: null when the DAW can be asked to play the second, `pending`
 * until the watch lease is first answered, `not_ready` while it is refused (another project open, a recording; `refusedWith` is the DAW's sentence),
 * `not_placed` when the second has no project time. `start` resolves null when the DAW took the play and the DAW's sentence when it did not
 * (nothing was left running), and `stop` stops a DAW play the app started or the DAW's own that the page is showing.
 */
export interface RemotePlayer {
  refusal(docT: number): 'pending' | 'not_ready' | 'not_placed' | null;
  refusedWith(): string | null;
  start(docT: number): Promise<string | null>;
  stop(): void;
}

export interface DawTransportSyncOptions {
  items: readonly WorkspaceItem[];
  playlist: readonly PlaylistSegment[];
  /** The closing cuts, in the source seconds of their items. */
  cuts: readonly ClosedCut[];
  caps: DawCapabilities | null;
  /** The DAW's play head while the app's play is the DAW's: a document second (null in a gap) and whether it passed the chapter's end. */
  onHead(docT: number | null, ended: boolean): void;
  /** The narrator stopped the DAW while the app's play was the DAW's. */
  onStopped(): void;
  /** The DAW stopped answering during the app's play. */
  onLost(): void;
  /** The DAW started playing by itself: the text follows it, as it does the app's own play. */
  onDawPlay(): void;
  notify(text: string): void;
}

export interface DawTransportSync {
  /** The DAW answers and its `transport_sync` capability is usable: the page syncs, and the heartbeat follow (`useDawPlayPosition`) stands down. */
  active: boolean;
  remote: RemotePlayer;
}

/** The word a document second falls inside, or null in a gap, before the first word or after the last. */
function wordIn(doc: ChapterDoc, t: number): string | null {
  const key = playingKey(playable(doc), t);
  const item = key ? doc.items[doc.index.get(key) ?? -1] : undefined;
  return item?.t1 != null && t < item.t1 ? key : null;
}

/**
 * Keeps the Editing page and the DAW's transport in step (docs/design/editing-daw-transport-sync.md). While the DAW answers, `transport_sync` is
 * usable and the window is visible, it holds a watch lease and hears the DAW's cursor and play head about four times a second while the DAW plays:
 * a cursor the narrator moves in the DAW puts the page's cursor on that word, and a play head lights the word it is on. A cursor the page lands on
 * is written to the DAW. `remote` lets the page's Play drive the DAW's transport instead of its own audio.
 *
 * Two clocks are never both trusted: while the DAW plays, the page's playhead is the DAW's reading and the app's audio is silent; the DAW's cursor
 * wins over a write that is still on its way (EchoGuard). A DAW that has another project open, or that does not answer, is left alone.
 */
export function useDawTransportSync(options: DawTransportSyncOptions): DawTransportSync {
  const { caps } = options;
  const sync = usePort('dawTransportSync');
  const { doc, state, dispatch } = useEditingPage();
  const visible = useVisible();
  const active = !!caps?.reachable && !!caps.capabilities['transport_sync']?.available;
  // The watch lease: not answered since the page started watching, answered, or refused with the DAW's sentence.
  const [lease, setLease] = useState<{ state: 'pending' | 'ready' | 'refused'; why: string | null }>({ state: 'pending', why: null });
  const ready = lease.state === 'ready';
  const guard = useRef(new EchoGuard()).current;
  const live = useRef({ ...options, doc, state, dispatch, lease });
  useEffect(() => {
    live.current = { ...options, doc, state, dispatch, lease };
  });
  /** The page's play is the DAW's: the app started it and has not stopped it. */
  const owns = useRef(false);
  /** The DAW's last reading said it plays. */
  const dawPlaying = useRef(false);
  /** The playhead this hook put there from a DAW play it does not own, so a playhead it did not put is the app's own audio. */
  const mine = useRef<number | null>(null);
  /** The cursor key this hook placed from the DAW, so the page's cursor effect does not write it back. */
  const fromDaw = useRef<string | null>(null);
  const lastHeard = useRef(0);
  const epoch = useRef(0);

  // The lease: taken now and renewed while the window is visible. A refusal (another project open, a recording, the capability off) is not ready.
  useEffect(() => {
    if (!active || !visible) return;
    let alive = true;
    // A renewal that answers as the last one did changes nothing, so the page does not render every 3 s.
    const answer = (next: typeof lease): void => setLease((was) => (was.state === next.state && was.why === next.why ? was : next));
    const renew = (): void => {
      sync.dawTransportSync('watch', 0).then(
        (result) => alive && answer(result.ok ? { state: 'ready', why: null } : { state: 'refused', why: result.message || null }),
        () => alive && answer({ state: 'refused', why: null }),
      );
    };
    renew();
    const timer = setInterval(renew, LEASE_RENEW_MS);
    return () => {
      alive = false;
      clearInterval(timer);
      setLease({ state: 'pending', why: null });
    };
  }, [sync, active, visible]);

  // A DAW heard again after a gap starts afresh: its first cursor is adopted, and no play is the app's.
  useEffect(() => {
    if (ready) return;
    guard.reset();
    dawPlaying.current = false;
  }, [ready, guard]);

  const stopDaw = useCallback((): void => {
    sync.dawTransportSync('stop', 0).then(
      (result) => {
        if (!result.ok) live.current.notify(result.message);
      },
      () => live.current.notify('The DAW could not be stopped. Stop it there.'),
    );
  }, [sync]);

  // The DAW's position. Heard whenever the page watches, not only once the lease is answered: the opening position comes with the answer.
  useEffect(() => {
    if (!active || !visible) return;
    return sync.subscribeDawPosition((pos: DawPosition) => {
      const l = live.current;
      if (!pos.sameProject) return;
      lastHeard.current = Date.now();
      const map = { playlist: l.playlist, items: l.items, cuts: l.cuts };
      const playing = pos.playing && !pos.recording;
      const moved = guard.heard(pos.editCursor) === 'moved';
      if (moved && !playing && !owns.current) {
        const docT = docAt(map, pos.editCursor);
        const key = docT === null ? null : wordIn(l.doc, docT);
        if (key && key !== l.state.cursor) {
          fromDaw.current = key;
          l.dispatch({ type: 'place', key });
        }
      }
      if (playing) {
        const started = !dawPlaying.current;
        dawPlaying.current = true;
        const docT = docAt(map, pos.playPosition);
        if (owns.current) {
          const end = projectAt(map, Math.max(0, totalDuration([...l.playlist]) - 0.001));
          l.onHead(docT, end !== null && pos.playPosition >= end);
          return;
        }
        if (l.state.playT != null && l.state.playT !== mine.current) return; // the app's own audio is playing: it wins
        if (started) l.onDawPlay();
        // A second between two words lights nothing new; the word stays lit.
        if (docT === null || wordIn(l.doc, docT) === null) return;
        mine.current = docT;
        if (l.state.playT !== docT) l.dispatch({ type: 'play', t: docT });
        return;
      }
      if (dawPlaying.current) {
        dawPlaying.current = false;
        if (owns.current) {
          owns.current = false;
          l.onStopped();
        }
      }
    });
  }, [sync, active, visible, guard]);

  // After the DAW's own play stops, the word it reached stays lit until the cursor or the selection moves.
  const { cursor, sel } = state;
  useEffect(() => {
    if (dawPlaying.current || owns.current || mine.current == null || live.current.state.playT !== mine.current) return;
    mine.current = null;
    live.current.dispatch({ type: 'play', t: null });
  }, [cursor, sel]);

  // The page's cursor, written to the DAW once it settles.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!ready || state.playT != null || owns.current) return;
    if (cursor === fromDaw.current) {
      fromDaw.current = null;
      return;
    }
    fromDaw.current = null;
    const item = cursor ? doc.items[doc.index.get(cursor) ?? -1] : undefined;
    if (!item || item.t0 == null) return;
    const project = projectAt({ playlist: live.current.playlist, items: live.current.items, cuts: live.current.cuts }, item.t0);
    if (project === null) return;
    const timer = setTimeout(() => {
      const generation = guard.write(project);
      sync.dawTransportSync('cursor', project).then(
        (result) => {
          guard.settled(generation, result.ok);
          if (!result.ok) live.current.notify(result.message);
        },
        () => {
          guard.settled(generation, false);
          live.current.notify('The DAW could not be moved. Move it there.');
        },
      );
    }, WRITE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // The cursor is the trigger; the rest is read from the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  // A play the app started stops being the DAW's if the DAW goes quiet.
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => {
      if (!owns.current || Date.now() - lastHeard.current <= SILENT_MS) return;
      owns.current = false;
      dawPlaying.current = false;
      live.current.onLost();
      live.current.notify(LOST);
    }, 1000);
    return () => clearInterval(timer);
  }, [ready]);

  const remote: RemotePlayer = useRef<RemotePlayer>({
    refusal: (docT) => {
      const l = live.current;
      if (l.lease.state === 'pending') return 'pending';
      if (l.lease.state === 'refused') return 'not_ready';
      return projectAt({ playlist: l.playlist, items: l.items, cuts: l.cuts }, docT) === null ? 'not_placed' : null;
    },
    refusedWith: () => live.current.lease.why,
    start: async (docT) => {
      const l = live.current;
      const project = projectAt({ playlist: l.playlist, items: l.items, cuts: l.cuts }, docT);
      if (project === null) return 'That part has no place in the DAW project.';
      const mineEpoch = ++epoch.current;
      owns.current = true;
      lastHeard.current = Date.now();
      const generation = guard.write(project);
      let ok = false;
      let why: string;
      try {
        const result = await sync.dawTransportSync('play', project);
        ok = result.ok;
        why = result.message;
      } catch {
        why = 'The DAW could not be asked to play.';
      }
      guard.settled(generation, ok);
      if (!ok) {
        if (epoch.current === mineEpoch) owns.current = false;
        return why || 'The DAW did not play it.';
      }
      if (epoch.current !== mineEpoch) stopDaw(); // stopped while the DAW was being asked
      return null;
    },
    stop: () => {
      epoch.current += 1;
      const was = owns.current || dawPlaying.current;
      owns.current = false;
      dawPlaying.current = false;
      // A play that was started and not yet answered counts: the stop goes after it in the DAW's queue, and its answer stops the DAW again (start()).
      if (was) stopDaw();
    },
  }).current;

  return { active, remote };
}
