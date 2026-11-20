import { useCallback, useEffect, useRef } from 'react';
import type { DawResult } from '../../../api/contracts/daw';
import type { LeaveGuardStore } from '../../../studio/journal/leaveGuard';
import type { OverlayService } from '../../../overlay/overlayService';
import { pageNameFor } from '../../layout/railPages';
import { CHAPTER_OPEN_ANYWAY, stopRecordingSpec } from './stopRecordingSpec';

/** The seam the Booth gives the guard: not a `DawClient`, only what leaving needs to know and do. */
export type BoothLeaveSession = {
  recording: boolean;
  /** True while the take is only being started (the DAW has not said it records): the question says so, and closes if the start ends with no take. */
  startPending?: boolean;
  /** False when the DAW was already recording and the app did not start the take. Default true. */
  startedByApp?: boolean;
  daw: { name: string };
  /** `deferTell`: the narrator's Stop and leave: what says the take is saved waits for `arrived`, so it is up when the next page is, not while the run is still being written. */
  stopRecording: (options?: { deferTell?: boolean }) => Promise<DawResult>;
  /** Whether the take that just ended ended with the DAW answering (true) or because the DAW went quiet (false). Absent: confirmed. A take of a DAW that went quiet may still record, so it is not taken for over. */
  endConfirmed?: () => Promise<boolean>;
  /** True while a take that has ended is not yet known to have ended with the DAW answering. Leaving is not allowed silently then: the stop is tried and its refusal asked. */
  endUnconfirmed?: () => boolean;
  /** Whether the DAW itself says it records now (its play state): a take that ended in the Booth's eyes may be recording again, started in the DAW (#3555 item 2). Absent: not asked. */
  dawRecordingNow?: () => Promise<boolean>;
  /** Resolves when a start that is still out lands or fails, with whether a take is running then. The narrator's yes waits for it, so what it stops is a take. */
  settle?: () => Promise<boolean>;
  /** Writes what the take left behind (the passage map's run); called once the stop is confirmed and before `go`. Must not reject. */
  flush?: () => Promise<void>;
  /** Called when an attempt to stop and leave ends (the stop confirmed and the run written, just before `go`; or the DAW's end, a refusal, no answer): raises what `stopRecording({ deferTell })` held back and lets a later answer raise at once. */
  arrived?: () => void;
};

/** True when nothing records now but the end of the take is not known to have come with the DAW answering: it may still be recording. */
const unconfirmedEnd = (session: BoothLeaveSession): boolean => !session.recording && !!session.endUnconfirmed?.();

/**
 * What the open question claims about the take: it is running and the app stops it, it may still be running (the DAW went quiet before saying it ended), or the DAW
 * records a take the app did not start. A question whose claim stopped being true is asked again with the true one (#3555 item 2).
 */
type Claim = 'running' | 'unconfirmed' | 'foreign';
const claimOf = (session: BoothLeaveSession): Claim => (!(session.startedByApp ?? true) ? 'foreign' : unconfirmedEnd(session) ? 'unconfirmed' : 'running');

/** How long the refusal's "Leave anyway" ignores a press after it appears: the second click of a double-click on the button it replaced. */
const LEAVE_ANYWAY_ARM_MS = 400;

/** How long the stop, the wait for a start and the passage map's run are each given after the narrator said yes (the host's own deadlines are of this order). */
export const LEAVE_WAIT_MS = 8000;
const STOPPING_TOPIC = 'booth-leave-stopping';
const STOPPING_TOAST_MS = 3 * LEAVE_WAIT_MS + 1000;
/**
 * A DAW's own stop pushes its stopped transport before the stop's reply, so a take seen to end while this decision's stop is out is most likely that stop:
 * its reply (which writes the take's undo entry) is waited for this long before the end is believed on its own.
 */
const END_GRACE_MS = 1500;
const NO_ANSWER = 'The DAW did not answer in time.';

