import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import type { OutputPrefs } from '../../engine/outputPrefs';
import { useRangePlayer } from '../../engine/useRangePlayer';
import { APP, CHECKING, dawReadiness, playThrough, quietWhileRecording, type DawRead, type PlaybackProvider } from '../../../playback/providers';
import type { LinePassage, LineTake } from './types';

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
  notify?: (text: string) => void;
}

export interface TakeAudition {
  /** The take playing now, or null. */
  playingId: string | null;
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
  notify = (text) => overlay.toast(text),
}: TakeAuditionOptions): TakeAudition {
  const daw = usePort('daw');
  const player = useRangePlayer(mediaUrl, { pre: 0, post: 0 }, output);
  const [playing, setPlaying] = useState<string | null>(null);
  const [inDaw, setInDaw] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const asked = useRef(0);
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
  }, [daw, player]);

  const play = useCallback(
    (take: LineTake) => {
      if (playing === take.id && (inDaw || player.isPlaying)) return stop();
      const { caps: now, read: dawRead, notify: say, passageOf: lineOf, stopChapter: quiet } = live.current;
      if (now === null && dawRead?.failed) void dawRead.retry();
      const name = now?.daw ?? 'The DAW';
      const preview: PlaybackProvider<LineTake> = {
        name,
        readiness: (t) => {
          const declared = dawReadiness(now, 'file_preview', !!dawRead?.failed);
          if (!declared.ready) return declared;
          return lineOf(t) ? { ready: true } : { ready: false, why: "This take's line is not on the page any more." };
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
            why = `${name} was not asked: ${error instanceof Error ? error.message : String(error)}`;
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
      // A DAW still answering plays nothing, and the chapter keeps playing.
      if (now === null && !dawRead?.failed) return say(CHECKING);
      quiet();
      stop();
      const mine = asked.current;
      const keepQuiet = now ? quietWhileRecording(() => daw.projectState(), name) : undefined;
      void playThrough([preview, app], take, { stillWanted: () => asked.current === mine, ...(keepQuiet ? { keepQuiet } : {}) }).then(({ notice }) => {
        if (notice && asked.current === mine) say(notice);
      });
    },
    [daw, player, playing, inDaw, stop],
  );

  useEffect(() => () => clearTimer(), []);

  return { playingId: inDaw || player.isPlaying ? playing : null, play, stop };
}
