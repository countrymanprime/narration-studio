import { useCallback, useEffect, useRef, useState } from 'react';
import { overlay } from '../../../overlay/overlayService';
import { onSampleStart } from '../../voicesamples/samplePlayerStore';
import { segmentAtElapsed, totalDuration, type PlaylistSegment } from '../../proof/playlist';
import type { DawCapabilities } from '../../../api/contracts/daw';
import type { WorkspaceItem } from '../../../api/contracts/workspace';
import { firstFrom, heardWindow, leadStart, summarize, type ChapterDoc } from '../model';
import type { ClosedCut } from '../follow/clockMap';
import { useDawTransportSync, type RemotePlayer } from '../follow/useDawTransportSync';
import { APP, CHECKING, dawReadiness, playThrough, quietWhileRecording, type DawRead, type PlaybackProvider } from '../../../playback/providers';
import { usePort } from '../../../ports/usePort';
import { useEditingPage } from '../script/EditingPageState';
import { useAppliedOutput, type OutputPrefs } from '../../engine/outputPrefs';
import { playable, playingKey } from '../script/playing';
import { selectedKeysOf, type PageState } from '../script/scriptState';

export const AUDIO_FAILED = "This chapter's audio couldn't be played. Check that its source files are still where the project expects them.";
const NOTHING_FROM_HERE = 'Nothing was recorded from here.';

const selectedFrom = (d: ChapterDoc, s: PageState): string[] => selectedKeysOf(d, s);

/** The stretch the selected words are heard over, or null when none of them was recorded. */
const selectionWindow = (d: ChapterDoc, s: PageState): [number, number] | null => {
  const keys = selectedFrom(d, s);
  const sum = summarize(d, keys, [], (x) => x);
  if (!sum.audible.length) return null;
  return heardWindow(d, sum.audible[0].key, sum.audible[sum.audible.length - 1].key, sum.start, sum.end);
};

/** Seconds early a stop timer may fire and still count as the stop: timers are not exact. */
const STOP_SLACK_SECONDS = 0.005;

export interface ScriptPlayback {
  playing: boolean;
  /** Whether the text follows the playing word. A play turns it on; a hand scroll turns it off through `setFollow`. */
  follow: boolean;
  setFollow: (on: boolean) => void;
  /** Space: play from the cursor or the selection; again, pause on the word reached. */
  toggle: () => void;
  /** Plays from `from` seconds into the chapter, on to `to` or the end. */
  playFrom: (from: number, to?: number) => void;
  /** Plays the selected words, or says why it cannot. */
  playSelection: () => void;
  /** The previous (-1) or next (1) heard word: moves the playing position while it plays, the cursor when it does not. */
  skip: (d: 1 | -1) => void;
  stop: () => void;
  /** The DAW's transport is synced with the page: its play is the page's play, and the heartbeat follow stands down. */
  syncActive?: boolean;
}

export interface ScriptPlaybackOptions {
  /** The recorded files in the order of the chapter; its elapsed line is the document's time. */
  playlist: PlaylistSegment[];
  mediaUrl: (sourceFile: string) => string;
  notify?: (text: string) => void;
  /** The DAW to play through and follow, when there is one: the chapter's items as the alignment holds them, its closing cuts, and what the DAW can
   * do. Null `caps` (not answered yet) plays nothing unless the read failed; absent `sync` plays in the app. */
  sync?: { items: readonly WorkspaceItem[]; cuts: readonly ClosedCut[]; caps: DawCapabilities | null; read?: DawRead };
  /** The narrator's volume, mute, speed and output, kept on the element; absent leaves the element as the webview makes it. */
  output?: OutputPrefs;
  /** Hears why the chosen output could not be used, or null when it took, each time the choice changes. */
  onOutputDevice?: (problem: string | null) => void;
}

/**
 * Plays the chapter's recorded files over the document's word times: one `Audio`, the segment under the playhead, a stop at a segment's end
 * on `timeupdate` (the technique of the old chapter hook, which this does not import). The playhead is the page's `playT`; the lit word and
 * the time in the bar follow it. Nothing here throws into the page: a file that will not load stops playback and says why. With a linked DAW
 * whose transport is ready, every play goes to the DAW and the app's audio stays silent; when it cannot play, the app plays with a notice.
 */