/** `work`'s answer, or null when it has not come after `ms`: an answer that never comes must not hold the narrator in the Booth. */
async function within<T>(work: Promise<T>, ms: number): Promise<{ value: T } | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([work.then((value) => ({ value })), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** The end check's answer, or false when it has not come after `LEAVE_WAIT_MS` or failed: an end not known to be with the DAW answering is not an end. */
async function confirmedWithin(check: Promise<boolean> | undefined): Promise<boolean> {
  if (!check) return true;
  try {
    return (await within(check, LEAVE_WAIT_MS))?.value ?? false;
  } catch {
    return false;
  }
}

type Deps = {
  guard: Pick<LeaveGuardStore, 'setLeaveGuard'>;
  overlay: Pick<OverlayService, 'confirm' | 'toast' | 'dismissTopic'>;
};

/**
 * Registers the Booth's leave guard while a take records and returns `leave`, the one way out the Booth's own exits take
 * (Escape, the setup chip, a chapter opened in Script) and, as the verdict's `decide`, the one the app shell uses for the nav, Back and Forward. `leave(next, go)` asks "Stop recording?" once, holds the take until
 * the narrator answers, stops the recording the app started, flushes the passage map's run, and only then calls `go` with the same destination. Keep
 * recording changes nothing. A refused stop keeps the question open with the host's sentence and offers "Leave anyway". The guard is removed when
 * the recording ends or the Booth unmounts.
 */
export function useBoothLeaveGuard(session: BoothLeaveSession, { guard, overlay }: Deps) {
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const asking = useRef<Promise<boolean> | null>(null);
  // Which take the narrator was asked about and answered yes for. A take that starts after that stop and before the page goes is a different take,
  // and the page's own stop must still end it: `take` counts the takes, `answeredFor` is the one the yes was for.
  const take = useRef(0);
  const answeredFor = useRef(-1);
  const answered = useRef(false);
  // The Booth is gone (it went some other way than this decision's own move): what is still waiting must not open a question over the page the narrator is
  // on now, nor move them. Whatever it still has to stop, the page's unmount stop and a late start's own stop do.
  const gone = useRef(false);
  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
    };
  }, []);
  const { recording } = session;
  // The take ended in the DAW (REAPER, the pedal, the host's own limit) while this decision waits on its stop: the stop wait is woken at once and leaves
  // with no refusal question, which would be about a take that is already over.
  // True while "Stopping the take…" is the narrator's only sign that the decision is waiting. A second exit in that time says it again: the message has an X, and a
  // narrator who closed it and pressed another exit would otherwise be ignored with nothing on screen (#3349).
  const waiting = useRef(false);
  const sayStopping = useCallback(() => {
    overlay.toast('Stopping the take…', { topic: STOPPING_TOPIC, durationMs: STOPPING_TOAST_MS });
  }, [overlay]);
  const wakeOnEnd = useRef<(() => void) | null>(null);
  useEffect(() => {
    const wake = wakeOnEnd.current;
    if (recording || !wake) return;
    // Only a take the DAW confirmed over wakes the wait: a DAW that went quiet reads as stopped too, and its take may still record.
    void Promise.resolve(sessionRef.current.endConfirmed?.() ?? true).then((confirmed) => confirmed && wake());
  }, [recording]);
  // The question asked while a start was still pending ("is starting a take"): closed by itself when the start ends with no take, because nothing is left
  // to stop. A question about a take that really ran stays when that take ends by itself, as before (#3342): its "Stop and leave" then leaves.
  const open = useRef<{ close: AbortController; pending: boolean; refusal: boolean; claim: Claim } | null>(null);
  const reask = useRef(false);
  useEffect(() => {
    if (!open.current?.pending) return;
    // The start landed as a take: from here the question is about a real take and is no longer closed for its end.
    if (session.recording && !session.startPending) {
      // The question said the DAW was only starting: it is asked again as the recording question, in the same place (`decide` loops on `reask`).
      open.current.pending = false;
      reask.current = true;
      open.current.close.abort();
    } else if (!recording) open.current.close.abort();
  }, [recording, session.recording, session.startPending]);
  // The DAW went quiet while the question about a running take was open, or answered again with a take of its own: what the question says is no longer true, so it is
  // asked again with what is (`decide` loops on `reask`). A take that merely ended with the DAW answering keeps the question: its Stop and leave then leaves (#3342).
  const claim = claimOf(session);
  // The question about a take the app did not start says the DAW keeps recording: once that take has ended it is not true, and the narrator is no longer asked.
  useEffect(() => {
    const asked = open.current;
    if (asked && asked.claim === 'foreign' && !recording && !asked.refusal) asked.close.abort();
  }, [recording]);
  useEffect(() => {
    const asked = open.current;
    // A refusal already reports the DAW's last answer to a stop: it stays as it is.
    if (!asked || asked.pending || asked.refusal || asked.claim === claim) return;
    const askAgain = () => {
      reask.current = true;
      asked.close.abort();
    };
    if (claim === 'unconfirmed' && !sessionRef.current.recording) {
      // Every end is unconfirmed until the DAW has been read once: a take that ended with the DAW answering keeps its question. Only an end that read says it cannot vouch for
      // (the DAW quiet) makes the question say so.
      let current = true;
      void confirmedWithin(sessionRef.current.endConfirmed?.()).then((confirmed) => {
        if (current && !confirmed && open.current === asked && claimOf(sessionRef.current) === 'unconfirmed') askAgain();
      });
      return () => {
        current = false;
      };
    }
    if (sessionRef.current.recording) askAgain();
  }, [claim, recording]);

  // The question, the stop and its refusal: true once the take is over (or was never the app's) and the move may go, false when the narrator stayed.
  // One at a time: a second caller while it is open is the same question, and does not move.
  const decide = useCallback(
    (next?: string): Promise<boolean> => {
      const destination = next === undefined ? undefined : pageNameFor(next);
      const endIsConfirmed = () => confirmedWithin(sessionRef.current.endConfirmed?.());
      const recordingInDaw = async (): Promise<boolean> => {
        try {
          return (await within(Promise.resolve(sessionRef.current.dawRecordingNow?.() ?? false), LEAVE_WAIT_MS))?.value ?? false;
        } catch {
          return false;
        }
      };
      const now = sessionRef.current;
      if (asking.current) {
        if (waiting.current) sayStopping();
        return asking.current.then(() => false);
      }
      const run = async (): Promise<boolean> => {
        const mine = take.current;
        let startedByApp = now.startedByApp ?? true;
        let spec = stopRecordingSpec(now.daw.name, startedByApp, now.startPending, destination, unconfirmedEnd(now));
        let refusedOnce = false;
        // Whether the question asked is the one about a start still pending; the re-ask after the start landed is an ordinary recording question.
        let startAsked = !!now.startPending;
        for (;;) {
          const closing = new AbortController();
          open.current = { close: closing, pending: startAsked && !refusedOnce, refusal: refusedOnce, claim: claimOf(sessionRef.current) };
          const yes = gone.current ? false : await overlay.confirm(spec, closing.signal).finally(() => (open.current = null));
          // The start landed as a take while the question was open: it is asked again as the recording question, with its own Enter hold.
          if (reask.current && !gone.current) {
            reask.current = false;
            startedByApp = sessionRef.current.startedByApp ?? true;
            spec = stopRecordingSpec(now.daw.name, startedByApp, false, destination, unconfirmedEnd(sessionRef.current));
            startAsked = false;
            continue;
          }
          // Closed because nothing records now: the narrator stays, with nothing left to stop (the press said why).
          if (!yes || gone.current || closing.signal.aborted) return false;
          // The stop was refused and the narrator chose to leave anyway: a DAW that does not answer must not hold them in the Booth.
          if (!startedByApp || refusedOnce) {
            answeredFor.current = mine;
            answered.current = true;
            return true;
          }
          // What the narrator sees while the DAW answers; each wait below ends within LEAVE_WAIT_MS, in the refusal question when it does not.
          // Up for the whole of the waits (three, each at most LEAVE_WAIT_MS), so it never expires while a stop is still pending; `dismissTopic` takes it away.
          waiting.current = true;
          sayStopping();
          let sentence: string;
          try {
            // A start still out when the question was answered lands first; if it did not start a take there is nothing to stop.
            const landed = sessionRef.current.settle ? await within(sessionRef.current.settle(), LEAVE_WAIT_MS) : { value: true };
            if (gone.current) return false;
            if (!landed) sentence = NO_ANSWER;
            // `landed.value` false is "no take is running now": for a start that was pending that is nothing to stop. For a take that was running when the
            // narrator was asked it is not enough, because a DAW that went quiet reads the same: that case goes on to the stop, which checks the end (below).
            else if (!landed.value && now.startPending) {
              answeredFor.current = mine;
              answered.current = true;
              return true;
            } else {
              // The yes is given and this decision is stopping the take: the page's unmount stop leaves it to this one.
              answered.current = true;
              answeredFor.current = mine;
              // A take the DAW has already ended (during the question or while this waits) has nothing to stop: what it wrote is flushed and they leave.
              // The DAW answering is not the take being over: asked once more whether it records, a take started in the DAW since is stopped like any other, not left running unsaid.
              let takeEnded = !sessionRef.current.recording && !sessionRef.current.startPending && (await endIsConfirmed()) && !(await recordingInDaw());
              // Set the moment the DAW confirms the end, before the grace is over: a refusal that arrives then is about a take that is already over.
              let endSeen = takeEnded;
              const endWait = new Promise<'ended'>((resolve) => {
                wakeOnEnd.current = () => {
                  // Not yet "ended": the stop this decision sent may be what ended it, and its reply is still to come.
                  endSeen = true;
                  setTimeout(() => {
                    takeEnded = true;
                    resolve('ended');
                  }, END_GRACE_MS);
                };
              });
              const stopped = takeEnded
                ? null
                : await within(Promise.race<DawResult | 'ended'>([sessionRef.current.stopRecording({ deferTell: true }), endWait]), LEAVE_WAIT_MS);
              wakeOnEnd.current = null;
              if (takeEnded || stopped?.value === 'ended' || (endSeen && stopped && !stopped.value.ok)) {
                await within(sessionRef.current.flush?.() ?? Promise.resolve(), LEAVE_WAIT_MS);
                return !gone.current;
              }
              if (!stopped) sentence = NO_ANSWER;
              else if (stopped.value.ok) {
                // A run that cannot be written in time does not hold the narrator either: the take is stopped, and they leave.
                await within(sessionRef.current.flush?.() ?? Promise.resolve(), LEAVE_WAIT_MS);
                return !gone.current;
              } else sentence = stopped.value.refused ?? (stopped.value.message || '');
              // Not stopped: the take still runs, so it is not this decision's to call handled.
              answeredFor.current = -1;
              answered.current = false;
              if (gone.current) {
                overlay.toast(`The take could not be stopped: ${sentence} Stop it in ${now.daw.name}.`, { tone: 'error' });
                return false;
              }
            }
          } finally {
            // Whatever this attempt ended in releases what the stop held back (`deferTell`): a move (after the run is written, before `go`), the take the DAW ended while the stop was
            // still out, a refusal or a gone page. Nothing stays held for good: an answer that comes after this is raised at once, where the narrator is.
            sessionRef.current.arrived?.();
            waiting.current = false;
            overlay.dismissTopic(STOPPING_TOPIC);
          }
          // The stop was refused or never answered: nothing changed that this app knows of, so the take may still run. The question stays, now with a way out.
          refusedOnce = true;
          spec = {
            // The labels of the question as the DAW is now: a take that went quiet after "Keep recording" was offered offers "Stay", as the unconfirmed question does.
            ...stopRecordingSpec(now.daw.name, startedByApp, false, destination, unconfirmedEnd(sessionRef.current)),
            title: 'Could not stop the take',
            body: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} You can ${destination === 'Booth' ? 'open it' : 'leave'} anyway, but it may keep recording.`.trim(),
            confirmLabel: destination === 'Booth' ? CHAPTER_OPEN_ANYWAY : 'Leave anyway',
            // A double-click on "Stop and leave" must not land on the "Leave anyway" that replaces it before the sentence can be read.
            armAfterMs: LEAVE_ANYWAY_ARM_MS,
          };
        }
      };
      const pending = run().finally(() => {
        asking.current = null;
      });
      asking.current = pending;
      return pending;
    },
    [overlay, sayStopping],
  );

  useEffect(() => {
    if (recording) take.current += 1;
  }, [recording]);

  // Registered while the Booth is up, not only while a take records: from the narrator's yes until the move happens (the stop, then the passage map's
  // run) the question is still answered, so a second exit in that time asks nothing new and moves nowhere.
  useEffect(() => {
    guard.setLeaveGuard((next) => {
      const now = sessionRef.current;
      if (!now.recording && !asking.current && !now.endUnconfirmed?.()) return 'allow';
      return {
        ask: stopRecordingSpec(now.daw.name, now.startedByApp ?? true, now.startPending, pageNameFor(next), unconfirmedEnd(now)),
        decide: () => decide(next),
      };
    });
    return () => guard.setLeaveGuard(null);
  }, [guard, decide]);

  const leave = useCallback(
    // True when the narrator let go and a move is on its way (this one, or the one already decided that this exit joins); false when they stayed.
    async (next: string, go: (next: string) => void): Promise<boolean> => {
      // A move already decided is on its way (the question is open, or the stop and the run are being written): this exit is the same one, and does not go twice.
      if (asking.current) {
        if (waiting.current) sayStopping();
        return await asking.current;
      }
      if (!sessionRef.current.recording && !sessionRef.current.endUnconfirmed?.()) {
        go(next);
        return true;
      }
      if (await decide(next)) {
        go(next);
        return true;
      }
      return false;
    },
    [decide, sayStopping],
  );

  // Stable: the page's unmount effect depends on them and must not re-run (and stop a take) on every render.
  const handled = useCallback(() => answeredFor.current === take.current, []);
  const leaving = useCallback(() => answered.current, []);

  return {
    leave,
    decide,
    /** True while the take now running is the one `decide` answered yes for: its stop, or the narrator's "Leave anyway", is already done. */
    handled,
    /** True once the narrator answered yes to leaving: the page is going, so a take started since is stopped as it goes. */
    leaving,
  };
}
