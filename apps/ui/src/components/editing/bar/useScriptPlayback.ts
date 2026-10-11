import { useCallback, useEffect, useRef, useState } from 'react';
import { overlay } from '../../../overlay/overlayService';
import { segmentAtElapsed, totalDuration, type PlaylistSegment } from '../../proof/playlist';
import { firstFrom, summarize, type ChapterDoc } from '../model';
import { useEditingPage } from '../script/EditingPageState';
import { playable, playingKey } from '../script/playing';
import { selectedKeysOf, type PageState } from '../script/scriptState';

export const AUDIO_FAILED = "This chapter's audio couldn't be played. Check that its source files are still where the project expects them.";
const NOTHING_FROM_HERE = 'Nothing was recorded from here.';

const selectedFrom = (d: ChapterDoc, s: PageState): string[] => selectedKeysOf(d, s);

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
}

export interface ScriptPlaybackOptions {
  /** The recorded files in the order of the chapter; its elapsed line is the document's time. */
  playlist: PlaylistSegment[];
  mediaUrl: (sourceFile: string) => string;
  notify?: (text: string) => void;
}

/**
 * Plays the chapter's recorded files over the document's word times: one `Audio`, the segment under the playhead, a stop at a segment's end
 * on `timeupdate` (the technique of the old chapter hook, which this does not import). The playhead is the page's `playT`; the lit word and
 * the time in the bar follow it. Nothing here throws into the page: a file that will not load stops playback and says why.
 */
export function useScriptPlayback({ playlist, mediaUrl, notify = (text) => overlay.toast(text) }: ScriptPlaybackOptions): ScriptPlayback {
  const { doc, state, dispatch } = useEditingPage();
  const [follow, setFollowState] = useState(true);
  const audioRef = useRef<HTMLAudioElement | undefined>(undefined);
  const loaded = useRef<string | undefined>(undefined);
  const segment = useRef(0);
  const stopAt = useRef<number | null>(null);
  const live = useRef({ doc, state, playlist, mediaUrl, notify, dispatch });
  useEffect(() => {
    live.current = { doc, state, playlist, mediaUrl, notify, dispatch };
  });

  const audio = (): HTMLAudioElement => (audioRef.current ??= new Audio());

  const halt = useCallback(() => {
    audioRef.current?.pause();
    stopAt.current = null;
    live.current.dispatch({ type: 'play', t: null });
  }, []);

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
  }, [fail]);

  /** Loads the segment that owns `t` and puts the audio on it; false when no recorded file covers it. */
  const cue = useCallback((t: number): boolean => {
    const { playlist: list, mediaUrl: url } = live.current;
    if (t < 0 || t >= totalDuration(list)) return false;
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
  }, []);

  const go = useCallback(
    (t: number): boolean => {
      if (!cue(t)) return false;
      live.current.dispatch({ type: 'play', t });
      start();
      return true;
    },
    [cue, start],
  );

  const playFrom = useCallback(
    (from: number, to?: number) => {
      stopAt.current = to ?? null;
      setFollowState(true);
      if (!go(from)) {
        stopAt.current = null;
        live.current.notify(NOTHING_FROM_HERE);
      }
    },
    [go],
  );

  useEffect(() => {
    const el = audio();
    const reached = (t: number): void => {
      const { doc: d, dispatch: send } = live.current;
      const end = stopAt.current !== null;
      halt();
      // A play to the chapter's end leaves the cursor on the last word it reached; a play of a selection leaves the selection.
      const key = end ? null : playingKey(playable(d), t);
      if (key) send({ type: 'place', key });
    };
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
      if (stopAt.current !== null && t >= stopAt.current) return reached(stopAt.current);
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
      el.pause();
    };
  }, [halt, fail, start]);

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
      const sum = summarize(d, selectedFrom(d, s), [], (x) => x);
      if (sum.audible.length) return playFrom(sum.start, sum.end);
    }
    const from = firstFrom(d, s.cursor);
    if (!from || from.t0 == null) return say(NOTHING_FROM_HERE);
    playFrom(from.t0);
  }, [halt, playFrom]);

  const playSelection = useCallback(() => {
    const { doc: d, state: s, notify: say } = live.current;
    const sum = summarize(d, selectedFrom(d, s), [], (x) => x);
    if (sum.audible.length) playFrom(sum.start, sum.end);
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

  return { playing: state.playT != null, follow, setFollow: setFollowState, toggle, playFrom, playSelection, skip, stop: halt };
}
