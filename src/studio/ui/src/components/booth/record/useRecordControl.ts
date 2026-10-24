import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities, DawKind, DawProjectState, DawResult } from '../../../api/contracts/daw';
import type { ReadAloudReaperReason, ReadAloudReaperStatus } from '../../../api/contracts/teleprompter';
import { usePort } from '../../../ports/usePort';
import { recorderName, recorderNameCapital, recordsInApp } from '../../../studio/dawNames';
import { apiErrorMessage } from '../../../api/errorMessage';
import { playTakeTone } from '../takeTone';
import { recordCheck, type ChapterRecordState, type OpenProject, type RecordRefusal } from './recordCheck';
import type { RecordSetupFacts } from './recordSetupModel';

/** How often the Booth asks the DAW again while Record cannot start or the last read failed: a lost event must not leave a notice up for ever. */
export const POLL_MS = 4000;
/** The topic of what the Booth says about how a take ended without the narrator's own Stop: gone once the next take starts. */
export const TAKE_TOPIC = 'daw-take';
/** How often the Booth asks again while Record is ready and idle: another project can be opened in the DAW with no event to say so. */
export const READY_POLL_MS = 15_000;

/** How long after a take starts that a press is not taken for Stop: a double click or a key repeat must not start and end a take at once. */
export const START_GUARD_MS = 1000;
/** What the Booth says when a press inside that guard is ignored. */
export const START_GUARD_SENTENCE = 'Recording just started. Press Stop again in a moment if you meant to stop.';

function tracksOf(status: ReadAloudReaperStatus, reason?: ReadAloudReaperReason): ChapterRecordState['tracks'] {
  if (status !== 'no_link') return 'one';
  return reason === 'several_links' ? 'several' : 'none';
}

/**
 * Why a press of Record did not start a take: a precondition the Booth already knew (`recordCheck`'s codes), a DAW it cannot hear (`unknown`),
 * the host's refusal at the press (`host_refused`) or a host call that failed (`failed`). The page turns each into a dialog that fixes it or a
 * message with an action, never only the footer's sentence.
 */
export type RecordBlock = { cause: RecordRefusal['code'] | 'unknown' | 'host_refused' | 'failed'; reason: string };

export type RecordControlState = {
  capabilities: DawCapabilities | null;
  /** The DAW project as last saved and whether it has unsaved changes; null until the DAW port answers. */
  project: DawProjectState | null;
  recording: boolean;
  /** False when the DAW was already recording and this app did not start the take; the leave guard reads it. */
  startedByApp: boolean;
  /** Why Record cannot start, or the host's refusal of the last press; '' when nothing stops it. */
  reason: string;
  /** What stops a press now, or null when Record can start: the same precondition the press would be refused for. */
  gate: RecordBlock | null;
  disabled: boolean;
  /** Start or stop a take (the `reading.toggle` command), a start at `at` seconds when it is a punch. A start that a precondition stops says why through `notify` and starts nothing. Answers whether the take started. A narrator's press within `START_GUARD_MS` of a start is ignored (a double click or key repeat is not a Stop); an `automatic` stop, the Booth's own, is never. */
  toggle: (at?: number, how?: { automatic?: boolean }) => Promise<boolean>;
  /** The take was stopped by another path (the leave guard's "Stop and leave"): the Booth stops holding it now, not when the DAW's next heartbeat says so. */
  stopped: () => void;
  /** Read the capabilities again, after a setting the Booth itself changed. */
  refresh: () => void;
  /** The visible Check again: a fresh read now, whatever a timer or an event last said. */
  checkAgain: () => void;
  /** When (ms since the epoch) the DAW last answered, by a read or an event; null until it has. */
  checkedAt: number | null;
  /** True while the last read failed: the picture above is then the last one heard, not the DAW's answer now. */
  readFailed: boolean;
  /** The host's link facts for the setup steps (whether a project file is linked, where the launcher file is), read with the capabilities. */
  facts: RecordSetupFacts;
  /** True while the last read of those facts failed; `facts` is then the last heard, and nothing is concluded from it. */
  factsFailed: boolean;
  /** True once the link facts have been read (or failed to be): until then nothing is concluded about whether a project file is linked. */
  factsLoaded: boolean;
};

/** The sentence for a DAW that has gone quiet: what the Booth can and cannot tell, and the way out. */
function cantTell(daw: DawKind | undefined, checkedAt: number | null, now: number): string {
  const heard = checkedAt === null ? 'not heard yet' : `last heard ${Math.max(0, Math.round((now - checkedAt) / 1000))} s ago`;
  return `Can't tell whether ${recorderName(daw)} is ready (${heard}). Press Check again.`;
}

