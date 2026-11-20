import { useOverlay } from '../../../overlay/OverlayProvider';
import { logUi } from '../../../api/uiLog';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities, DawKind, DawProjectState, DawResult } from '../../../api/contracts/daw';
import type { ReadAloudReaperReason, ReadAloudReaperStatus } from '../../../api/contracts/teleprompter';
import { usePort } from '../../../ports/usePort';
import type { DawClient, DawRecordStart } from '../../../ports/daw';
import { noAnswerSentence, recorderName, recorderNameCapital, recordsInApp } from '../../../studio/dawNames';
import { apiErrorMessage } from '../../../api/errorMessage';
import { playTakeTone } from '../takeTone';
import { sentenceOr } from './sentenceOr';
import { takeEndedIn } from './takeWords';
import { NOT_WHILE_RECORDING } from '../../voicesamples/samplePlayerStore';
import { limited, PRESS_LIMITS_MS, recordStartLimit } from './pressLimits';
import { recordCheck, type ChapterRecordState, type NotFollowedWhy, type OpenProject, type RecordRefusal } from './recordCheck';
import type { RecordSetupFacts } from './recordSetupModel';

/** How often the Booth asks the DAW again while Record cannot start or the last read failed: a lost event must not leave a notice up for ever. */
export const POLL_MS = 4000;
/** The topic of what the Booth says about how a take ended without the narrator's own Stop: gone once the next take starts. */
export const TAKE_TOPIC = 'daw-take';
/** How often the Booth asks again while Record is ready and idle: another project can be opened in the DAW with no event to say so. */
export const READY_POLL_MS = 15_000;

/** How long after a take starts that a press is not taken for Stop: a double click or a key repeat must not start and end a take at once. */
export const START_GUARD_MS = 1000;
/** What the Booth says when Stop is pressed on a take the DAW started: the app never stops a take it did not start (#3666). */
export const heldInDawSentence = (daw: DawKind | undefined, what: 'stop it' | 'roll again' | 'change the voice' = 'stop it') =>
  `${recorderNameCapital(daw)} started this take, so ${what} in ${recorderName(daw)}.`;
/** Why a change that waits for the take to end is off while one runs: a take the DAW started is stopped there, not here. The one place this sentence is written for the Booth. */
export const notWhileRecording = (daw: DawKind | undefined, followedInDaw: boolean) =>
  followedInDaw ? heldInDawSentence(daw, 'stop it') : NOT_WHILE_RECORDING;
/** The topic of the sentence above: gone when the take ends. */
export const HELD_TOPIC = 'daw-held';
/** The topic of the message a refused press of Record leaves up (with Check again): it is about this Booth, so it goes when the Booth does. */
export const RECORD_BLOCKED_TOPIC = 'record-blocked';
/** The topic of "the Booth stopped listening" (another lane or project mid-take): up while it has stopped, gone when it follows the take again. */
const STOPPED_LISTENING_TOPIC = 'daw-stopped-listening';
/** The topic of the notice that the lane has not been read yet: gone once it is. */
const UNDECIDED_TOPIC = 'daw-undecided';
/** What the Booth says when a press inside that guard is ignored. */
export const START_GUARD_SENTENCE = 'Recording just started. Press Stop again in a moment if you meant to stop.';

/** The statuses that say the DAW records: true of the moment of the read only, so they are not kept once the transport says it stopped. */
const isRecordingStatus = (status: ReadAloudReaperStatus) => status === 'recording_here' || status === 'recording_elsewhere';

function notFollowedOf(match: { status: ReadAloudReaperStatus; armedCount?: number } | null, projectLinked: boolean): NotFollowedWhy {
  // With no project file linked nothing can be matched to this chapter, whatever else the reads say.
  if (!projectLinked) return 'no_project';
  if (!match || match.status !== 'recording_elsewhere') return 'unread';
  return match.armedCount === 0 ? 'no_track_armed' : (match.armedCount ?? 1) > 1 ? 'several_tracks' : 'other_track';
}

