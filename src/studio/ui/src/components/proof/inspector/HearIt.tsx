import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePendingAction } from '../../../hooks/usePendingAction';
import { usePort } from '../../../ports/usePort';
import type { FindingNavigation } from '../../../api/contracts/findings';
import type { Finding, NarrationApi } from '../../../types';
import { useRangePlayer } from '../../engine/useRangePlayer';
import { IconButton } from '../../primitives/IconButton';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { overlay } from '../../../overlay/overlayService';
import { retryAction } from '../../primitives/Toast';
import { PLAY_DEADLINE_MS } from '../../engine/ShowInDaw';
import { useNewestPlay } from '../../../playback/useNewestPlay';
import { APP, playReadiness, playThrough, quietWhileRecording, recordingSentence, type PlaybackProvider } from '../../../playback/providers';

/** The audio heard either side of a note. The host's loop pads by the same amount (`bridge.ContextPaddingSeconds`). */
export const HEAR_AROUND_SECONDS = 3;
/** The button's names: `press` in `useProofKeys` finds the button by them. */
export const HEAR_LABEL = 'Hear it';
export const STOP_HEARING_LABEL = 'Stop hearing it';

/** The two host calls Hear it makes; the app player streams through the tracks port's `mediaUrl`. */
export type HearItApi = Pick<NarrationApi, 'findingsLoop' | 'findingsStopLoop'>;

const ROLL = { pre: HEAR_AROUND_SECONDS, post: HEAR_AROUND_SECONDS };
/** One Retry toast at a time: a newer press, or leaving the note, withdraws it. */
const HEAR_TOPIC = 'proof-hear-it-retry';
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
 * Proof's Hear it (mock Inspector "Play ±3 s (Space)", superseding PRD line 50): plays the note with `HEAR_AROUND_SECONDS` either side,
 * through the playback providers (playback/providers.ts): the DAW's loop (`FindingsLoop`, the `navigate` capability) first, then the app's
 * range player on the note's source file. A DAW that cannot loop now, refuses for any reason but recording, or fails hands the note to the
 * app, and a toast with Retry says why. A second press stops whichever is playing, and leaving
 * the note stops a DAW loop this button started. The DAW's sentence is a toast with Retry when neither can play. The Pickups page's Hear through the
 * DAW (research note A7) is a separate stream; this file is the shape it can share.
 */
export function HearIt({
  finding,
  api,
  dawName,
  capabilities,
  capabilitiesFailed = false,
  onReadAgain,
  inert = false,
  onResult,
}: {
  finding: Finding;
  api: HearItApi;
  dawName: string;
  /** What the DAW can do, once read (undefined until then), and whether the read failed. */
  capabilities?: DawCapabilities;
  capabilitiesFailed?: boolean;
  /** Reads the DAW's capabilities again; asked at a press after a failed read, which does not wait for it. */
  onReadAgain?: () => void;
  /** The evidence changed: Hear it is off until the narrator takes the new evidence. */
  inert?: boolean;
  /** What happened, for the row's status line; `undefined` clears it. */
  onResult: (result: { message: string; failed: boolean } | undefined) => void;
}) {
  const tracks = usePort('tracks');
  const daw = usePort('daw');
  const player = useRangePlayer(tracks.mediaUrl, ROLL);
  const action = usePendingAction();
  const [playing, setPlaying] = useState<Playing>(null);
  const report = useRef(onResult);
  report.current = onResult;
  const setResult = (result: { message: string; failed: boolean } | undefined) => report.current(result);
  const looped = useRef(false);
  const stopLoop = useRef(api.findingsStopLoop);
  stopLoop.current = api.findingsStopLoop;
  // The newest press, so a Retry offered for an older one, or after the note was left, plays nothing.
  const newest = useNewestPlay(HEAR_TOPIC);
  const lastAsk = useRef(0);
  const again = useRef<() => void>(() => {});

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
    // The clip ended: its "Playing" line goes with it.
    report.current(undefined);
    if (loadError)
      overlay.toast(APP_FAILED, { tone: 'error', action: retryAction(() => newest.current(lastAsk.current) && again.current()), topic: HEAR_TOPIC });
  }, [playing, isPlaying, loadError, newest]);

  const stop = () =>
    action.run('hear', async () => {
      lastAsk.current = newest.begin();
      if (playing === 'app') player.stop();
      else {
        looped.current = false;
        try {
          await api.findingsStopLoop();
        } catch (error) {
          overlay.toast(`The DAW was not asked to stop: ${apiErrorMessage(error)}`, { tone: 'error' });
        }
      }
      setPlaying(null);
      setResult(undefined);
    });

  const start = () =>
    action.run('hear', async () => {
      const press = newest.begin();
      lastAsk.current = press;
      // A Retry while the app's fallback plays starts over: the app's clip stops first, so two players never run.
      player.stop();
      if (capabilitiesFailed) onReadAgain?.();
      setResult(undefined);
      const loop: PlaybackProvider<Finding> = {
        name: dawName,
        // A DAW that has not yet said what it can do is asked at once: no check stands between the click and the sound.
        readiness: () => playReadiness(capabilities ?? null, 'navigate', capabilitiesFailed),
        play: async (note, { late }) => {
          let answer: FindingNavigation;
          try {
            answer = await api.findingsLoop(note.id);
          } catch (error) {
            return { played: false, why: `The DAW was not asked: ${apiErrorMessage(error)}` };
          }
          if (answer.outcome === 'looping') {
            // The deadline passed while the DAW was answering: the app plays in its place, so this loop is stopped, not left beside it.
            // A loop a newer press started since is that press's, and is not stopped here.
            if (late()) {
              if (!looped.current) void api.findingsStopLoop().catch(() => undefined);
              return { played: true };
            }
            looped.current = true;
            setPlaying('daw');
            return { played: true };
          }
          // A DAW that is recording keeps the room quiet: the app does not play over it.
          if (answer.outcome === 'refused' && answer.reason === 'recording') return { played: false, why: recordingSentence(dawName), final: true };
          return { played: false, why: answer.outcome === 'refused' ? answer.message : `${dawName} did not loop the note.` };
        },
      };
      const app: PlaybackProvider<Finding> = {
        name: APP,
        readiness: (note) => (appRange(note) ? { ready: true } : { ready: false, why: NO_FILE }),
        play: (note) => {
          player.play(appRange(note)!);
          setPlaying('app');
          return { played: true };
        },
      };
      const { by, notice } = await playThrough([loop, app], finding, {
        // Leaving the note, or a newer press, while the DAW is asked: the app does not play an old note late.
        stillWanted: () => newest.current(press),
        // A DAW that is recording keeps the room quiet whatever stopped it from looping: the app does not play over it (as a take does).
        keepQuiet: quietWhileRecording(() => daw.projectState(), dawName),
        // A click that plays is never silent for long: a DAW that has not answered passes the note to the app.
        deadlineMs: PLAY_DEADLINE_MS,
      });
      if (by === dawName) return setResult({ message: `Playing in ${dawName}, ${HEAR_AROUND_SECONDS} s either side.`, failed: false });
      // What did not play, and why, is a toast, never a line in the row. Retry only when nothing played: a note that fell back to the app and plays is not
      // offered a Retry, which would stop it. A press that was replaced says nothing.
      if (notice && newest.current(press))
        overlay.toast(
          notice,
          by === null ? { tone: 'error', action: retryAction(() => newest.current(press) && again.current()), topic: HEAR_TOPIC } : undefined,
        );
      if (by === APP) setResult({ message: `Playing in the app, ${HEAR_AROUND_SECONDS} s either side.`, failed: false });
    });
  again.current = () => void start();

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
