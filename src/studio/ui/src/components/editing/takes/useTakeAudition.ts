import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import type { OutputPrefs } from '../../engine/outputPrefs';
import { useRangePlayer } from '../../engine/useRangePlayer';
import { CHECKING, READ_FAILED, playRoute, type DawRead } from '../follow/playRoute';
import type { LinePassage, LineTake } from './types';

/** Said after every reason the DAW did not play a take: with a DAW linked, the app never plays a take itself (#2251 item 32). */
export const TAKE_DAW_ONLY = 'Nothing played: while a DAW is linked, takes play only through it.';

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
 * Hearing one take under a line. With a linked DAW that can play the chapter (`playRoute`), the take plays through the DAW's own preview
 * (`DawClient.previewTake`, the host reading its file and range), and when the DAW cannot play it nothing does and a toast says why. Without
 * one, the app's range player plays the take's own file.
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
      const route = playRoute(now);
      if (route.kind === 'unknown') {
        if (dawRead?.failed) {
          say(READ_FAILED);
          void dawRead.retry();
        } else say(CHECKING);
        return;
      }
      quiet();
      stop();
      if (route.kind === 'app') {
        player.play({ sourceFile: take.sourceFile, rangeStart: take.sourceStart, rangeEnd: take.sourceStart + take.sourceLength });
        setPlaying(take.id);
        return;
      }
      const line = lineOf(take);
      if (!line) return say(`This take's line is not on the page any more. ${TAKE_DAW_ONLY}`);
      const mine = asked.current;
      setPlaying(take.id);
      setInDaw(true);
      daw.previewTake(line.chapterId, line.firstToken, line.lastToken, take.id).then(
        (result) => {
          if (asked.current !== mine) return;
          if (!result.ok) {
            setPlaying(null);
            setInDaw(false);
            return say(`${result.message} ${TAKE_DAW_ONLY}`);
          }
          // The DAW says nothing when a preview ends, so the take is shown playing for as long as it plays.
          timer.current = window.setTimeout(
            () => {
              if (asked.current !== mine) return;
              setPlaying(null);
              setInDaw(false);
            },
            Math.min(take.sourceLength, MAX_PREVIEW_SECONDS) * 1000,
          );
        },
        (error: unknown) => {
          if (asked.current !== mine) return;
          setPlaying(null);
          setInDaw(false);
          say(`${route.name} was not asked: ${error instanceof Error ? error.message : String(error)} ${TAKE_DAW_ONLY}`);
        },
      );
    },
    [daw, player, playing, inDaw, stop],
  );

  useEffect(() => () => clearTimer(), []);

  return { playingId: inDaw || player.isPlaying ? playing : null, play, stop };
}