export function useScriptPlayback({
  playlist,
  mediaUrl,
  notify = (text) => overlay.toast(text),
  sync,
  output,
  onOutputDevice,
}: ScriptPlaybackOptions): ScriptPlayback {
  const { doc, state, dispatch } = useEditingPage();
  const daw = usePort('daw');
  const [follow, setFollowState] = useState(true);
  const audioRef = useRef<HTMLAudioElement | undefined>(undefined);
  const loaded = useRef<string | undefined>(undefined);
  const segment = useRef(0);
  const stopAt = useRef<number | null>(null);
  /** Fires at `stopAt`: `timeupdate` comes only every 250 ms or so, which would stop a play anywhere up to that much late. */
  const stopTimer = useRef<number | undefined>(undefined);
  // Undefined: no DAW was given, so the app plays. Null: the DAW has not answered yet.
  const caps = sync ? sync.caps : undefined;
  const read = sync?.read;
  const live = useRef({ doc, state, playlist, mediaUrl, notify, dispatch, caps, read });
  useEffect(() => {
    live.current = { doc, state, playlist, mediaUrl, notify, dispatch, caps, read };
  });

  const audio = useCallback((): HTMLAudioElement => (audioRef.current ??= new Audio()), []);
  useAppliedOutput(audio, output, onOutputDevice);

  /** The DAW's transport, once `useDawTransportSync` below has made it; halt and go reach it here because it needs them. */
  const remoteRef = useRef<RemotePlayer | undefined>(undefined);
  /** Plays asked for, so an answer that comes after a stop or a newer play is not acted on. */
  const asks = useRef(0);

  const halt = useCallback(() => {
    asks.current += 1;
    remoteRef.current?.stop();
    audioRef.current?.pause();
    stopAt.current = null;
    window.clearTimeout(stopTimer.current);
    live.current.dispatch({ type: 'play', t: null });
  }, []);

  // A voice sample starting takes the audio: two sounds at once would be heard as one muddle (docs/prds/character-voice-samples.prd.md, Playback).
  useEffect(() => onSampleStart(halt), [halt]);

  const fail = useCallback(() => {
    halt();
    live.current.notify(AUDIO_FAILED);
  }, [halt]);

  const start = useCallback(() => {
    try {
      // A newer load interrupting this play() is expected, not a failure.
      Promise.resolve(audio().play()).catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        fail();
      });
    } catch {
      fail();
    }
  }, [audio, fail]);

  /** Whether a recorded file covers `t`. */
  const covers = useCallback((t: number): boolean => {
    const list = live.current.playlist;
    return t >= 0 && t < totalDuration(list) && !!segmentAtElapsed(list, t);
  }, []);

  /** Loads the segment that owns `t` and puts the audio on it; false when no recorded file covers it. */
  const cue = useCallback(
    (t: number): boolean => {
      const { playlist: list, mediaUrl: url } = live.current;
      if (!covers(t)) return false;
      const found = segmentAtElapsed(list, t);
      if (!found) return false;
      const el = audio();
      if (loaded.current !== found.segment.sourceFile) {
        el.src = url(found.segment.sourceFile);
        loaded.current = found.segment.sourceFile;
      }
      segment.current = found.index;
      el.currentTime = found.segment.sourceStart + (t - found.segment.elapsedStart);
      return true;
    },
    [audio, covers],
  );

  /**
   * Plays from `t` through the first provider that is ready (playback/providers.ts): the linked DAW's transport, then the app's own audio. A DAW
   * that can play always plays; one that cannot now, or that refuses, hands the play to the app with a notice saying why.
   */
  const go = useCallback(
    (t: number): void => {
      const { caps: now, read: dawRead, notify: say } = live.current;
      const ask = ++asks.current;
      const wanted = (): boolean => asks.current === ask;
      // A read that failed is asked again, so the DAW plays the next press once it answers.
      if (now === null && dawRead?.failed) void dawRead.retry();
      const name = now?.daw ?? 'The DAW';
      const providers: PlaybackProvider<number>[] = [];
      if (now !== undefined) {
        providers.push({
          name,
          readiness: (at) => {
            const declared = dawReadiness(now, 'transport_sync', !!dawRead?.failed);
            if (!declared.ready) return declared;
            const remote = remoteRef.current;
            const refusal = remote ? remote.refusal(at) : 'pending';
            if (refusal === 'pending') return { ready: false, why: CHECKING, wait: true };
            if (refusal === 'not_ready') return { ready: false, why: remote?.refusedWith() ?? `${name} has not answered, or has another project open.` };
            if (refusal === 'not_placed') return { ready: false, why: `That part is not in ${name}'s project.` };
            return { ready: true };
          },
          play: async (at) => {
            audioRef.current?.pause();
            live.current.dispatch({ type: 'play', t: at });
            const why = await remoteRef.current?.start(at);
            return why === null ? { played: true } : { played: false, why: `${name} could not play it: ${why ?? 'it is not answering.'}` };
          },
        });
      }
      providers.push({
        name: APP,
        readiness: (at) => (covers(at) ? { ready: true } : { ready: false, why: NOTHING_FROM_HERE }),
        play: (at) => {
          cue(at);
          live.current.dispatch({ type: 'play', t: at });
          start();
          return { played: true };
        },
      });
      const keepQuiet = now ? quietWhileRecording(() => daw.projectState(), name) : undefined;
      void playThrough(providers, t, { stillWanted: wanted, ...(keepQuiet ? { keepQuiet } : {}) }).then(({ by, notice }) => {
        if (!wanted()) return;
        if (notice) say(notice);
        if (by !== null) return;
        stopAt.current = null;
        if (live.current.state.playT === t) halt();
      });
    },
    [cue, covers, start, halt, daw],
  );

  const playFrom = useCallback(
    (from: number, to?: number) => {
      stopAt.current = to ?? null;
      setFollowState(true);
      go(from);
    },
    [go],
  );

  const reached = useCallback(
    (t: number): void => {
      const { doc: d, dispatch: send } = live.current;
      const end = stopAt.current !== null;
      halt();
      // A play to the chapter's end leaves the cursor on the last word it reached; a play of a selection leaves the selection.
      const key = end ? null : playingKey(playable(d), t);
      if (key) send({ type: 'place', key });
    },
    [halt],
  );

  // The DAW's play head, while the page's play is the DAW's: the same ends the app's own audio has.
  const onHead = useCallback(
    (t: number | null, ended: boolean): void => {
      if (ended) return reached(totalDuration(live.current.playlist));
      if (t === null) return;
      if (stopAt.current !== null && t >= stopAt.current) return reached(stopAt.current);
      live.current.dispatch({ type: 'play', t });
    },
    [reached],
  );
  /** The narrator stopped the DAW: the page stops on the word it had reached, as Space does. */
  const onStopped = useCallback((): void => {
    const { doc: d, state: s, dispatch: send } = live.current;
    if (s.playT == null) return;
    const key = playingKey(playable(d), s.playT);
    halt();
    if (key) send({ type: 'place', key });
  }, [halt]);
  const onLost = useCallback((): void => {
    audioRef.current?.pause();
    stopAt.current = null;
    window.clearTimeout(stopTimer.current);
    live.current.dispatch({ type: 'play', t: null });
  }, []);
  const syncing = useDawTransportSync({
    items: sync?.items ?? [],
    playlist,
    cuts: sync?.cuts ?? [],
    caps: sync?.caps ?? null,
    onHead,
    onStopped,
    onLost,
    onDawPlay: () => setFollowState(true),
    notify,
  });
  remoteRef.current = syncing.active ? syncing.remote : undefined;

  useEffect(() => {
    const el = audio();
    const onTime = (ended: boolean): void => {
      const { playlist: list, state: s, dispatch: send } = live.current;
      if (s.playT == null) return;
      const seg = list[segment.current];
      if (!seg) return;
      if (ended || el.currentTime >= seg.sourceEnd) {
        const next = list[segment.current + 1];
        if (!next) return reached(seg.elapsedEnd);
        segment.current += 1;
        loaded.current = next.sourceFile;
        el.src = live.current.mediaUrl(next.sourceFile);
        el.currentTime = next.sourceStart;
        start();
        return;
      }
      const t = seg.elapsedStart + el.currentTime - seg.sourceStart;
      if (stopAt.current !== null && t >= stopAt.current - STOP_SLACK_SECONDS) return reached(stopAt.current);
      if (stopAt.current !== null && !el.paused) {
        window.clearTimeout(stopTimer.current);
        const left = (stopAt.current - t) / (el.playbackRate || 1);
        stopTimer.current = window.setTimeout(() => onTime(false), left * 1000);
      }
      send({ type: 'play', t });
    };
    const onUpdate = (): void => onTime(false);
    const onEnded = (): void => onTime(true);
    el.addEventListener('timeupdate', onUpdate);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', fail);
    return () => {
      el.removeEventListener('timeupdate', onUpdate);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', fail);
      window.clearTimeout(stopTimer.current);
      el.pause();
    };
  }, [audio, reached, fail, start]);

  const toggle = useCallback(() => {
    const { doc: d, state: s, notify: say, dispatch: send } = live.current;
    if (s.playT != null) {
      const key = playingKey(playable(d), s.playT);
      halt();
      if (key) send({ type: 'place', key });
      return;
    }
    if (!d.aligned) return say('Nothing has been transcribed yet.');
    if (s.sel) {
      const heard = selectionWindow(d, s);
      if (heard) return playFrom(...heard);
    }
    const from = firstFrom(d, s.cursor);
    if (!from || from.t0 == null) return say(NOTHING_FROM_HERE);
    playFrom(leadStart(d, from.key, from.t0));
  }, [halt, playFrom]);

  const playSelection = useCallback(() => {
    const { doc: d, state: s, notify: say } = live.current;
    const heard = selectionWindow(d, s);
    if (heard) playFrom(...heard);
    else say('Nothing was recorded for these words.');
  }, [playFrom]);

  const skip = useCallback(
    (d: 1 | -1) => {
      const { doc: document, state: s, dispatch: send } = live.current;
      const heard = playable(document);
      if (s.playT != null) {
        const now = playingKey(heard, s.playT);
        const at = heard.findIndex((i) => i.key === now);
        const to = heard[Math.max(0, Math.min(heard.length - 1, (at < 0 ? 0 : at) + d))];
        if (to?.t0 != null) go(to.t0);
        return;
      }
      const base = s.sel?.head ?? s.cursor;
      const from = base == null ? -1 : (document.index.get(base) ?? -1);
      const at = (key: string): number => document.index.get(key) ?? 0;
      const to = d > 0 ? heard.find((i) => at(i.key) > from) : [...heard].reverse().find((i) => at(i.key) < from);
      if (to) send({ type: 'place', key: to.key });
    },
    [go],
  );

  return { playing: state.playT != null, follow, setFollow: setFollowState, toggle, playFrom, playSelection, skip, stop: halt, syncActive: syncing.active };
}
