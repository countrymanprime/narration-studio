import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities, DawPosition } from '../../../api/contracts/daw';
import { usePort } from '../../../ports/usePort';
import { useEditingPage } from '../script/EditingPageState';
import { EchoGuard } from './echoGuard';
import type { WordClock } from './wordClock';
import { useVisible } from './useDawPlayPosition';

/** How often the watch lease is renewed. The host asks for a lease of 6 s (transportsync.Lease), so one renewal can be lost and the stream goes on. */
export const LEASE_RENEW_MS = 3000;
/** How long a play the app started may go without a position from the DAW before the page stops and says so. */
export const SILENT_MS = 3000;
/** How often the DAW's play head is carried on between two of its readings, so the lit word advances word by word and does not wait for the next reading. */
export const EXTRAPOLATE_MS = 50;
/** The most a reading is carried on: a DAW that has gone quiet is not followed past this, the silent timer stops the page's play. */
export const MAX_EXTRAPOLATE_SECONDS = 0.6;
/** A run of cursor moves in the page is written to the DAW once, this long after the last. */
const WRITE_DEBOUNCE_MS = 80;

const LOST = 'The DAW stopped answering, so playback stopped.';
/** A DAW that stopped within this many seconds before the end of the stretch it was asked to play stopped itself there: its play head is read about four
 * times a second, so the last reading can be a quarter second short of the end. */
const END_SLACK_SECONDS = 0.4;

/**
 * What `useScriptPlayback` asks of the DAW's transport. `refusal` is a plain read: null when the DAW can be asked to play the second, `pending`
 * until the watch lease is first answered, `not_ready` while it is refused (another project open, a recording; `refusedWith` is the DAW's sentence),
 * `not_placed` when the second has no project time. `start` resolves null when the DAW took the play and the DAW's sentence when it did not
 * (nothing was left running); given the document second the play ends at, it asks the DAW to play that stretch and stop itself at its end
 * (docs/design/play-a-range-in-the-daw.md), so the end does not wait on the position stream and a stop round trip. `stop` stops a DAW play the
 * app started or the DAW's own that the page is showing.
 */
export interface RemotePlayer {
  refusal(docT: number): 'pending' | 'not_ready' | 'not_placed' | null;
  refusedWith(): string | null;
  start(docT: number, endDocT?: number): Promise<string | null>;
  stop(): void;
}

export interface DawTransportSyncOptions {
  /** Where each word plays in the project (the host's word table), or null while there is none: every second is then not placed. */
  clock: WordClock | null;
  /** The host has not answered for the word table yet: `refusal` says `pending` rather than `not_placed`. */
  clockPending: boolean;
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
  /** The stretch the DAW was asked to play and stop itself at: the document second the page's play ends at and the project second the DAW's does, and the
   * last play head heard while it played. */
  const range = useRef<{ docEnd: number; projectEnd: number; head: number } | null>(null);
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
    /** The last reading of a play and when it was heard, carried on between readings. */
    let heard: { at: number; position: number } | null = null;
    /** Lights the word at project second `projectT`: the DAW's reading or that reading carried on. A second between two words lights nothing new. */
    const head = (projectT: number, ended: boolean): void => {
      const l = live.current;
      const at = l.clock?.wordAt(projectT) ?? null;
      if (owns.current) {
        l.onHead(at?.t ?? null, ended);
        return;
      }
      if (l.state.playT != null && l.state.playT !== mine.current) return; // the app's own audio is playing: it wins
      if (at === null) return;
      mine.current = at.t;
      if (l.state.playT !== at.t) l.dispatch({ type: 'play', t: at.t });
    };
    const carry = setInterval(() => {
      if (!heard || !dawPlaying.current) return;
      const l = live.current;
      if (l.state.playT != null && !owns.current && l.state.playT !== mine.current) return;
      head(heard.position + Math.min((Date.now() - heard.at) / 1000, MAX_EXTRAPOLATE_SECONDS), false);
    }, EXTRAPOLATE_MS);
    const unsubscribe = sync.subscribeDawPosition((pos: DawPosition) => {
      const l = live.current;
      if (!pos.sameProject) return;
      lastHeard.current = Date.now();
      const playing = pos.playing && !pos.recording;
      const moved = guard.heard(pos.editCursor) === 'moved';
      if (moved && !playing && !owns.current) {
        const key = l.clock?.wordAt(pos.editCursor)?.key ?? null;
        if (key && key !== l.state.cursor) {
          fromDaw.current = key;
          l.dispatch({ type: 'place', key });
        }
      }
      if (playing) {
        const started = !dawPlaying.current;
        dawPlaying.current = true;
        heard = { at: Date.now(), position: pos.playPosition };
        if (range.current) range.current.head = pos.playPosition;
        if (!owns.current && !(l.state.playT != null && l.state.playT !== mine.current) && started) l.onDawPlay();
        const end = l.clock?.end() ?? null;
        head(pos.playPosition, owns.current && end !== null && pos.playPosition >= end);
        return;
      }
      heard = null;
      if (dawPlaying.current) {
        dawPlaying.current = false;
        if (owns.current) {
          owns.current = false;
          // A stretch the DAW stopped itself at the end of is the end of the page's play, as the page's own stop at a time is; a DAW the narrator
          // stopped short of it is the narrator's stop.
          const done = range.current && range.current.head >= range.current.projectEnd - END_SLACK_SECONDS ? range.current.docEnd : null;
          range.current = null;
          if (done !== null) l.onHead(done, false);
          else l.onStopped();
        }
      }
    });
    return () => {
      clearInterval(carry);
      unsubscribe();
    };
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
    const project = live.current.clock?.projectAt(item.t0) ?? null;
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
      if (!l.clock && l.clockPending) return 'pending';
      return (l.clock?.projectAt(docT) ?? null) === null ? 'not_placed' : null;
    },
    refusedWith: () => live.current.lease.why,
    start: async (docT, endDocT) => {
      const l = live.current;
      const project = l.clock?.projectAt(docT) ?? null;
      if (project === null) return 'That part has no place in the DAW project.';
      // A stretch that ends where nothing is known to play (or before it starts) is played open, and the page stops it as it always did.
      const projectEnd = endDocT === undefined ? null : (l.clock?.projectEndAt(endDocT) ?? null);
      const stretch = endDocT !== undefined && projectEnd !== null && projectEnd > project ? { docEnd: endDocT, projectEnd } : null;
      range.current = stretch ? { ...stretch, head: project } : null;
      const mineEpoch = ++epoch.current;
      owns.current = true;
      lastHeard.current = Date.now();
      const generation = guard.write(project);
      let ok = false;
      let why: string;
      try {
        const result = stretch ? await sync.dawTransportSync('playRange', project, stretch.projectEnd) : await sync.dawTransportSync('play', project);
        ok = result.ok;
        why = result.message;
      } catch {
        why = 'The DAW could not be asked to play.';
      }
      guard.settled(generation, ok);
      if (!ok) {
        if (epoch.current === mineEpoch) {
          owns.current = false;
          range.current = null;
        }
        return why || 'The DAW did not play it.';
      }
      if (epoch.current !== mineEpoch) stopDaw(); // stopped while the DAW was being asked
      return null;
    },
    stop: () => {
      epoch.current += 1;
      range.current = null;
      const was = owns.current || dawPlaying.current;
      owns.current = false;
      dawPlaying.current = false;
      // A play that was started and not yet answered counts: the stop goes after it in the DAW's queue, and its answer stops the DAW again (start()).
      if (was) stopDaw();
    },
  }).current;

  return { active, remote };
}
