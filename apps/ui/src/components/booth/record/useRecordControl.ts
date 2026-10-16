import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities, DawProjectState } from '../../../api/contracts/daw';
import type { ReadAloudReaperReason, ReadAloudReaperStatus } from '../../../api/contracts/teleprompter';
import { usePort } from '../../../ports/usePort';
import { apiErrorMessage } from '../../../api/errorMessage';
import { recordCheck, type ChapterRecordState, type OpenProject } from './recordCheck';
import type { RecordSetupFacts } from './recordSetup';

/** How often the Booth asks the DAW again while Record cannot start or the last read failed: a lost event must not leave a notice up for ever. */
export const POLL_MS = 4000;

function tracksOf(status: ReadAloudReaperStatus, reason?: ReadAloudReaperReason): ChapterRecordState['tracks'] {
  if (status !== 'no_link') return 'one';
  return reason === 'several_links' ? 'several' : 'none';
}

export type RecordControlState = {
  capabilities: DawCapabilities | null;
  /** The DAW project as last saved and whether it has unsaved changes; null until the DAW port answers. */
  project: DawProjectState | null;
  recording: boolean;
  /** False when the DAW was already recording and this app did not start the take; the leave guard reads it (ADR 0232). */
  startedByApp: boolean;
  /** Why Record cannot start, or the host's refusal of the last press; '' when nothing stops it. */
  reason: string;
  disabled: boolean;
  /** Start or stop a take (the `reading.toggle` command). A start that a precondition stops says why through `notify` and starts nothing. */
  toggle: () => Promise<void>;
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
};

/** The sentence for a DAW that has gone quiet: what the Booth can and cannot tell, and the way out. */
function cantTell(daw: string | undefined, checkedAt: number | null, now: number): string {
  const name = daw && daw !== 'none' ? daw : 'the DAW';
  const heard = checkedAt === null ? 'not heard yet' : `last heard ${Math.max(0, Math.round((now - checkedAt) / 1000))} s ago`;
  return `Can't tell whether ${name} is ready (${heard}). Press Check again.`;
}

/** What the Booth says when the DAW stopped a take this app started: the narrator's own Stop there, or the DAW closing. */
export const stoppedInDaw = (daw: string | undefined) =>
  `${daw && daw !== 'none' ? daw : 'The DAW'} stopped recording. The take ended there; press Record to start the next one.`;

/**
 * The Booth's Record control over the DAW port: the capabilities and the host's read of the chapter's track give `recordCheck`, a press
 * calls `recordStart(chapterId)` or `recordStop()` once, and a refused call shows the host's sentence and changes nothing.
 * Nothing is armed first, the host arms and starts in one call, and nothing stops a take when the Booth unmounts: the leave
 * guard (`useBoothLeaveGuard`) owns that question. The project's saved state is read when the Booth opens and again after each take
 * starts or stops, the moments its unsaved changes are likely to change.
 */
// A take this app started and has not seen end. The Booth can be left without its leave question (the mouse's Back button, a window that
// reloads its page): the take goes on in the DAW, and when the Booth is opened again that take is still the app's own to stop. A take the app
// never started (the DAW was already recording when the app opened) is not claimed, and a page reload forgets this, as it should (ADR 0232).
let appTakeRunning = false;
/** Forgets a take the app started; for tests that share the module. */
export const forgetAppTake = (): void => {
  appTakeRunning = false;
};

