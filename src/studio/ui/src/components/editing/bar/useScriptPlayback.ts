import { useCallback, useEffect, useRef, useState } from 'react';
import { overlay } from '../../../overlay/overlayService';
import { retryAction } from '../../primitives/Toast';
import { onSampleStart } from '../../voicesamples/samplePlayerStore';
import { segmentAtElapsed, totalDuration, type PlaylistSegment } from '../../proof/playlist';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { firstFrom, leadStart } from '../model';
import type { SoundAt } from '../ribbon/useChapterSound';
import type { WordClock } from '../follow/wordClock';
import { useDawTransportSync, type RemotePlayer } from '../follow/useDawTransportSync';
import { APP, dawReadiness, playThrough, quietWhileRecording, type DawRead, type PlaybackProvider } from '../../../playback/providers';
import { HEADING_PARAGRAPH } from '../../../ports/alignment';
import { usePort } from '../../../ports/usePort';
import { fadeOutAndPause, STOP_FADE_SECONDS } from './playbackStop';
import type { PlayedWord } from './playStopLine';
import { selectionWindow } from './selectionWindow';
import { usePlayStopReport } from './usePlayStopReport';
import { useEditingPage } from '../script/EditingPageState';
import { useAppliedOutput, type OutputPrefs } from '../../engine/outputPrefs';
import { playable, playingKey } from '../script/playing';
import { clamp } from '../../../clamp';