/**
 * What the Booth says when the DAW answered that a take this app started has stopped: the narrator's own Stop there. The app's own
 * recorder has no other place to stop a take, so its take ended by itself: `why` is the recorder's own sentence for it, if it has one.
 */
export const stoppedInDaw = (daw: DawKind | undefined, why = '') =>
  recordsInApp(daw)
    ? `${why ? `${why.replace(/[.\s]+$/, '')}. ` : ''}The take ended and the audio before it is kept in the project's Recordings folder; press Record to start the next one.`
    : `${recorderNameCapital(daw)} stopped recording. The take ended there; press Record to start the next one.`;

/** What the Booth says once a DAW that went quiet during a take answers again: its own take ended when it went quiet, and what the DAW did with the audio is for the narrator to check. */
const backInDaw = (daw: DawKind | undefined) => {
  const name = recorderNameCapital(daw);
  return `${name} answers again. This window ended its take when ${name} went quiet; check in ${name} whether that take was kept.`;
};

/** What the Booth says when the DAW stopped answering during a take: it did not say the take ended, and may still be recording. */
const lostInDaw = (daw: DawKind | undefined) => {
  const name = recorderNameCapital(daw);
  return `${name} stopped answering, so the Booth can't tell whether the take is still running. Check ${name}; press Record for the next take once it answers.`;
};

/**
 * The Booth's Record control over the DAW port: the capabilities and the host's read of the chapter's track give `recordCheck`, a press
 * calls `recordStart(chapterId)` or `recordStop()` once, and a refused call shows the host's sentence and changes nothing.
 * Nothing is armed first, the host arms and starts in one call, and nothing stops a take when the Booth unmounts: the leave
 * guard (`useBoothLeaveGuard`) owns that question. The project's saved state is read when the Booth opens and again after each take
 * starts or stops, the moments its unsaved changes are likely to change.
 */
// A take this app started and has not seen end. The Booth can be left without its leave question (the mouse's Back button, a window that
// reloads its page): the take goes on in the DAW, and when the Booth is opened again that take is still the app's own to stop. A take the app
// never started (the DAW was already recording when the app opened) is not claimed, and a page reload forgets this, as it should.
let appTakeRunning = false;
// When the last take started (ms since the epoch): a stop pressed inside START_GUARD_MS of it is ignored.
let lastStartAt = 0;
/** Forgets a take the app started; for tests that share the module. */
export const forgetAppTake = (): void => {
  appTakeRunning = false;
  lastStartAt = 0;
};
/** Lets the next Stop through as if the start guard had passed; for tests that start and stop at once. */
export const skipStartGuard = (): void => {
  lastStartAt = 0;
};