export function useRecordControl({ chapterId, notify }: { chapterId: string; notify: (sentence: string) => void }): RecordControlState {
  const daw = usePort('daw');
  const system = usePort('system');
  const teleprompter = usePort('teleprompter');
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
  useEffect(() => {
    let current = true;
    const unsubscribe = daw.subscribeCapabilities?.((next) => {
      events.current += 1;
      if (!current) return;
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
        setCapabilities(c);
        setReadFailed(false);
        setCheckedAt(Date.now());
      })
      // The last picture stays, marked as not current: the narrator is told the Booth cannot tell, never shown a stale answer as fact.
      .catch(() => current && heard === events.current && setReadFailed(true));
    return () => {
      current = false;
    };
  }, [daw, reads]);
  const refresh = useCallback(() => setReads((n) => n + 1), []);

  // The link facts the setup steps and the wrong-project refusal read, re-read with every capability read and when the DAW's reachability changes.
  const [link, setLink] = useState<{ facts: RecordSetupFacts; open: OpenProject; failed: boolean }>({
    facts: { dawFileLinked: false, launcherPath: '' },
    open: 'unknown',
    failed: false,
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
        setLink({ facts, open, failed: false });
      })
      // A failed read keeps what was last heard and says it failed: it never turns a linked project into "not linked" or a refusal.
      .catch(() => live && setLink((last) => ({ ...last, failed: true })));
    return () => {
      live = false;
    };
  }, [system, reads, reachable]);
  // Record is refused for the chapter's own track, or by a take running in the DAW that this app did not start: a notice is up for something the
  // narrator fixes in the DAW, so it is read again on the timer as well.
  // The app's own take, still running in the DAW after the Booth was left and opened again, is taken back; any other take is "elsewhere".
  const adopt = !recording && appTakeRunning && project?.playState === 'recording';
  const wasRecording = useRef(false);
  // In this order: a take that just ended clears the flag before the next effect asks whether to take one back.
  useEffect(() => {
    if (recording) appTakeRunning = true;
    else if (wasRecording.current) appTakeRunning = false;
    wasRecording.current = recording;
  }, [recording]);
  useEffect(() => {
    if (!recording && appTakeRunning && project?.playState === 'recording') {
      heardRecording.current = true;
      setRecording(true);
    }
  }, [recording, project?.playState]);
  const takeElsewhere = !recording && !adopt && project?.playState === 'recording';
  const refusedForChapter = takeElsewhere || (match?.chapterId === chapterId && (match.tracks === 'none' || match.tracks === 'several'));
  const unready = !capabilities || !!capabilities.capabilities.record?.available === false || readFailed || refusedForChapter;
  useEffect(() => {
    const again = () => setReads((n) => n + 1);
    const onVisible = () => document.visibilityState === 'visible' && again();
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', onVisible);
    const timer = unready ? window.setInterval(again, POLL_MS) : undefined;
    return () => {
      window.removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [unready]);

  // A take the narrator stopped in the DAW itself ends here too, once the DAW has been heard recording: the transport is pushed only on
  // a change, so the stopped state the subscription hears first, from before the take started, is not taken for its end (ADR 0232).
  const heardRecording = useRef(false);
  useEffect(() => {
    if (!recording) {
      heardRecording.current = false;
      return;
    }
    return daw.subscribeTransport?.((transport) => {
      if (transport.recording) heardRecording.current = true;
      else if (heardRecording.current) {
        heardRecording.current = false;
        setRecording(false);
        notify(stoppedInDaw(capabilities?.daw));
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
            notify(stoppedInDaw(capabilitiesRef.current?.daw));
          }
        })
        // The take stays: a read that fails says nothing about it. Said once, after three in a row, so a narrator is not left trusting a pill nothing can vouch for.
        .catch(() => {
          failures += 1;
          if (current && failures === 3) {
            const name = capabilitiesRef.current?.daw;
            notify(`Can't tell whether ${name && name !== 'none' ? name : 'the DAW'} is still recording. Check it there before you rely on this take.`);
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

  const gate = check?.reason ?? (blind ? quiet : '');
  const gateRef = useRef(gate);
  gateRef.current = gate;
  const capabilitiesRef = useRef(capabilities);
  capabilitiesRef.current = capabilities;
  const recordingRef = useRef(recording);
  recordingRef.current = recording;

  const toggle = useCallback(async () => {
    if (busy.current) return;
    if (!recordingRef.current && gateRef.current) {
      notify(gateRef.current);
      return;
    }
    busy.current = true;
    const starting = !recordingRef.current;
    try {
      const result = await (starting ? daw.recordStart(chapterId) : daw.recordStop());
      if (result.ok) {
        setRefused(null);
        setRecording(starting);
      } else {
        setRefused({ chapterId, sentence: result.refused ?? result.message });
      }
    } catch (error) {
      // A host call that failed (not a refusal): nothing changed that this app knows of, and the narrator is told so.
      const what = starting ? 'Record did not start' : 'Stop did not go through';
      setRefused({ chapterId, sentence: `${what}: ${apiErrorMessage(error)}. Check ${capabilitiesRef.current?.daw ?? 'the DAW'} before pressing again.` });
    } finally {
      busy.current = false;
    }
  }, [daw, chapterId, notify]);

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
    disabled: !recording && (!!check || blind),
    toggle,
    refresh,
    checkAgain: refresh,
    checkedAt,
    readFailed,
    facts: link.facts,
    factsFailed: link.failed,
  };
}