export const AUDIO_FAILED = "This chapter's audio couldn't be played. Check that its source files are still where the project expects them.";
/** The toast topic of a notice that offers Retry: a newer play withdraws it, so a Retry on screen is always for the newest play. */
const PLAY_TOPIC = 'editing-play-retry';
const NOTHING_FROM_HERE = 'Nothing was recorded from here.';
const NOTHING_FOR_HEADING = 'Nothing was recorded for the heading.';
const NOTHING_FOR_WORD = 'Nothing was recorded for this word.';

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
  playFrom: (from: number, to?: number, word?: PlayedWord) => void;
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
  /** Says something to the narrator; `retry`, given when nothing played, plays again. */
  notify?: (text: string, retry?: () => void) => void;
  /** The DAW to play through and follow, when there is one: the chapter's items as the alignment holds them, its closing cuts, and what the DAW can
   * do. Null `caps` (not answered yet) places nothing (no word table without them), so the app plays at once and says the DAW has not answered; a read that failed is said and asked again and the app plays; absent `sync` plays in the app. */
  sync?: {
    clock: WordClock | null;
    /** The host has not yet said where the words play: nothing is placed yet, so a play goes to the app at once and says so. */
    clockPending?: boolean;
    caps: DawCapabilities | null;
    read?: DawRead;
    chapterId?: string;
  };
  /** The chapter's audio levels, so a play of words ends where the last word's sound dies away; absent keeps the fixed tail. */
  sound?: SoundAt;
  /** The narrator's volume, mute, speed and output, kept on the element; absent leaves the element as the webview makes it. */
  output?: OutputPrefs;
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
  notify = (text, retry) => overlay.toast(text, retry ? { tone: 'error', action: retryAction(retry), topic: PLAY_TOPIC } : undefined),
  sync,
  sound,
  output,
}: ScriptPlaybackOptions): ScriptPlayback {
  const { doc, state, dispatch } = useEditingPage();
  const daw = usePort('daw');
  const stopReport = usePlayStopReport();
  const { reportStop } = stopReport;
  const [follow, setFollowState] = useState(true);
  const audioRef = useRef<HTMLAudioElement | undefined>(undefined);
  const loaded = useRef<string | undefined>(undefined);
  const segment = useRef(0);
  const stopAt = useRef<number | null>(null);
  /** The selection the current play was started for, so a selection changed mid-play is told from the one being played. */
  const playedSel = useRef<{ anchor: string; head: string } | null>(null);
  /** Cancels the fade-out of the app's audio at the end of a play, while one runs. */
  const fading = useRef<(() => void) | null>(null);
  /** True from a halt until the next play starts: the element can still report a time or an end after it was paused, before the page has re-rendered. */
  const halted = useRef(true);
  /** Fires at `stopAt`: `timeupdate` comes only every 250 ms or so, which would stop a play anywhere up to that much late. No output latency is
   * added: Chromium's `currentTime` is already the frame being heard (its audio clock counts the output delay). */
  const stopTimer = useRef<number | undefined>(undefined);
  // Undefined: no DAW was given, so the app plays. Null: the DAW has not answered yet.
  const caps = sync ? sync.caps : undefined;
  const read = sync?.read;
  const live = useRef({ doc, state, playlist, mediaUrl, notify, dispatch, caps, read, sound });
  useEffect(() => {
    live.current = { doc, state, playlist, mediaUrl, notify, dispatch, caps, read, sound };
  });

  const audio = useCallback((): HTMLAudioElement => (audioRef.current ??= new Audio()), []);
  useAppliedOutput(audio, output);

  /** The DAW's transport, once `useDawTransportSync` below has made it; halt and go reach it here because it needs them. */
  const remoteRef = useRef<RemotePlayer | undefined>(undefined);
  /** Plays asked for, so an answer that comes after a stop or a newer play is not acted on. */
  const asks = useRef(0);

  /** The app's own audio plays the page's play: an `error` from the audio element ends only such a play. */
  const appPlays = useRef(false);
  const halt = useCallback(() => {
    appPlays.current = false;
    fading.current?.();
    fading.current = null;
    stopReport.clear();
    halted.current = true;
    asks.current += 1;
    remoteRef.current?.stop();
    audioRef.current?.pause();
    stopAt.current = null;
    window.clearTimeout(stopTimer.current);
    live.current.dispatch({ type: 'play', t: null });
  }, [stopReport]);

  // A voice sample starting takes the audio: two sounds at once would be heard as one muddle (docs/prds/character-voice-samples.prd.md, Playback).
  useEffect(() => onSampleStart(halt), [halt]);

  /** The newest play asked, for the Retry of a failure that comes after `go` returned (the audio could not be played). */
  const lastAsk = useRef<{ t: number; stopsAt: number | null; asked: number; word: PlayedWord | undefined } | null>(null);
  /** The word a `playFrom` was asked for, handed to the `go` it starts (for the Retry that plays it again). */
  const askedWord = useRef<PlayedWord | undefined>(undefined);
  const goAgain = useRef<(t: number, stopsAt: number | null, word: PlayedWord | undefined) => void>(() => {});
  /** Counts the plays asked, so a Retry offered for an older one does nothing once a newer one was asked. */
  const playsAsked = useRef(0);
  /** False once the page is gone: a Retry pressed after leaving the chapter plays nothing (it would play the old chapter's track). */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      asks.current += 1;
      overlay.dismissTopic(PLAY_TOPIC);
    };
  }, []);

  const fail = useCallback(() => {
    // A late error from a file still loading when the narrator stopped is not a failure of a play that is over.
    if (halted.current || !appPlays.current) return;
    const again = lastAsk.current;
    halt();
    // Nothing could play: the same play is offered again, as for a DAW that refused.
    live.current.notify(
      AUDIO_FAILED,
      again ? () => mounted.current && playsAsked.current === again.asked && goAgain.current(again.t, again.stopsAt, again.word) : undefined,
    );
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
  /** The latest `go`, so a notice's Retry plays again with what the page holds now. */
  const go = useCallback(
    (t: number): void => {
      const { caps: now, read: dawRead, notify: say } = live.current;
      fading.current?.();
      fading.current = null;
      halted.current = false;
      const ask = ++asks.current;
      const wanted = (): boolean => asks.current === ask;
      const asked = ++playsAsked.current;
      overlay.dismissTopic(PLAY_TOPIC);
      const stopsAt = stopAt.current;
      const word = askedWord.current;
      askedWord.current = undefined;
      lastAsk.current = { t, stopsAt, asked, word };
      // A read that failed is asked again, so the DAW plays the next press once it answers.
      if (now === null && dawRead?.failed) void dawRead.retry();
      const name = now?.daw ?? 'The DAW';
      const providers: PlaybackProvider<number>[] = [];
      if (now !== undefined) {
        providers.push({
          name,
          readiness: (at) => {
            // A DAW that has not yet answered what it can do is not waited for: no check stands between the click and the play. With no capabilities
            // there is no word table either, so `refusal` says not placed and the app plays; a read that failed is said and asked again.
            const declared = now === null && !dawRead?.failed ? { ready: true as const } : dawReadiness(now, 'transport_sync', !!dawRead?.failed);
            if (!declared.ready) return declared;
            const remote = remoteRef.current;
            const refusal = remote ? remote.refusal(at) : null;
            if (refusal === 'not_ready') return { ready: false, why: remote?.refusedWith() ?? `${name} has not answered, or has another project open.` };
            if (refusal === 'not_placed') return { ready: false, why: remote?.notPlacedWhy(at, name) ?? `That part is not in ${name}'s project.` };
            return { ready: true };
          },
          play: async (at) => {
            appPlays.current = false;
            stopReport.setPath('daw');
            audioRef.current?.pause();
            live.current.dispatch({ type: 'play', t: at });
            const why = await remoteRef.current?.start(at, stopAt.current ?? undefined);
            return why === null ? { played: true } : { played: false, why: `${name} could not play it: ${why ?? 'it is not answering.'}` };
          },
        });
      }
      providers.push({
        name: APP,
        readiness: (at) => (covers(at) ? { ready: true } : { ready: false, why: NOTHING_FROM_HERE }),
        play: (at) => {
          appPlays.current = true;
          stopReport.setPath('app');
          cue(at);
          live.current.dispatch({ type: 'play', t: at });
          start();
          return { played: true };
        },
      });
      const keepQuiet = now ? quietWhileRecording(() => daw.projectState(), name) : undefined;
      void playThrough(providers, t, { stillWanted: wanted, ...(keepQuiet ? { keepQuiet } : {}) }).then(({ by, notice }) => {
        if (!wanted()) return;
        // Nothing played and a DAW was asked: the notice says why and offers the play again (no DAW means nothing to ask again).
        // Retry plays the same second to the same end, only while this is still the newest play and the page is still here.
        if (notice && by === null && now !== undefined) say(notice, () => mounted.current && playsAsked.current === asked && goAgain.current(t, stopsAt, word));
        else if (notice) say(notice);
        if (by !== null) return;
        stopAt.current = null;
        if (live.current.state.playT === t) halt();
      });
    },
    [cue, covers, start, halt, daw, stopReport],
  );

  goAgain.current = (t, stopsAt, word) => {
    stopAt.current = stopsAt;
    if (stopsAt !== null && word) stopReport.begin(word, stopsAt);
    setFollowState(true);
    askedWord.current = word;
    go(t);
  };

  const playFrom = useCallback(
    (from: number, to?: number, word?: PlayedWord) => {
      stopAt.current = to ?? null;
      if (to !== undefined && word) stopReport.begin(word, to);
      else stopReport.clear();
      playedSel.current = null;
      setFollowState(true);
      askedWord.current = word;
      go(from);
    },
    [go, stopReport],
  );

  const reached = useCallback(
    (t: number, actual: number | null = t): void => {
      const { doc: d, dispatch: send } = live.current;
      const end = stopAt.current !== null;
      reportStop(actual);
      halt();
      // A play to the chapter's end leaves the cursor on the last word it reached; a play of a selection leaves the selection.
      const key = end ? null : playingKey(playable(d), t);
      if (key) send({ type: 'place', key });
    },
    [halt, reportStop],
  );

  /** The app's audio reached the end of a range: fades out over the last moments before `at` and pauses a little after it (`playbackStop.ts`). */
  const endRange = useCallback(
    (at: number): void => {
      const el = audioRef.current;
      if (fading.current) return;
      if (!el || el.paused) return reached(at);
      window.clearTimeout(stopTimer.current);
      fading.current = fadeOutAndPause(el, () => {
        fading.current = null;
        const seg = live.current.playlist[segment.current];
        reached(at, seg ? seg.elapsedStart + el.currentTime - seg.sourceStart : null);
      });
    },
    [reached],
  );

  // The DAW's play head, while the page's play is the DAW's: the same ends the app's own audio has.
  const onHead = useCallback(
    (t: number | null, ended: boolean): void => {
      if (ended) return reached(totalDuration(live.current.playlist));
      if (t === null) return;
      if (stopAt.current !== null && t >= stopAt.current) return reached(stopAt.current, t);
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
    // A play of a selection leaves the selection; placing the cursor would drop it.
    if (key && !s.sel) send({ type: 'place', key });
  }, [halt]);
  const onLost = useCallback((message: string): void => {
    // A play still being asked of the DAW is given up with it: its late answer must not hand the play to the app after the page said it stopped.
    asks.current += 1;
    audioRef.current?.pause();
    stopAt.current = null;
    window.clearTimeout(stopTimer.current);
    live.current.dispatch({ type: 'play', t: null });
    const again = lastAsk.current;
    live.current.notify(
      message,
      again ? () => mounted.current && playsAsked.current === again.asked && goAgain.current(again.t, again.stopsAt, again.word) : undefined,
    );
  }, []);
  const syncing = useDawTransportSync({
    clock: sync?.clock ?? null,
    clockPending: sync?.clockPending ?? false,
    caps: sync?.caps ?? null,
    chapterId: sync?.chapterId ?? '',
    onHead,
    onStopped,
    onLost,
    onDawPlay: () => setFollowState(true),
    notify,
  });
  remoteRef.current = syncing.remote;

  useEffect(() => {
    const el = audio();
    const onTime = (ended: boolean): void => {
      const { playlist: list, state: s, dispatch: send } = live.current;
      if (s.playT == null || halted.current) return;
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
      if (stopAt.current !== null && t >= stopAt.current - STOP_FADE_SECONDS - STOP_SLACK_SECONDS) return endRange(stopAt.current);
      if (stopAt.current !== null && !el.paused) {
        window.clearTimeout(stopTimer.current);
        const left = (stopAt.current - STOP_FADE_SECONDS - t) / (el.playbackRate || 1);
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
  }, [audio, reached, endRange, fail, start]);

  /** Plays the selected words; false when none of them was recorded. */
  const playSelected = useCallback((): boolean => {
    const { doc: d, state: s } = live.current;
    const heard = selectionWindow(d, s, live.current.sound);
    if (!heard) return false;
    playFrom(...heard.window, heard.last);
    playedSel.current = s.sel ? { anchor: s.sel.anchor, head: s.sel.head } : null;
    return true;
  }, [playFrom]);

  const toggle = useCallback(() => {
    const { doc: d, state: s, notify: say, dispatch: send } = live.current;
    if (s.playT != null && !s.held) {
      const key = playingKey(playable(d), s.playT);
      halt();
      // Space on a play of a selection pauses it and keeps the selection; placing the cursor would drop it.
      if (key && !s.sel) send({ type: 'place', key });
      return;
    }
    if (!d.aligned) return say('Nothing has been transcribed yet.');
    if (s.sel) {
      if (playSelected()) return;
    }
    // A word with no recording under the cursor (the chapter heading, read by no one) is said, not skipped over: playing on from the next heard word
    // would start at the top of the chapter as if the heading had been played.
    const here = s.cursor ? d.items[d.index.get(s.cursor) ?? -1] : undefined;
    if (here && (here.t0 == null || here.st === 'miss')) return say(here.pid === HEADING_PARAGRAPH ? NOTHING_FOR_HEADING : NOTHING_FOR_WORD);
    const from = firstFrom(d, s.cursor);
    if (!from || from.t0 == null) return say(NOTHING_FROM_HERE);
    playFrom(leadStart(d, from.key, from.t0));
  }, [halt, playFrom, playSelected]);

  const playSelection = useCallback(() => {
    if (!playSelected()) live.current.notify('Nothing was recorded for these words.');
  }, [playSelected]);

  // A selection changed while a play runs plays the new words, in the DAW as in the app: the old range does not play on.
  const selection = state.sel;
  useEffect(() => {
    const now = live.current.state;
    if (!selection || now.playT == null || now.held) return;
    const was = playedSel.current;
    if (was && was.anchor === selection.anchor && was.head === selection.head) return;
    playSelection();
    // The selection is the trigger; the rest is read from the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const skip = useCallback(
    (d: 1 | -1) => {
      const { doc: document, state: s, dispatch: send } = live.current;
      const heard = playable(document);
      if (s.playT != null && !s.held) {
        const now = playingKey(heard, s.playT);
        const at = heard.findIndex((i) => i.key === now);
        const to = heard[clamp((at < 0 ? 0 : at) + d, 0, heard.length - 1)];
        if (to?.t0 != null) go(to.t0);
        return;
      }
      const base = s.sel?.head ?? s.cursor;
      const from = base == null ? -1 : (document.index.get(base) ?? -1);
      const at = (key: string): number => document.index.get(key) ?? 0;
      const to = d > 0 ? heard.find((i) => at(i.key) > from) : [...heard].reverse().find((i) => at(i.key) < from);
      if (to) send({ type: 'place', key: to.key });
      else live.current.notify(d > 0 ? 'No later word with audio.' : 'No earlier word with audio.');
    },
    [go],
  );

  return {
    playing: state.playT != null && !state.held,
    follow,
    setFollow: setFollowState,
    toggle,
    playFrom,
    playSelection,
    skip,
    stop: halt,
    syncActive: syncing.active,
  };
}
