import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePendingAction } from '../../../hooks/usePendingAction';
import { usePort } from '../../../ports/usePort';
import type { FindingNavigation } from '../../../api/contracts/findings';
import type { Finding, NarrationApi } from '../../../types';
import { useRangePlayer } from '../../engine/useRangePlayer';
import { IconButton } from '../../primitives/IconButton';

/** The audio heard either side of a note. The host's loop pads by the same amount (`bridge.ContextPaddingSeconds`). */
export const HEAR_AROUND_SECONDS = 3;
/** The button's names: `press` in `useProofKeys` finds the button by them. */
export const HEAR_LABEL = 'Hear it';
export const STOP_HEARING_LABEL = 'Stop hearing it';

/** The two host calls Hear it makes; the app player streams through the tracks port's `mediaUrl`. */
export type HearItApi = Pick<NarrationApi, 'findingsLoop' | 'findingsStopLoop'>;

const ROLL = { pre: HEAR_AROUND_SECONDS, post: HEAR_AROUND_SECONDS };
const NO_TIME = 'This note has no time in its audio to play.';
const NO_FILE = 'The app has no audio file for this note either.';
const APP_FAILED = 'The audio file for this note could not be played.';

type Playing = 'daw' | 'app' | null;

/** The app's own player can play the note: it names its source file and a time in it. */
const appRange = (finding: Finding) =>
  finding.source.file && finding.time_range?.source_start !== undefined
    ? {
        sourceFile: finding.source.file,
        rangeStart: finding.time_range.source_start,
        rangeEnd: finding.time_range.source_end ?? finding.time_range.source_start,
      }
    : undefined;

/**
 * Proof's Hear it (mock Inspector "Play ±3 s (Space)", superseding PRD line 50): plays the note with `HEAR_AROUND_SECONDS` either side.
 * It loops the note in the DAW through `FindingsLoop` when the DAW can; when the DAW refuses for any reason but recording, or the call
 * fails, it plays the note's source file through the app's range player instead. A second press stops whichever is playing, and leaving
 * the note stops a DAW loop this button started. The DAW's sentence is shown when neither can play. The Pickups page's Hear through the
 * DAW (research note A7) is a separate stream; this file is the shape it can share.
 */
export function HearIt({
  finding,
  api,
  dawName,
  inert = false,
  onResult,
}: {
  finding: Finding;
  api: HearItApi;
  dawName: string;
  /** The evidence changed: Hear it is off until the narrator takes the new evidence. */
  inert?: boolean;
  /** What happened, for the row's status line; `undefined` clears it. */
  onResult: (result: { message: string; failed: boolean } | undefined) => void;
}) {
  const tracks = usePort('tracks');
  const player = useRangePlayer(tracks.mediaUrl, ROLL);
  const action = usePendingAction();
  const [playing, setPlaying] = useState<Playing>(null);
  const report = useRef(onResult);
  report.current = onResult;
  const setResult = (result: { message: string; failed: boolean } | undefined) => report.current(result);
  const looped = useRef(false);
  const stopLoop = useRef(api.findingsStopLoop);
  stopLoop.current = api.findingsStopLoop;

  // Leaving the note (the Inspector remounts per note) stops a DAW loop this button started; the app player stops itself on unmount.
  useEffect(
    () => () => {
      if (looped.current) void stopLoop.current().catch(() => undefined);
    },
    [],
  );

  // The app player ended its range or could not load the file: the button goes back to Hear it.
  const { isPlaying, loadError } = player;
  useEffect(() => {
    if (playing !== 'app' || isPlaying) return;
    setPlaying(null);
    if (loadError) report.current({ message: APP_FAILED, failed: true });
  }, [playing, isPlaying, loadError]);

  const stop = () =>
    action.run('hear', async () => {
      if (playing === 'app') player.stop();
      else {
        looped.current = false;
        try {
          await api.findingsStopLoop();
        } catch (error) {
          setResult({ message: `The DAW was not asked to stop: ${apiErrorMessage(error)}`, failed: true });
        }
      }
      setPlaying(null);
      setResult(undefined);
    });

  const start = () =>
    action.run('hear', async () => {
      setResult(undefined);
      let answer: FindingNavigation | undefined;
      let failure = '';
      try {
        answer = await api.findingsLoop(finding.id);
      } catch (error) {
        failure = `The DAW was not asked: ${apiErrorMessage(error)}`;
      }
      if (answer?.outcome === 'looping') {
        looped.current = true;
        setPlaying('daw');
        setResult({ message: `Playing in ${dawName}, ${HEAR_AROUND_SECONDS} s either side. Press again to stop.`, failed: false });
        return;
      }
      const refusal = answer?.outcome === 'refused' ? answer : undefined;
      // A DAW that is recording keeps the room quiet: the app does not play over it.
      if (refusal?.reason === 'recording') return setResult({ message: refusal.message, failed: true });
      const range = appRange(finding);
      if (!range) return setResult({ message: `${refusal?.message ?? failure} ${NO_FILE}`.trim(), failed: true });
      player.play(range);
      setPlaying('app');
      setResult({ message: `Playing in the app, ${HEAR_AROUND_SECONDS} s either side. Press again to stop.`, failed: false });
    });

  const on = playing !== null;
  return (
    <IconButton
      action={on ? 'stop' : 'play'}
      label={on ? STOP_HEARING_LABEL : `${HEAR_LABEL}, ${HEAR_AROUND_SECONDS} s either side`}
      aria-keyshortcuts="Space"
      disabled={inert}
      disabledReason={finding.time_range ? undefined : NO_TIME}
      pending={action.isPending('hear')}
      onClick={() => void (on ? stop() : start())}
    />
  );
}