export function useRecordControl({
  chapterId,
  notify,
  onBlocked,
  onStopped,
}: {
  chapterId: string;
  notify: (sentence: string, topic?: string) => void;
  /** A press that did not start a take, and why; absent, the sentence is said as a message. */
  onBlocked?: (block: RecordBlock) => void;
  /** A DAW (not the app's own recorder) stopped the take on a press: its answer, with the undo points it left. Awaited before the take reads as stopped. */
  onStopped?: (result: DawResult) => void | Promise<void>;
}): RecordControlState {
  const daw = usePort('daw');
  const system = usePort('system');
  const teleprompter = usePort('teleprompter');
  const recorder = usePort('recording');
  const [capabilities, setCapabilities] = useState<DawCapabilities | null>(null);
  const [project, setProject] = useState<DawProjectState | null>(null);
  const [match, setMatch] = useState<{ chapterId: string; tracks: ChapterRecordState['tracks']; message: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [refused, setRefused] = useState<{ chapterId: string; sentence: string } | null>(null);
  const busy = useRef(false);
  const readsTracks = !!capabilities?.capabilities.track_state?.available;

  // Read on open, on refresh() and checkAgain(), when the window is focused again, and on a timer while Record cannot start or the last read
  // failed; kept current by daw_capabilities_changed. An event that arrives while a read is out wins: that read is dropped as stale.
  const [reads, setReads] = useState(0);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const events = useRef(0);
  // Whether the DAW answered the last time it was heard, kept apart from state so a transport event in the same tick sees it.
  const reachableRef = useRef<boolean | null>(null);
  // Set when a take ended because the DAW went quiet: the next time it answers, the narrator is told what became of the take.
  const lostTake = useRef(false);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const blockedRef = useRef(onBlocked);
  blockedRef.current = onBlocked;
  const block = (blocked: RecordBlock) => (blockedRef.current ? blockedRef.current(blocked) : notifyRef.current(blocked.reason));
  // A take the recorder ended by itself (the microphone unplugged, the disk full): its own sentence says why, read when the end is heard.
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const announceEnd = (name: DawKind | undefined) => {
    if (!recordsInApp(name)) return void notifyRef.current(stoppedInDaw(name), TAKE_TOPIC);
    void recorderRef.current
      .recorderState()
      .then((state) => state.message)
      .catch(() => '')
      .then((why) => notifyRef.current(stoppedInDaw(name, why), TAKE_TOPIC));
  };
  const hearAgain = (next: DawCapabilities) => {
    if (next.reachable && lostTake.current) {
      lostTake.current = false;
      notifyRef.current(backInDaw(next.daw), TAKE_TOPIC);
    }
  };
  useEffect(() => {
    let current = true;
    const unsubscribe = daw.subscribeCapabilities?.((next) => {
      events.current += 1;
      if (!current) return;
      reachableRef.current = next.reachable;
      hearAgain(next);
      setCapabilities(next);
      setReadFailed(false);
      setCheckedAt(Date.now());
    });
    return () => {
      current = false;
      unsubscribe?.();
    };
  }, [daw]);
  useEffect(() => {
    let current = true;
    const heard = events.current;
    daw
      .capabilities()
      .then((c) => {
        if (!current || heard !== events.current) return;
        reachableRef.current = c.reachable;
        hearAgain(c);
        setCapabilities(c);
        setReadFailed(false);
        setCheckedAt(Date.now());
      })
      // The last picture stays, marked as not current: the narrator is told the Booth cannot tell, never shown a stale answer as fact.
      .catch(() => {
        if (!current || heard !== events.current) return;
        reachableRef.current = false;
        setReadFailed(true);
      });
    return () => {
      current = false;
    };
  }, [daw, reads]);
  const refresh = useCallback(() => setReads((n) => n + 1), []);

  // The link facts the setup steps and the wrong-project refusal read, re-read with every capability read and when the DAW's reachability changes.
  const [link, setLink] = useState<{ facts: RecordSetupFacts; open: OpenProject; failed: boolean; loaded: boolean }>({
    facts: { dawFileLinked: false, launcherPath: '' },
    open: 'unknown',
    failed: false,
    loaded: false,
  });
  const reachable = capabilities?.reachable;
  useEffect(() => {
    let live = true;
    system
      .bootstrap()
      .then((data) => {
        if (!live) return;
        const facts = { dawFileLinked: data.dawFileLinked, launcherPath: data.runtime.Reaper?.launcherPath ?? '' };
        // The host reports "does not match" as false while nothing is linked or the DAW is silent: only a linked, heard DAW that disagrees is a refusal.
        const open: OpenProject = !data.dawFileLinked || !data.dawReachable ? 'unknown' : data.dawProjectMatches ? 'same' : 'different';
        setLink({ facts, open, failed: false, loaded: true });
      })
      // A failed read keeps what was last heard and says it failed: it never turns a linked project into "not linked" or a refusal.
      .catch(() => live && setLink((last) => ({ ...last, failed: true, loaded: true })));
    return () => {
      live = false;
    };
  }, [system, reads, reachable]);
  // Record is refused for the chapter's own track, or by a take running in the DAW that this app did not start: a notice is up for something the
  // narrator fixes in the DAW, so it is read again on the timer as well.
  // The app's own take, still running in the DAW after the Booth was left and opened again, is taken back; any other take is "elsewhere".
  // The app's own recorder's take is always the app's: nothing else starts one, so a take it reports when the Booth opens is taken back too.
  // Only then: a take this window started and ended is over, whatever the project state it has not yet re-read still says.
  const inApp = recordsInApp(capabilities?.daw);
  const recordedHere = useRef(false);
  const adopt = !recording && (appTakeRunning || (inApp && !recordedHere.current)) && project?.playState === 'recording';
  const wasRecording = useRef(false);
  // In this order: a take that just ended clears the flag before the next effect asks whether to take one back.
  useEffect(() => {
    if (recording) {
      appTakeRunning = true;
      recordedHere.current = true;
    } else if (wasRecording.current) appTakeRunning = false;
    wasRecording.current = recording;
  }, [recording]);
  useEffect(() => {
    // Read here, after the effect above has run: a take that just ended has cleared its flag by now.
    if (!recording && (appTakeRunning || (inApp && !recordedHere.current)) && project?.playState === 'recording') {
      heardRecording.current = true;
      setRecording(true);
    }
  }, [recording, project?.playState, inApp]);
  // Nothing but this app starts a take of its own recorder, so none is "elsewhere".
  const takeElsewhere = !recording && !adopt && !inApp && project?.playState === 'recording';
  const refusedForChapter = takeElsewhere || (match?.chapterId === chapterId && (match.tracks === 'none' || match.tracks === 'several'));
  const unready = !capabilities || !!capabilities.capabilities.record?.available === false || readFailed || refusedForChapter || link.open === 'different';
  useEffect(() => {
    const again = () => setReads((n) => n + 1);
    const onVisible = () => document.visibilityState === 'visible' && again();
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(again, unready || recording ? POLL_MS : READY_POLL_MS);
    return () => {
      window.removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [unready, recording]);

  // A take the narrator stopped in the DAW itself ends here too, once the DAW has been heard recording: the transport is pushed only on
  // a change, so the stopped state the subscription hears first, from before the take started, is not taken for its end.
  const heardRecording = useRef(false);
  useEffect(() => {
    if (!recording) {
      heardRecording.current = false;
      return;
    }
    return daw.subscribeTransport?.((transport) => {
      if (transport.recording) heardRecording.current = true;
      // A press is being answered: the stop it asks for pushes this very event before its own answer, and that is the narrator's Stop, not a take that ended.
      else if (heardRecording.current && !busy.current) {
        heardRecording.current = false;
        setRecording(false);
        // A stop pushed after the heartbeat went is the DAW going quiet, not the DAW saying the take ended.
        if (reachableRef.current === false) lostTake.current = true;
        if (reachableRef.current === false) notify(lostInDaw(capabilities?.daw), TAKE_TOPIC);
        else announceEnd(capabilities?.daw);
      }
    });
  }, [daw, recording, notify, capabilities?.daw]);

  // The transport is pushed only on a change, so one lost event would leave the REC pill wrong for ever. While a take runs the project's
  // play state is read on a timer too: a DAW that says it is not recording after having said it was (or three times running, for a take
  // whose start and stop were both missed) ends the take here, in the same sentence as the event would have.
  useEffect(() => {
    if (!recording) return;
    let current = true;
    let misses = 0;
    let failures = 0;
    const timer = window.setInterval(() => {
      daw
        .projectState()
        .then((state) => {
          if (!current) return;
          failures = 0;
          if (state.playState === 'recording') {
            heardRecording.current = true;
            misses = 0;
            return;
          }
          misses += 1;
          if (heardRecording.current || misses >= 3) {
            heardRecording.current = false;
            setRecording(false);
            // A quiet DAW reads as stopped: ask whether it answers before saying the take ended there.
            const daw_ = capabilitiesRef.current?.daw;
            void daw
              .capabilities()
              .then((c) => {
                reachableRef.current = c.reachable;
              })
              .catch(() => {
                reachableRef.current = false;
              })
              .then(() => {
                if (reachableRef.current === false) lostTake.current = true;
                if (reachableRef.current === false) notify(lostInDaw(daw_), TAKE_TOPIC);
                else announceEnd(daw_);
              });
          }
        })
        // The take stays: a read that fails says nothing about it. Said once, after three in a row, so a narrator is not left trusting a pill nothing can vouch for.
        .catch(() => {
          failures += 1;
          if (current && failures === 3) {
            notify(`Can't tell whether ${recorderName(capabilitiesRef.current?.daw)} is still recording. Check it there before you rely on this take.`);
          }
        });
    }, POLL_MS);
    return () => {
      current = false;
      window.clearInterval(timer);
    };
  }, [daw, recording, notify]);

  // The transport is pushed on a change: a take the narrator starts or stops in the DAW itself is heard here at once, not at the next read.
  useEffect(
    () =>
      daw.subscribeTransport?.((transport) =>
        setProject((last) => (last ? { ...last, playState: transport.recording ? 'recording' : transport.playing ? 'playing' : 'stopped' } : last)),
      ),
    [daw],
  );

  // Read with every capability read too (focus, Check again, the timer), so what the DAW last saved is never older than the window's last focus.
  useEffect(() => {
    let current = true;
    daw
      .projectState()
      // A failed read keeps the last answer: the saved time is a note beside the take, and the notice about a quiet DAW is the capability read's.
      .then((state) => current && setProject(state))
      .catch(() => current && setProject((last) => last));
    return () => {
      current = false;
    };
  }, [daw, recording, reads]);

  useEffect(() => {
    if (!readsTracks) return;
    let current = true;
    teleprompter
      .readAloudReaperState(chapterId)
      .then(({ status, reason, message }) => current && setMatch({ chapterId, message, tracks: tracksOf(status, reason) }))
      // A failed read leaves the tracks unknown, as before the first read: Record then says what the host says at the press.
      .catch(() => current && setMatch(null));
    return () => {
      current = false;
    };
  }, [teleprompter, chapterId, readsTracks, reads, recording]);

  // The DAW reports a take this app did not start (the narrator pressed Record there): a second start would fight it, so Record says so first.
  const base: ChapterRecordState = match?.chapterId === chapterId ? match : { tracks: 'unread', message: '' };
  const chapter: ChapterRecordState = { ...base, elsewhere: takeElsewhere };
  const check = capabilities ? recordCheck(capabilities, chapter, link.open) : null;
  const shown = refused?.chapterId === chapterId ? refused.sentence : '';
  // Never read at all: Record is off, not silently on. Read once and quiet since: the last answer stands but is not given as fact.
  const blind = !capabilities && readFailed;
  const quiet = readFailed ? cantTell(capabilities?.daw, checkedAt, Date.now()) : '';
  const reason = check?.reason ?? (shown || quiet);

  const gate: RecordBlock | null = check ? { cause: check.code, reason: check.reason } : blind ? { cause: 'unknown', reason: quiet } : null;
  const gateRef = useRef(gate);
  gateRef.current = gate;
  const capabilitiesRef = useRef(capabilities);
  capabilitiesRef.current = capabilities;
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const stoppedRef = useRef(onStopped);
  stoppedRef.current = onStopped;

  const toggle = useCallback(
    async (at?: number, how?: { automatic?: boolean }): Promise<boolean> => {
      if (busy.current) return false;
      if (!recordingRef.current && gateRef.current) {
        block(gateRef.current);
        return false;
      }
      if (recordingRef.current && !how?.automatic && Date.now() - lastStartAt < START_GUARD_MS) {
        notify(START_GUARD_SENTENCE);
        return false;
      }
      busy.current = true;
      const starting = !recordingRef.current;
      try {
        // Another project can be opened in the DAW with no event to say so, and the last read may be seconds old: a start asks once more first, so a
        // take never begins in a project that is not the linked one. A read that fails claims nothing and the start goes on.
        if (starting && capabilitiesRef.current) {
          const fresh = await system.bootstrap().catch(() => null);
          if (fresh && fresh.dawFileLinked && fresh.dawReachable && !fresh.dawProjectMatches) {
            setLink((last) => ({ ...last, open: 'different' }));
            const wrong = recordCheck(capabilitiesRef.current, { tracks: 'unread', message: '' }, 'different');
            if (wrong) block({ cause: wrong.code, reason: wrong.reason });
            return false;
          }
        }
        // The start tone, if the narrator turned it on, ends before the take begins so it is not on the recording. A stop has none.
        if (starting) await playTakeTone();
        const result = await (starting ? daw.recordStart(chapterId, at) : daw.recordStop());
        if (result.ok) {
          if (!starting && !recordsInApp(capabilitiesRef.current?.daw)) await stoppedRef.current?.(result);
          setRefused(null);
          if (starting) lastStartAt = Date.now();
          setRecording(starting);
          return starting;
        } else {
          const sentence = result.refused ?? result.message;
          setRefused({ chapterId, sentence });
          // The app's own recorder refuses a stop only when no take is recording: the take is over, so the Booth stops holding it.
          if (!starting && recordsInApp(capabilitiesRef.current?.daw)) setRecording(false);
          // The host knew something the last read did not (a track gone, a link removed elsewhere): read again, so the notice that fixes it shows.
          setReads((n) => n + 1);
          block({ cause: result.code === 'stale' ? 'no_track' : 'host_refused', reason: sentence });
        }
      } catch (error) {
        // A host call that failed (not a refusal): nothing changed that this app knows of, and the narrator is told so.
        const what = starting ? 'Record did not start' : 'Stop did not go through';
        const sentence = `${what}: ${apiErrorMessage(error)}. Check ${capabilitiesRef.current?.daw ?? 'the DAW'} before pressing again.`;
        setRefused({ chapterId, sentence });
        block({ cause: 'failed', reason: sentence });
      } finally {
        busy.current = false;
      }
      return false;
    },
    [daw, system, chapterId, notify],
  );

  const stopped = useCallback(() => {
    heardRecording.current = false;
    setRecording(false);
  }, []);

  return {
    capabilities,
    project,
    recording,
    stopped,
    startedByApp: true,
    reason,
    gate,
    disabled: !recording && (!!check || blind),
    toggle,
    refresh,
    checkAgain: refresh,
    checkedAt,
    readFailed,
    facts: { ...link.facts, openProject: link.open },
    factsFailed: link.failed,
    factsLoaded: link.loaded,
  };
}
