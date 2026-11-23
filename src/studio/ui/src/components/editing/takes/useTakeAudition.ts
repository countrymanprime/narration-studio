import { useCallback, useEffect, useRef, useState } from 'react';
import { dawNameOf, PLAY_DEADLINE_MS } from '../../engine/ShowInDaw';
import { notAskedSentence } from '../../../studio/dawNames';
import { stopAndSay } from '../../../playback/stopAndSay';
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
  // The press whose DAW preview is the one playing (or being started): the preview is the DAW's file preview, not its transport, so it is its own thing
  // beside the transport's `dawPlayOwner` (the script, Hear it, Pickups play the transport). Null after Stop. A preview that is answered for another press
  // is stopped only when no newer press owns the preview.
  const previewOwner = useRef<number | null>(null);
  /** An older press's preview that landed while a newer press owned the preview: stopped if that press ends without a preview, dropped if it plays one. */
  const staleLanded = useRef(false);
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

  /** Stops the DAW's preview; a stop that fails says where to stop it (the one stop-and-say, `playback/stopAndSay.ts`). */
  const stopPreview = useCallback(
    (name: string): void => {
      void stopAndSay(
        name,
        (text) => live.current.notify(text),
        () => daw.stopPreview().then((result) => (result.ok ? null : result.message)),
      );
    },
    [daw],
  );

  // What the last render showed, so stop knows whether the DAW holds a preview of the app's.
  const shown = useRef({ playing, inDaw });
  shown.current = { playing, inDaw };

  const stop = useCallback(() => {
    asked.current += 1;
    clearTimer();
    previewOwner.current = null;
    staleLanded.current = false;
    player.stop();
    // A failed stop leaves at most the rest of one preview playing in the DAW, which ends on its own.
    if (shown.current.playing !== null && shown.current.inDaw) stopPreview(dawNameOf(live.current.caps));
    setPlaying(null);
    setInDaw(false);
    setFailedId(null);
    setAskingId(null);
  }, [player, stopPreview]);

  const play = useCallback(
    (take: LineTake) => {
      if (playing === take.id && (inDaw || player.isPlaying)) return stop();
      const { caps: now, read: dawRead, notify: say, passageOf: lineOf, stopChapter: quiet } = live.current;
      const ask = newest.begin();
      setFailedId(null);
      if (now === null && dawRead?.failed) void dawRead.retry();
      const name = dawNameOf(now);
      // Stops a DAW preview nobody waits for any more (the deadline passed, or Stop or a newer take came); a stop that failed says where to stop it.
      const dropPreview = (): void => stopPreview(name);
      const preview: PlaybackProvider<LineTake> = {
        name,
        readiness: (t) => {
          const declared = playReadiness(now, 'file_preview', !!dawRead?.failed);
          if (!declared.ready) return declared;
          return lineOf(t) ? { ready: true } : { ready: false, why: TAKE_GONE };
        },
        play: async (t, { late }) => {
          const line = lineOf(t)!;
          const mine = asked.current;
          setPlaying(t.id);
          setInDaw(true);
          let why: string;
          try {
            previewOwner.current = mine;
            const result = await daw.previewTake(line.chapterId, line.firstToken, line.lastToken, t.id);
            if (result.ok) {
              // The deadline passed while the DAW was answering (the app plays in its place), or Stop or a newer take came: this preview is stopped, not
              // left beside what plays; a preview a newer take started since is that take's.
              if (late() || asked.current !== mine) {
                if (previewOwner.current === null || previewOwner.current === mine) {
                  previewOwner.current = null;
                  dropPreview();
                } else staleLanded.current = true;
                return { played: true };
              }
              staleLanded.current = false;
              // The DAW says nothing when a preview ends, so the take is shown playing for as long as it plays.
              timer.current = window.setTimeout(
                () => {
                  if (asked.current !== mine) return;
                  // The preview ended by itself: nobody owns it now.
                  if (previewOwner.current === mine) previewOwner.current = null;
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
          // A refusal that comes after the deadline is the DAW's late word: the app plays by then, and its state is not cleared under it.
          if (previewOwner.current === mine) previewOwner.current = null;
          if (asked.current === mine && !late()) {
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
          // The DAW did not play it (or answered too late): the take is shown playing in the app, not in the DAW.
          clearTimer();
          setInDaw(false);
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
      // A click that plays is never silent for long: a DAW that has not answered the preview passes the take to the app.
      void playThrough([preview, app], take, {
        stillWanted: () => asked.current === mine,
        deadlineMs: PLAY_DEADLINE_MS,
        ...(keepQuiet ? { keepQuiet } : {}),
      }).then(({ by, notice }) => {
        // This press ended in the app or nowhere: it owns no preview, and an earlier take's preview that landed meanwhile is stopped now.
        if (by !== name && previewOwner.current === mine) {
          previewOwner.current = null;
          if (staleLanded.current) dropPreview();
          staleLanded.current = false;
        }
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
    [daw, player, playing, inDaw, stop, newest, stopPreview],
  );
  playAgain.current = play;

  useEffect(
    () => () => {
      clearTimer();
      // A preview answered after the page was left is stopped, not left playing.
      asked.current += 1;
      previewOwner.current = null;
    },
    [],
  );

  return { playingId: inDaw || player.isPlaying ? playing : null, waitingId: askingId ?? failedId, play, stop };
}
