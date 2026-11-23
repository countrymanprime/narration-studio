import { useCallback, useEffect, useRef, useState } from 'react';
import { dawNameOf } from '../../engine/ShowInDaw';
import { notAskedSentence } from '../../../studio/dawNames';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { overlay } from '../../../overlay/overlayService';
import { useNewestPlay } from '../../../playback/useNewestPlay';
import { retryAction } from '../../primitives/Toast';
import { usePort } from '../../../ports/usePort';
import type { OutputPrefs } from '../../engine/outputPrefs';
import { useRangePlayer } from '../../engine/useRangePlayer';
import { APP, playReadiness, playThrough, quietWhileRecording, type DawRead, type PlaybackProvider } from '../../../playback/providers';
import type { LinePassage, LineTake } from './types';

/** The Retry a take that did not play offers is one toast at a time; a newer play or leaving the page withdraws it. */
const TAKE_TOPIC = 'editing-take-retry';

/** Said when a take is no longer under its line: at once for its play, and for a Retry pressed after it left. */
const TAKE_GONE = "This take's line is not on the page any more.";

/** The longest stretch the DAW's preview plays (bridge.MaxPreviewSeconds); a longer take plays its first minute. */
const MAX_PREVIEW_SECONDS = 60;

export interface TakeAuditionOptions {
  caps: DawCapabilities | null;
  /** The page's read of the DAW's capabilities; a failed one is said and asked again. */
  read?: DawRead;
  mediaUrl: (sourceFile: string) => string;
  output?: OutputPrefs;
  /** The line a take belongs to, so the DAW is asked for it by the passage's tokens. */
  passageOf: (take: LineTake) => LinePassage | null;
  /** Stops the chapter's playback before a take plays. */
  stopChapter: () => void;
  /** Says something to the narrator; `retry`, given only when nothing played, plays the take again. */
  notify?: (text: string, retry?: () => void) => void;
}

export interface TakeAudition {
  /** The take playing now, or null. */
  playingId: string | null;
  /** The take whose play is being asked, or that was asked and played nothing (the notice offers Retry), or null; a comparison holds on it. */
  waitingId: string | null;
  /** Plays the take, or stops it when it is the one playing. */
  play: (take: LineTake) => void;
  stop: () => void;
}

/**
 * Hearing one take under a line, through the first provider that is ready (playback/providers.ts): the linked DAW's own preview when its
 * `file_preview` is usable (`DawClient.previewTake`, the host reading its file and range), else the app's range player on the take's own
 * file. A DAW that cannot preview now, or refuses, hands the take to the app with a notice saying why.
 */
export function useTakeAudition({
  caps,
  read,
  mediaUrl,
  output,
  passageOf,
  stopChapter,
  notify = (text, retry) => overlay.toast(text, retry ? { tone: 'error', action: retryAction(retry), topic: TAKE_TOPIC } : undefined),
}: TakeAuditionOptions): TakeAudition {
  const daw = usePort('daw');
  const player = useRangePlayer(mediaUrl, { pre: 0, post: 0 }, output);
  const [playing, setPlaying] = useState<string | null>(null);
  const [inDaw, setInDaw] = useState(false);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [askingId, setAskingId] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const asked = useRef(0);
  const newest = useNewestPlay(TAKE_TOPIC);
  const playAgain = useRef<(take: LineTake) => void>(() => {});
  const live = useRef({ caps, read, notify, passageOf, stopChapter });
  useEffect(() => {
    live.current = { caps, read, notify, passageOf, stopChapter };
  });

  const clearTimer = (): void => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
  };

  // What the last render showed, so stop knows whether the DAW holds a preview of the app's.
  const shown = useRef({ playing, inDaw });
  shown.current = { playing, inDaw };

  const stop = useCallback(() => {
    asked.current += 1;
    clearTimer();
    player.stop();
    // A failed stop leaves at most the rest of one preview playing in the DAW, which ends on its own.
    if (shown.current.playing !== null && shown.current.inDaw) void daw.stopPreview().catch(() => undefined);
    setPlaying(null);
    setInDaw(false);
    setFailedId(null);
    setAskingId(null);
  }, [daw, player]);

  const play = useCallback(
    (take: LineTake) => {
      if (playing === take.id && (inDaw || player.isPlaying)) return stop();
      const { caps: now, read: dawRead, notify: say, passageOf: lineOf, stopChapter: quiet } = live.current;
      const ask = newest.begin();
      setFailedId(null);
      if (now === null && dawRead?.failed) void dawRead.retry();
      const name = dawNameOf(now);
      const preview: PlaybackProvider<LineTake> = {
        name,
        readiness: (t) => {
          const declared = playReadiness(now, 'file_preview', !!dawRead?.failed);
          if (!declared.ready) return declared;
          return lineOf(t) ? { ready: true } : { ready: false, why: TAKE_GONE };
        },
        play: async (t) => {
          const line = lineOf(t)!;
          const mine = asked.current;
          setPlaying(t.id);
          setInDaw(true);
          let why: string;
          try {
            const result = await daw.previewTake(line.chapterId, line.firstToken, line.lastToken, t.id);
            if (result.ok) {
              // The DAW says nothing when a preview ends, so the take is shown playing for as long as it plays.
              timer.current = window.setTimeout(
                () => {
                  if (asked.current !== mine) return;
                  setPlaying(null);
                  setInDaw(false);
                },
                Math.min(t.sourceLength, MAX_PREVIEW_SECONDS) * 1000,
              );
              return { played: true };
            }
            why = result.message;
          } catch (error) {
            why = notAskedSentence(name, error);
          }
          if (asked.current === mine) {
            setPlaying(null);
            setInDaw(false);
          }
          return { played: false, why };
        },
      };
      const app: PlaybackProvider<LineTake> = {
        name: APP,
        readiness: () => ({ ready: true }),
        play: (t) => {
          player.play({ sourceFile: t.sourceFile, rangeStart: t.sourceStart, rangeEnd: t.sourceStart + t.sourceLength });
          setPlaying(t.id);
          return { played: true };
        },
      };
      quiet();
      stop();
      const mine = asked.current;
      setAskingId(take.id);
      // A DAW that has not yet answered may still be recording: the room is kept quiet for it too (a failed capabilities read leaves the check out: the DAW is not known to be there; a failed projectState read does not hold the play back).
      const keepQuiet = now || !dawRead?.failed ? quietWhileRecording(() => daw.projectState(), name) : undefined;
      void playThrough([preview, app], take, { stillWanted: () => asked.current === mine, ...(keepQuiet ? { keepQuiet } : {}) }).then(({ by, notice }) => {
        if (asked.current === mine) {
          setAskingId(null);
          if (by === null) setFailedId(take.id);
        }
        // Retry only when nothing played: a take that fell back to the app and plays is not offered a Retry, which would stop it.
        if (notice && asked.current === mine)
          say(
            notice,
            by === null
              ? () => {
                  // The take as it is now: one trimmed or deleted since is not played from its old range.
                  const current = live.current.passageOf(take)?.takes.find((x) => x.id === take.id);
                  if (!newest.current(ask)) return;
                  if (current) playAgain.current(current);
                  else live.current.notify(TAKE_GONE);
                }
              : undefined,
          );
      });
    },
    [daw, player, playing, inDaw, stop, newest],
  );
  playAgain.current = play;

  useEffect(() => () => clearTimer(), []);

  return { playingId: inDaw || player.isPlaying ? playing : null, waitingId: askingId ?? failedId, play, stop };
}