function tracksOf(status: ReadAloudReaperStatus, reason?: ReadAloudReaperReason): ChapterRecordState['tracks'] {
  if (status !== 'no_link') return 'linked';
  if (reason === 'several_links') return 'several';
  return reason === 'track_missing' ? 'missing' : 'unlinked';
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
  /** True while the host call that starts a take is out: no take yet, and one about to be, which a leave can no longer cancel. The leave guard counts it as a take. */
  starting: boolean;
  /** Resolves when the press now out ends, with whether a take is running then; at once when none is out. */
  settle: () => Promise<boolean>;
  /** Resolves whether the take that just ended ended with the DAW answering (true), or because the DAW went quiet (false): only the first is a take known to be over. */
  endConfirmed: () => Promise<boolean>;
  /** True while a take that has ended is not yet known to have ended with the DAW answering: leaving is then not allowed silently. */
  endUnconfirmed: () => boolean;
  /** False for a take started in the DAW itself and adopted (#3666): the app never stops it, and the leave guard says so. */
  startedByApp: boolean;
  /** Why Record cannot start, or the host's refusal of the last press; '' when nothing stops it. */
  reason: string;
  /**
   * `reason` is the sentence of the last press (a refusal, a limit, a failure), which the press said as a message already: the footer keeps it for Record's
   * description and does not draw it a second time (#3322). A standing reason (the gate, a read that failed) is not told by a press, so it is drawn.
   */
  told?: boolean;
  /** What stops a press now, or null when Record can start: the same precondition the press would be refused for. */
  gate: RecordBlock | null;
  disabled: boolean;
  /** Start or stop a take (the `reading.toggle` command), a start at `at` seconds when it is a punch. A start that a precondition stops says why through `notify` and starts nothing. Answers whether the take started. A narrator's press within `START_GUARD_MS` of a start is ignored (a double click or key repeat is not a Stop); an `automatic` stop, the Booth's own, is never. */
  toggle: (at?: number, how?: { automatic?: boolean; current?: () => boolean }) => Promise<boolean>;
  /** Stops the take as a narrator's Stop press does (the start guard included) and answers whether no take runs afterwards: true when
   * it stopped or none was running, false when the stop was refused, failed or another press was being answered. */
  stop: () => Promise<boolean>;
  /** The take was stopped by another path (the leave guard's "Stop and leave"): the Booth stops holding it now, not when the DAW's next heartbeat says so. */
  stopped: () => void;
  /** True while a stop is in flight and not yet answered: the narrator's Stop press, or a stop the app sends (`appStop`). A roll that lands then is for a take that is already over. */
  stopping: () => boolean;
  /**
   * Runs a stop the app itself sends outside a press (the unheard take dropped, "Stop and leave"). The transport event the stop pushes is not a take that
   * ended in the DAW, so it is not announced; a stop that did not go through is left to be heard as before (#3409).
   */
  appStop: <T extends { ok: boolean }>(stop: () => Promise<T>) => Promise<T>;
  /** Read the capabilities again, after a setting the Booth itself changed. */
  refresh: () => void;
  /** The visible Check again: a fresh read now, whatever a timer or an event last said. */
  checkAgain: () => void;
  /** When (ms since the epoch) the DAW last answered, by a read or an event; null until it has. */
  checkedAt: number | null;
  /** What the DAW last answered about this chapter (`readAloudReaperState`), or null before the first answer, after a failed read, and for a setup that reads no tracks. */
  dawStatus: ReadAloudReaperStatus | null;
  /** Why a take the DAW holds is not followed: another track is armed, several are, none is, or the lane could not be read yet. Null while nothing is held. */
  notFollowed: NotFollowedWhy | null;
  /** True from the moment the Booth stopped listening to a take the DAW started (another lane or project) until it follows it again or the DAW stops: that take did not end. */
  stoppedListening: boolean;
  /** True while the last read of the DAW's transport failed: `project` is then the last answer, or null if it never answered. */
  projectFailed: boolean;
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
const backInDaw = (daw: DawKind | undefined, byDaw: boolean) => {
  const name = recorderNameCapital(daw);
  // A take the DAW started was only followed: the Booth stopped listening, it did not end anything.
  if (byDaw) return `${name} answers again. The Booth stopped listening to its take when ${name} went quiet; check in ${name} whether it is still recording.`;
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
// reloads its page): the take goes on in the DAW, and when the Booth is opened again that take is still the app's own to stop. Only a press's
// own answer claims a take: one the DAW started (adopted, #3666) never does, so a Booth opened again finds it like a new one. A page reload forgets this.
let appTakeRunning = false;
// The chapter that take began in, claimed by the first page that records it: a page for another chapter that adopts the take (the narrator opened it with the take still
// running) is not the take's, and writes no passage-map run of its own for it (#3712).
let appTakeChapterId: string | undefined;
/** The chapter the take this app started and has not seen end began in; undefined when there is none. */
export const appTakeChapter = (): string | undefined => appTakeChapterId;
// Whether the claiming page already wrote this take's passage-map run (it was left mid-take by the narrator's choice and flushed). The chapter opened again with the take
// still running does not start a second, overlapping run for the same take (#3720); the claim ending, or a new claim, resets it.
let appTakeRunWritten = false;
/** True when the take this app started and has not seen end already has its run written, by the page that was left. */
export const appTakeRunIsWritten = (): boolean => appTakeRunWritten;
/** The page that began the take was left mid-take and wrote its run. */
export const markAppTakeRunWritten = (): void => {
  appTakeRunWritten = true;
};
/** The run that was flushed was refused: the chapter opened again begins a run of its own, so the take is not left with none. */
export const clearAppTakeRunWritten = (): void => {
  appTakeRunWritten = false;
};
/** Ends the app's claim on its own take, and the chapter it began in. Only a positive answer does: a stop the DAW accepted, a DAW that answers it is not recording, or the DAW
 * recording elsewhere for the claim's own chapter. Anything that is no answer (a read that failed, a quiet DAW, a heard but unconfirmed end) keeps it: the take may still run, and is the app's. */
const dropClaim = (): void => {
  appTakeRunning = false;
  appTakeChapterId = undefined;
  appTakeRunWritten = false;
};
// How many Booths are mounted, and the DAW whose transport is watched for the claim while none is: a take the app started and left running (Leave anyway) ends in the DAW with
// no Booth to hear it, and a take the DAW starts after that is not the app's. The watch is outside any page: it asks the DAW itself (reachable, and not recording) before it drops.
let mountedBooths = 0;
let claimWatch: { daw: DawClient; off: () => void } | null = null;
/** Drops the claim when the DAW answers that it is reachable and not recording, and no Booth is mounted (a Booth that is has its own reads, and may have pressed a take since). */
const dropClaimIfIdle = (daw: DawClient): Promise<void> =>
  Promise.all([daw.capabilities(), daw.projectState()]).then(
    ([picture, state]) => {
      if (picture.reachable && state.playState !== 'recording' && mountedBooths === 0) dropClaim();
    },
    () => undefined,
  );
const watchClaim = (daw: DawClient): void => {
  if (claimWatch?.daw === daw) return;
  claimWatch?.off();
  const off = daw.subscribeTransport?.((transport) => {
    if (!transport.recording && appTakeRunning && mountedBooths === 0) void dropClaimIfIdle(daw);
  });
  claimWatch = { daw, off: off ?? (() => undefined) };
};
// When the last take started (ms since the epoch): a stop pressed inside START_GUARD_MS of it is ignored.
let lastStartAt = 0;
// The host's take is one: a start answered late by an abandoned press (a Booth left, a chapter changed, a press given up on) must stop only a take
// that press began. `startsSent` numbers each start asked of the DAW; `runningStart` is the newest start that answered and runs. A late answer of an
// older start finds a newer one running and stops nothing (the DAW would have refused the older one), so it never ends the take that Booth began (#3320).
let startsSent = 0;
let runningStart = 0;
/** Forgets a take the app started; for tests that share the module. */
export const forgetAppTake = (): void => {
  claimWatch?.off();
  claimWatch = null;
  mountedBooths = 0;
  startsSent = 0;
  runningStart = 0;
  appTakeRunning = false;
  appTakeChapterId = undefined;
  appTakeRunWritten = false;
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
  onStarted,
}: {
  chapterId: string;
  notify: (sentence: string, topic?: string) => void;
  /** A press that did not start a take, and why; absent, the sentence is said as a message. */
  onBlocked?: (block: RecordBlock) => void;
  /** A DAW (not the app's own recorder) stopped the take on a press: its answer, with the undo points it left. Awaited before the take reads as stopped. */
  onStopped?: (result: DawResult) => void | Promise<void>;
  /** A take started: the answer, with `position` where it began when the DAW says. Called before the take reads as recording. */
  onStarted?: (result: DawRecordStart) => void;
}): RecordControlState {
  const daw = usePort('daw');
  const system = usePort('system');
  const teleprompter = usePort('teleprompter');
  const recorder = usePort('recording');
  const [capabilities, setCapabilities] = useState<DawCapabilities | null>(null);
  const [project, setProject] = useState<DawProjectState | null>(null);
  const [match, setMatch] = useState<{
    chapterId: string;
    tracks: ChapterRecordState['tracks'];
    message: string;
    status: ReadAloudReaperStatus;
    armedCount?: number;
  } | null>(null);
  const [recording, setRecording] = useState(false);
  // False from the moment the DAW goes quiet until a read of its transport answers: the project's play state kept from before says nothing of what it does now.
  const [projectHeard, setProjectHeard] = useState(true);
  const [projectAsk, setProjectAsk] = useState(0);
  // The last read of the transport failed: `project` is then what was last heard, or null; a page that waits for it must not wait for ever.
  const [projectFailed, setProjectFailed] = useState(false);
  // Which read of the link and of the chapter's lane answered last: `readSeq` numbers the reads as they start, so an answer can be told from one begun before an event.
  const readSeq = useRef(0);
  const [matchSeq, setMatchSeq] = useState(0);
  const [linkSeq, setLinkSeq] = useState(0);
  const [refused, setRefused] = useState<{ chapterId: string; sentence: string } | null>(null);
  const busy = useRef(false);
  const overlay = useOverlay();
  const [starting, setStarting] = useState(false);
  // The press now out, so a leave can wait for it; and whether this control is still on a page (a start that lands after it is gone is stopped).
  const inflight = useRef<Promise<boolean> | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    mountedBooths += 1;
    watchClaim(daw);
    return () => {
      alive.current = false;
      mountedBooths = Math.max(0, mountedBooths - 1);
    };
  }, [daw]);
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
  const lostTake = useRef<'app' | 'daw' | null>(null);
  // What `endConfirmed` answers: set where a take ends, so the leave guard can tell a take the DAW ended from a DAW that went quiet. Null (a stop of ours) is confirmed.
  const endCheck = useRef<Promise<boolean> | null>(null);
  const endOpen = useRef(false);
  const endConfirmed = useCallback(() => (endOpen.current ? (endCheck.current ?? Promise.resolve(true)) : Promise.resolve(true)), []);
  // True from the moment a take is seen to end until a read says the DAW answers: a take that ended with the DAW quiet, or not yet known to be answering, may
  // still be recording, so leaving is not silently allowed on `recording` being false alone (`endUnconfirmed`, read by the leave guard).
  const endUnconfirmed = useCallback(() => endOpen.current, []);
  const markEnd = (read: Promise<void>) => {
    endOpen.current = true;
    const check: Promise<boolean> = read.then(() => {
      const answering = reachableRef.current !== false;
      if (endCheck.current === check) endOpen.current = !answering;
      if (answering && !recordingRef.current) setStartedInDaw(false);
      return answering;
    });
    endCheck.current = check;
  };
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const blockedRef = useRef(onBlocked);
  blockedRef.current = onBlocked;
  const block = (blocked: RecordBlock) => (blockedRef.current ? blockedRef.current(blocked) : notifyRef.current(blocked.reason));
  // A take the recorder ended by itself (the microphone unplugged, the disk full): its own sentence says why, read when the end is heard.
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const announceEnd = (name: DawKind | undefined, byDaw: boolean) => {
    // A take the narrator was told to stop in the DAW ended as told: nothing unexpected happened.
    if (byDaw) return void notifyRef.current(takeEndedIn(recorderName(name)), TAKE_TOPIC);
    if (!recordsInApp(name)) return void notifyRef.current(stoppedInDaw(name), TAKE_TOPIC);
    void recorderRef.current
      .recorderState()
      .then((state) => state.message)
      .catch(() => '')
      .then((why) => notifyRef.current(stoppedInDaw(name, why), TAKE_TOPIC));
  };
  // A later picture that says the DAW answers while no take runs here settles a take whose end was not known to be with the DAW answering (it went quiet and
  // came back): nothing is left to stop, so leaving is silent again.
  const answeringAgain = (next: DawCapabilities) => {
    if (next.reachable && !recordingRef.current) {
      endOpen.current = false;
      setStartedInDaw(false);
    }
  };
  const hearAgain = (next: DawCapabilities) => {
    if (next.reachable && lostTake.current) {
      const byDaw = lostTake.current === 'daw';
      lostTake.current = null;
      notifyRef.current(backInDaw(next.daw, byDaw), TAKE_TOPIC);
    }
  };
  useEffect(() => {
    let current = true;
    const unsubscribe = daw.subscribeCapabilities?.((next) => {
      events.current += 1;
      if (!current) return;
      reachableRef.current = next.reachable;
      answeringAgain(next);
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
        answeringAgain(c);
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
    const mine = ++readSeq.current;
    system
      .bootstrap()
      .then((data) => {
        if (!live) return;
        setLinkSeq(mine);
        const facts = { dawFileLinked: data.dawFileLinked, launcherPath: data.runtime.Reaper?.launcherPath ?? '' };
        // The host reports "does not match" as false while nothing is linked or the DAW is silent: only a linked, heard DAW that disagrees is a refusal.
        const open: OpenProject = !data.dawFileLinked || !data.dawReachable ? 'unknown' : data.dawProjectMatches ? 'same' : 'different';
        setLink({ facts, open, failed: false, loaded: true });
      })
      // A failed read keeps what was last heard and says it failed: it never turns a linked project into "not linked" or a refusal.
      .catch(() => {
        if (!live) return;
        setLinkSeq(mine);
        setLink((last) => ({ ...last, failed: true, loaded: true }));
      });
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
  // A quiet DAW's take is not adopted back meanwhile. Only the app's own recorder is taken back on its word alone: a DAW's take, the app's own claim on it included,
  // goes through the same lane and project read as any take the DAW holds (`heldHere`).
  const answering = capabilities?.reachable !== false;
  const adopt = !recording && answering && projectHeard && inApp && !recordedHere.current && project?.playState === 'recording';
  const wasRecording = useRef(false);
  // In this order: a take that just ended clears the flag before the next effect asks whether to take one back.
  useEffect(() => {
    if (recording) {
      // The chapter the take began in, claimed by the first page that records it (#3712); a claim on the take itself is only a press's (`appTakeRunning`).
      appTakeChapterId ??= chapterId;
      recordedHere.current = true;
    }
    wasRecording.current = recording;
  }, [recording, chapterId]);
  useEffect(() => {
    // Read here, after the effect above has run: a take that just ended has cleared its flag by now.
    if (!recording && answering && projectHeard && inApp && !recordedHere.current && project?.playState === 'recording') {
      heardRecording.current = true;
      endCheck.current = null;
      endOpen.current = false;
      setRecording(true);
    }
  }, [recording, project?.playState, inApp, answering, projectHeard]);
  // A page that reads the DAW as not recording, while it records nothing itself, holds no take: a claim left by a take that ended with no page to see it is stale, and would
  // write off the next take this page adopts as another chapter's (#3712).
  useEffect(() => {
    if (!recording && !appTakeRunning && project?.playState && project.playState !== 'recording') {
      appTakeChapterId = undefined;
      appTakeRunWritten = false;
    }
  }, [recording, project?.playState]);
  // A take the DAW holds that this app neither pressed nor can claim: the narrator pressed Record in the DAW itself (#3666). It is the Booth's running take
  // when the linked project is the open one and the chapter's lane is the one armed (the host answers `recording_here`), as the reads above (`link`, `match`) say
  // once they have been made after the take was seen (`readSeq`); any other is "elsewhere". Nothing but this app starts a take of its own recorder.
  // A press in flight owns the transport events of its own start, so it is never taken for a take of the DAW's.
  const heldInDaw = !recording && !adopt && !inApp && !starting && projectHeard && project?.playState === 'recording';
  const [startedInDaw, setStartedInDaw] = useState(false);
  const startedInDawRef = useRef(false);
  startedInDawRef.current = startedInDaw;
  const wasHeld = useRef(false);
  const heldSeq = useRef(0);
  // Set in the render that first sees the take, not in an effect after it: a read made before the take says nothing of it, and not for one committed render.
  const heldSeen = useRef(false);
  if (heldInDaw !== heldSeen.current) {
    heldSeen.current = heldInDaw;
    if (heldInDaw) heldSeq.current = readSeq.current;
  }
  useEffect(() => {
    if (heldInDaw && !wasHeld.current) {
      // Asked now, not at the next poll.
      setReads((n) => n + 1);
    } else if (!heldInDaw && wasHeld.current) setReads((n) => n + 1);
    wasHeld.current = heldInDaw;
  }, [heldInDaw]);
  const read = heldSeq.current < matchSeq && heldSeq.current < linkSeq;
  // Not decided until the DAW has been heard once (what it reads is not known before), nor before the reads that follow the take have answered.
  const undecided = heldInDaw && (readsTracks || !capabilities || capabilities.reachable === false) && !read;
  // A take the Booth stopped following (another lane, another project) is followed again once the linked project and this chapter's lane answer that it is this chapter's: the
  // Booth stopped listening, the take did not end. `stoppedListening` says so until the take is followed again or the DAW stops recording.
  const [stoppedListening, setStoppedListening] = useState(false);
  const heldHere = heldInDaw && read && match?.chapterId === chapterId && match.status === 'recording_here' && link.open === 'same';
  useEffect(() => {
    if (stoppedListening && (recording || (project !== null && project.playState !== 'recording'))) setStoppedListening(false);
  }, [stoppedListening, recording, project]);
  // Who started the take is kept until its end is confirmed: a DAW that went quiet after the take ended may still be recording, and it is still not the app's to stop.
  useEffect(() => {
    if (!recording && !endOpen.current) setStartedInDaw(false);
  }, [recording]);
  const takeElsewhere = heldInDaw && !undecided && !heldHere;
  // The claim is over only on a positive answer for its own chapter: the DAW, asked after the take was seen, says the take is on another lane or in another project. A read that
  // failed or said nothing, a quiet DAW, or another chapter's page looking at the take, is no answer, and the claim stays.
  const saysElsewhere =
    heldInDaw && read && !link.failed && ((match?.chapterId === chapterId && match.status === 'recording_elsewhere') || link.open === 'different');
  useEffect(() => {
    if (saysElsewhere && appTakeChapterId === chapterId) dropClaim();
  }, [saysElsewhere, chapterId]);
  const adoptedSeq = useRef(0);
  const projectRef = useRef(project);
  projectRef.current = project;
  useEffect(() => {
    if (!heldHere) return;
    heardRecording.current = true;
    endCheck.current = null;
    endOpen.current = false;
    adoptedSeq.current = readSeq.current;
    // The app's own claim on a take that is on this chapter's lane in the linked project (a Booth left and opened again, a DAW that went quiet and came back): it is
    // still the app's. Any other take, claim or not, is the DAW's.
    if (appTakeRunning) {
      recordingRef.current = true;
      setStartedInDaw(false);
      setRecording(true);
      return;
    }
    setStartedInDaw(true);
    // Where the take began, as a press's answer gives it: the roll and the passage map count from there: the transport event's position when there was one. A take
    // found already running has no known start: the DAW's play position is where it is now, and the clock counts from here.
    const position = seenStart.current ?? projectRef.current?.playPosition;
    startedRef.current?.({ ok: true, changed: false, undoSteps: 0, message: '', ...(position === undefined ? {} : { position }) });
    recordingRef.current = true;
    setRecording(true);
  }, [heldHere]);
  // The take the Booth follows is read again with every read (the timer while it runs): once the DAW records another track or has another project open the
  // take is not the chapter's any more, and the Booth stops following it, with one sentence. The DAW goes on recording; nothing is sent to it.
  useEffect(() => {
    if (!recording || !startedInDaw || matchSeq <= adoptedSeq.current || linkSeq <= adoptedSeq.current) return;
    const otherProject = link.open === 'different';
    const otherTrack = match?.chapterId === chapterId && match.status === 'recording_elsewhere';
    if (!otherProject && !otherTrack) return;
    heardRecording.current = false;
    recordingRef.current = false;
    setStoppedListening(true);
    setRecording(false);
    notifyRef.current(
      `${recorderNameCapital(capabilitiesRef.current?.daw)} ${otherProject ? 'has another project open' : 'is recording another track'} now, so the Booth stopped listening.`,
      STOPPED_LISTENING_TOPIC,
    );
  }, [recording, startedInDaw, match, matchSeq, link, linkSeq, chapterId]);
  useEffect(() => {
    if (!recording) overlay.dismissTopic(HELD_TOPIC);
  }, [recording, overlay]);
  // The sentence that the Booth stopped listening stays up while it has stopped, and goes when the take is followed again or the DAW stops recording.
  useEffect(() => {
    if (!stoppedListening) overlay.dismissTopic(STOPPED_LISTENING_TOPIC);
  }, [stoppedListening, overlay]);
  // The notice that the lane was not read yet is about that moment: once it is read (the take is followed, or known not to be this chapter's) it goes.
  useEffect(() => {
    if (!undecided) overlay.dismissTopic(UNDECIDED_TOPIC);
  }, [undecided, overlay]);
  // Leaving the Booth takes its messages about a take and a refused Record with it: they would follow the narrator to the next page.
  useEffect(
    () => () => {
      overlay.dismissTopic(HELD_TOPIC);
      overlay.dismissTopic(STOPPED_LISTENING_TOPIC);
      overlay.dismissTopic(UNDECIDED_TOPIC);
      overlay.dismissTopic(RECORD_BLOCKED_TOPIC);
    },
    [overlay],
  );
  const refusedForChapter =
    takeElsewhere || (match?.chapterId === chapterId && (match.tracks === 'unlinked' || match.tracks === 'several' || match.tracks === 'missing'));
  const unready = !capabilities || !!capabilities.capabilities.record?.available === false || readFailed || refusedForChapter || link.open === 'different';
  useEffect(() => {
    const again = () => setReads((n) => n + 1);
    const onVisible = () => document.visibilityState === 'visible' && again();
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(again, unready || recording || projectFailed || undecided ? POLL_MS : READY_POLL_MS);
    return () => {
      window.removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [unready, recording, projectFailed, undecided]);

  // The take is heard to have ended (the narrator's stop in the DAW, a quiet DAW): said once the DAW is asked whether it answers. A stopped transport is
  // also what a DAW that went quiet leaves behind, and the heartbeat has not been missed yet: ask whether it answers now before the end is believed
  // (`endConfirmed`), and before saying what became of the take.
  // The sentence for an end heard during a stop the app is sending: said if that stop did not go through, dropped if it did (`appStop`).
  const heldSay = useRef<(() => void) | null>(null);
  const announceTakeEnd = (hold = false) => {
    const daw_ = capabilitiesRef.current?.daw;
    // Whether it was the DAW's own take, asked now: the flag is cleared once the take reads as over.
    const byDaw = startedInDawRef.current;
    const read = daw
      .capabilities()
      .then((c) => {
        reachableRef.current = c.reachable;
      })
      .catch(() => {
        reachableRef.current = false;
      });
    // Whether the end is believed is asked at once, held or not: the leave guard reads it (`endUnconfirmed`).
    markEnd(read);
    const say = () =>
      void read.then(() => {
        if (reachableRef.current === false) lostTake.current = byDaw ? 'daw' : 'app';
        if (reachableRef.current === false) notifyRef.current(lostInDaw(daw_), TAKE_TOPIC);
        else {
          // The DAW answers and the take is over: the app's claim on it ends too (a quiet DAW keeps it, its take may still run), unless another take began meanwhile:
          // this is the late confirmation of the one before it.
          if (!recordingRef.current) {
            // A Booth that is gone has no say: the DAW is asked again, and the claim goes only if no Booth is open and the DAW still does not record (a Booth opened since may have pressed a take).
            if (alive.current) dropClaim();
            else void dropClaimIfIdle(daw);
          }
          announceEnd(daw_, byDaw);
        }
      });
    // A stop the app is sending: the take ended all the same, but saying so waits until it answers (`appStop`).
    if (hold) heldSay.current = say;
    else say();
  };
  const announceTakeEndRef = useRef(announceTakeEnd);
  announceTakeEndRef.current = announceTakeEnd;
  // A take the narrator stopped in the DAW itself ends here too, once the DAW has been heard recording: the transport is pushed only on
  // a change, so the stopped state the subscription hears first, from before the take started, is not taken for its end.
  const heardRecording = useRef(false);
  // Stops the app itself sent outside a press and has not seen answered (`appStop`): their transport event is not the narrator's, nor a take that ended.
  const appStops = useRef(0);
  const appStopReleases = useRef(new Set<() => void>());
  // An end the transport pushed during such a stop, to be heard if that stop failed; and the function that hears an end.
  useEffect(() => {
    if (!recording) {
      heardRecording.current = false;
      return;
    }
    const unsubscribe = daw.subscribeTransport?.((transport) => {
      if (transport.recording) heardRecording.current = true;
      // A press is being answered: the stop it asks for pushes this very event before its own answer, and that is the narrator's Stop, not a take that ended.
      else if (heardRecording.current && !busy.current) {
        heardRecording.current = false;
        setRecording(false);
        announceTakeEndRef.current(appStops.current > 0);
      }
    });
    return unsubscribe;
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
            announceTakeEndRef.current(appStops.current > 0);
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

  // The DAW answered that it does not record: a claim on a take that was kept through a quiet DAW is dropped (a take that ended while it was quiet is over),
  // so the next take in the DAW is the DAW's and is followed only on this chapter's lane. Not while a press is out or a take runs here.
  const dawAnswersStopped = () => {
    if (!recordingRef.current && !busy.current && reachableRef.current === true) dropClaim();
  };
  // Where the DAW's take began, as its transport event said it: the play head a later read finds has moved on.
  const transportRecording = useRef(false);
  const seenStart = useRef<number | undefined>(undefined);
  // The transport is pushed on a change: a take the narrator starts or stops in the DAW itself is heard here at once, not at the next read.
  useEffect(
    () =>
      daw.subscribeTransport?.((transport) => {
        setProjectHeard(true);
        if (transport.recording && !transportRecording.current) seenStart.current = transport.position;
        if (!transport.recording) {
          seenStart.current = undefined;
          dawAnswersStopped();
        }
        transportRecording.current = transport.recording;
        const playState = transport.recording ? 'recording' : transport.playing ? 'playing' : 'stopped';
        // Heard even when no read of the project has answered (it failed, or is out): the take is seen now, not at the next poll.
        setProject((last) =>
          last
            ? { ...last, playState, ...(transport.position === undefined ? {} : { playPosition: transport.position }) }
            : { savedAt: null, unsavedChanges: false, playState, playPosition: transport.position ?? 0 },
        );
      }),
    [daw],
  );
  // Back from a quiet: the transport is asked at once, and nothing is adopted from the play state kept from before.
  useEffect(() => {
    if (capabilities?.reachable === false) setProjectHeard(false);
    else if (!projectHeard) setProjectAsk((n) => n + 1);
  }, [capabilities?.reachable, projectHeard]);

  // Read with every capability read too (focus, Check again, the timer), so what the DAW last saved is never older than the window's last focus.
  useEffect(() => {
    let current = true;
    daw
      .projectState()
      // A failed read keeps the last answer: the saved time is a note beside the take, and the notice about a quiet DAW is the capability read's.
      .then((state) => {
        if (!current) return;
        setProject(state);
        setProjectFailed(false);
        setProjectHeard(true);
        if (state.playState !== 'recording') dawAnswersStopped();
      })
      .catch(() => {
        if (!current) return;
        setProject((last) => last);
        setProjectFailed(true);
      });
    return () => {
      current = false;
    };
  }, [daw, recording, reads, projectAsk]);

  useEffect(() => {
    if (!readsTracks) {
      // What the DAW last said about this chapter is not kept once the setup stops reading tracks (the DAW stopped answering, or this setup
      // has none): the chip and the gate must not name a cause that was true before.
      setMatch(null);
      return;
    }
    let current = true;
    const mine = ++readSeq.current;
    teleprompter
      .readAloudReaperState(chapterId)
      .then(({ status, reason, message, armedCount }) => {
        if (!current) return;
        setMatchSeq(mine);
        setMatch({ chapterId, message, tracks: tracksOf(status, reason), status, ...(armedCount === undefined ? {} : { armedCount }) });
      })
      // A failed read leaves the tracks unknown, as before the first read: Record then says what the host says at the press.
      .catch(() => {
        if (!current) return;
        setMatchSeq(mine);
        setMatch(null);
      });
    return () => {
      current = false;
    };
  }, [teleprompter, chapterId, readsTracks, reads, recording]);

  // The DAW reports a take this app did not start (the narrator pressed Record there): a second start would fight it, so Record says so first.
  const base: ChapterRecordState = match?.chapterId === chapterId ? match : { tracks: 'unread', message: '' };
  const notFollowed = takeElsewhere
    ? notFollowedOf(match?.chapterId === chapterId ? match : null, !link.loaded || link.failed || link.facts.dawFileLinked)
    : null;
  const chapter: ChapterRecordState = { ...base, elsewhere: takeElsewhere, notFollowed };
  const check = capabilities ? recordCheck(capabilities, chapter, link.open) : null;
  const shown = refused?.chapterId === chapterId ? refused.sentence : '';
  // Never read at all: Record is off, not silently on. Read once and quiet since: the last answer stands but is not given as fact.
  const blind = !capabilities && readFailed;
  const quiet = readFailed ? cantTell(capabilities?.daw, checkedAt, Date.now()) : '';
  const reason = check?.reason ?? (shown || quiet);

  const gate: RecordBlock | null = check ? { cause: check.code, reason: check.reason } : blind ? { cause: 'unknown', reason: quiet } : null;
  const undecidedRef = useRef(undecided);
  undecidedRef.current = undecided;
  const gateRef = useRef(gate);
  gateRef.current = gate;
  const capabilitiesRef = useRef(capabilities);
  capabilitiesRef.current = capabilities;
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const stoppedRef = useRef(onStopped);
  stoppedRef.current = onStopped;
  const startedRef = useRef(onStarted);
  startedRef.current = onStarted;

  /** Ends a take that started where nobody can see it: the page is gone, or the press had been given up on. A failure is said, because the DAW is still recording. */
  const stopUnseenTake = useCallback(
    (how: string) => {
      // The page may be gone, so a stop that fails is said as an app message: the take is still recording in the DAW. (This stop skips the Booth's own
      // bookkeeping, so a take it kept is not in Undo.)
      const name = recorderName(capabilitiesRef.current?.daw);
      const unstopped = (why: string) => {
        logUi('ui.record', `The late take was not stopped: ${why}`);
        overlay.toast(`A take started ${how} and could not be stopped: ${why} Stop it in ${name}.`, { tone: 'error' });
      };
      void daw.recordStop().then(
        (stopped) => (stopped.ok ? undefined : unstopped(stopped.refused ?? stopped.message)),
        (error: unknown) => unstopped(apiErrorMessage(error)),
      );
    },
    [daw, overlay],
  );

  /**
   * The answer of a start the press had given up on (`limited`). Another press may have started a take since, and that take is the Booth's:
   * a take running, or a press still asking, is left alone and its own answer decides. Otherwise this one is stopped.
   */
  const stopLateStart = useCallback(
    async (late: DawRecordStart, seq: number) => {
      if (!late.ok) return;
      if (runningStart > seq) return;
      // The newer press's own answer (`done(running)`), not a render's `recording`, which can lag behind it.
      if ((await inflight.current) || recordingRef.current) {
        // A take the DAW seemed to start by itself, running now, is this very start: the app sent it, so it is the app's (the next Stop reaches the DAW).
        if (recordingRef.current && startedInDawRef.current) {
          appTakeRunning = true;
          appTakeChapterId = chapterId;
          runningStart = Math.max(runningStart, seq);
          setStartedInDaw(false);
        }
        return;
      }
      logUi('ui.record', 'A take started after its press had given up waiting; stopping it.');
      stopUnseenTake('after Record had given up waiting');
    },
    [stopUnseenTake, chapterId],
  );

  // Set by a stop the DAW accepted, so `stop` can say whether its press stopped the take.
  const stopAccepted = useRef(false);
  const toggle = useCallback(
    async (at?: number, how?: { automatic?: boolean; current?: () => boolean }): Promise<boolean> => {
      if (busy.current) return false;
      // The DAW records and the lane has not been read yet: whether that take is this chapter's is not known, and a start would fight it.
      if (!recordingRef.current && undecidedRef.current) {
        const name = recorderNameCapital(capabilitiesRef.current?.daw);
        notifyRef.current(
          `${name} is recording a take, and the Booth has not yet checked whether it is this chapter's. Press Record again in a moment.`,
          UNDECIDED_TOPIC,
        );
        return false;
      }
      if (!recordingRef.current && gateRef.current) {
        block(gateRef.current);
        return false;
      }
      if (recordingRef.current && startedInDawRef.current) {
        // A take the DAW started is stopped there, never from here; the end of the chapter ends only the listening (#3666).
        if (!how?.automatic) notify(heldInDawSentence(capabilitiesRef.current?.daw), HELD_TOPIC);
        return false;
      }
      if (recordingRef.current && !how?.automatic && Date.now() - lastStartAt < START_GUARD_MS) {
        notify(START_GUARD_SENTENCE);
        return false;
      }
      busy.current = true;
      const starting = !recordingRef.current;
      // A take the DAW began since the press was made (followed, not yet read, or on another lane): a start would fight it. Asked after each wait.
      const overtaken = () => recordingRef.current || undecidedRef.current || !!gateRef.current;
      // Whether a take runs once this press is answered.
      let running = !starting;
      let done: (took: boolean) => void = () => {};
      inflight.current = new Promise<boolean>((resolve) => (done = resolve));
      try {
        // Another project can be opened in the DAW with no event to say so, and the last read may be seconds old: a start asks once more first, so a
        // take never begins in a project that is not the linked one. A read that fails claims nothing and the start goes on.
        if (starting && capabilitiesRef.current) {
          const checked = await limited(
            'projectCheck',
            system.bootstrap().catch(() => null),
          );
          if (how?.current && !how.current()) return false;
          // A take the DAW started while this press was asking is followed (`heldHere`), or not yet known to be: this press must not start another.
          if (overtaken()) return false;
          if (checked.timedOut) {
            // Not knowing which project is open is not a reason to record: the press ends, and the next one asks again.
            const sentence = `${recorderNameCapital(capabilitiesRef.current.daw)} could not confirm the open project in time, so no take was started.`;
            setRefused({ chapterId, sentence });
            block({ cause: 'failed', reason: sentence });
            return false;
          }
          const fresh = checked.value;
          if (fresh && fresh.dawFileLinked && fresh.dawReachable && !fresh.dawProjectMatches) {
            setLink((last) => ({ ...last, open: 'different' }));
            const wrong = recordCheck(capabilitiesRef.current, { tracks: 'unread', message: '' }, 'different');
            if (wrong) block({ cause: wrong.code, reason: wrong.reason });
            return false;
          }
        }
        // The start tone, if the narrator turned it on, ends before the take begins so it is not on the recording. A stop has none.
        if (starting && how?.current && !how.current()) return false;
        if (starting) await playTakeTone();
        if (starting && how?.current && !how.current()) return false;
        if (starting && overtaken()) return false;
        // From here the host has the start: a leave can no longer cancel it, so it asks (`starting`) and waits for the answer (`settle`).
        if (starting) setStarting(true);
        let result: DawRecordStart;
        const seq = starting ? ++startsSent : 0;
        if (starting) {
          const answered = await limited(
            recordStartLimit(recordsInApp(capabilitiesRef.current?.daw)),
            daw.recordStart(chapterId, at),
            (late) => void stopLateStart(late, seq),
          );
          if (answered.timedOut) {
            // The host never answered: it may still be starting. Record is free, and an answer that comes later is stopped (`stopLateStart`),
            // so the DAW is never left recording behind a take nobody sees.
            const name = recorderName(capabilitiesRef.current?.daw);
            const sentence = `The Booth gave up waiting for ${name} to start recording.`;
            if (how?.current && !how.current()) return false;
            setRefused({ chapterId, sentence });
            block({ cause: 'failed', reason: sentence });
            return false;
          }
          result = answered.value;
        } else {
          // A stop the DAW never answers does not hold Record for good: past the limit the press ends with the failure sentence below (the take may still be
          // recording, and pressing Stop again asks once more). An answer that comes later changes nothing here.
          const stopAsked = await limited('recordStop', daw.recordStop());
          if (stopAsked.timedOut) throw new Error(noAnswerSentence(recorderName(capabilitiesRef.current?.daw)));
          result = stopAsked.value;
        }
        if (result.ok && starting && !alive.current && runningStart > seq) {
          // A newer press's take is the one running: this late start is not the Booth's to end.
          logUi('ui.record', 'A late start from a Booth that was left was not stopped: a newer take runs.');
          return false;
        }
        if (result.ok && starting && !alive.current) {
          // The Booth is gone: nobody can see this take or stop it, so it ends here, once. (The leave guard waits for a start that is out, so this is
          // only a start that nothing could wait for.)
          logUi('ui.record', 'A take started after the Booth was left; stopping it.');
          stopUnseenTake('as you left the Booth');
          return false;
        }
        if (result.ok) {
          running = starting;
          runningStart = starting ? Math.max(runningStart, seq) : 0;
          if (starting) startedRef.current?.(result);
          if (!starting && !recordsInApp(capabilitiesRef.current?.daw)) await stoppedRef.current?.(result);
          setRefused(null);
          if (!starting) {
            stopAccepted.current = true;
            dropClaim();
          }
          if (starting) {
            lastStartAt = Date.now();
            // A take this page starts is this chapter's, whatever claim a take it never saw end left behind (the Booth was left while it ran, and it ended with no page to see it).
            appTakeChapterId = chapterId;
            // Only a press's own answer claims a take for the app, and a take it started is never one the DAW did.
            appTakeRunning = true;
            setStartedInDaw(false);
            appTakeRunWritten = false;
          }
          // At once, not at the next render: a start that answers late reads this to tell a take that runs from one nobody owns.
          recordingRef.current = starting;
          if (starting) {
            endCheck.current = null;
            endOpen.current = false;
          }
          setRecording(starting);
          return starting;
        } else {
          // A press the narrator has left behind ends quietly: no message on whatever page they are on now.
          if (starting && how?.current && !how.current()) return false;
          const sentence = sentenceOr(
            result.refused,
            sentenceOr(result.message, starting ? 'The DAW did not start recording.' : 'The DAW did not stop recording.'),
          );
          setRefused({ chapterId, sentence });
          // The app's own recorder refuses a stop only when no take is recording: the take is over, so the Booth stops holding it.
          if (!starting && recordsInApp(capabilitiesRef.current?.daw)) setRecording(false);
          // The host knew something the last read did not (a track gone, a link removed elsewhere): read again, so the notice that fixes it shows.
          setReads((n) => n + 1);
          block({ cause: result.code === 'stale' ? 'no_track' : 'host_refused', reason: sentence });
        }
      } catch (error) {
        if (starting && how?.current && !how.current()) return false;
        // A host call that failed (not a refusal): nothing changed that this app knows of, and the narrator is told so.
        const what = starting ? 'Record did not start' : 'Stop did not go through';
        const sentence = `${what}: ${apiErrorMessage(error)
          .trim()
          .replace(/[.!?]+$/, '')}. Check ${recorderName(capabilitiesRef.current?.daw)} before pressing again.`;
        setRefused({ chapterId, sentence });
        block({ cause: 'failed', reason: sentence });
      } finally {
        busy.current = false;
        inflight.current = null;
        if (starting && alive.current) setStarting(false);
        done(running);
      }
      return false;
    },
    [daw, system, chapterId, notify, stopLateStart, stopUnseenTake],
  );

  // A take that ended in the DAW (the transport stopped, a quiet DAW) is no longer the running one: a start of an abandoned press that answers
  // after it is stopped like any other orphan (`runningStart`).
  const endedInDaw = useRef(recording);
  useEffect(() => {
    if (endedInDaw.current && !recording) runningStart = 0;
    endedInDaw.current = recording;
  }, [recording]);

  const settle = useCallback(() => inflight.current ?? Promise.resolve(recordingRef.current), []);

  const stopped = useCallback(() => {
    runningStart = 0;
    dropClaim();
    heardRecording.current = false;
    setRecording(false);
  }, []);

  const appStop = useCallback(async <T extends { ok: boolean }>(stopIt: () => Promise<T>): Promise<T> => {
    appStops.current += 1;
    // Released once, when the stop answers, fails, or has outlived its limit (a stop that never answers must not mute the end of every later take).
    let released = false;
    // 'unknown' is the page going away before the stop answered: what became of the stop is not known, so nothing is said about it.
    const release = (outcome: 'ok' | 'failed' | 'unknown') => {
      if (released) return;
      released = true;
      window.clearTimeout(timer);
      appStopReleases.current.delete(drop);
      appStops.current = Math.max(0, appStops.current - 1);
      // A push that comes just after the answer is the same stop's: the take is over, so there is no recording left to hear end. A stop that did not
      // go through leaves the take running, and an end heard meanwhile is heard now.
      if (outcome === 'ok') heardRecording.current = false;
      if (appStops.current === 0) {
        const say = heldSay.current;
        heldSay.current = null;
        if (outcome === 'failed') say?.();
      }
    };
    const giveUp = () => release('failed');
    const drop = () => release('unknown');
    const timer = window.setTimeout(giveUp, PRESS_LIMITS_MS.recordStop);
    appStopReleases.current.add(drop);
    try {
      const result = await stopIt();
      release(result.ok ? 'ok' : 'failed');
      return result;
    } catch (error) {
      release('failed');
      throw error;
    }
  }, []);
  // The page is gone: no stop still in flight may keep the next Booth's control from hearing a take end.
  useEffect(
    () => () => {
      for (const drop of [...appStopReleases.current]) drop();
    },
    [],
  );

  const stopping = useCallback(() => appStops.current > 0 || (busy.current && recordingRef.current), []);

  const stop = useCallback(async () => {
    if (!recordingRef.current) return true;
    stopAccepted.current = false;
    await toggle();
    return stopAccepted.current;
  }, [toggle]);

  return {
    capabilities,
    project,
    projectFailed,
    stoppedListening,
    recording,
    starting,
    settle,
    endConfirmed,
    endUnconfirmed,
    stopped,
    appStop,
    stopping,
    stop,
    startedByApp: !startedInDaw,
    reason,
    told: !check && shown !== '',
    gate,
    disabled: !recording && (!!check || blind),
    toggle,
    refresh,
    checkAgain: refresh,
    checkedAt,
    notFollowed,
    dawStatus: match?.chapterId === chapterId && !(isRecordingStatus(match.status) && project?.playState !== 'recording') ? match.status : null,
    readFailed,
    facts: { ...link.facts, openProject: link.open, ...(heldInDaw ? { dawRecording: true } : {}) },
    factsFailed: link.failed,
    factsLoaded: link.loaded,
  };
}
