import { useCallback, useEffect, useRef } from 'react';
import type { DawResult } from '../../../api/contracts/daw';
import type { LeaveGuardStore } from '../../../studio/journal/leaveGuard';
import type { OverlayService } from '../../../overlay/overlayService';
import { stopRecordingSpec } from './stopRecordingSpec';

/** The seam the Booth gives the guard: not a `DawClient`, only what leaving needs to know and do. */
export type BoothLeaveSession = {
  recording: boolean;
  /** True while the take is only being started (the DAW has not said it records): the question says so, and closes if the start ends with no take. */
  startPending?: boolean;
  /** False when the DAW was already recording and the app did not start the take. Default true. */
  startedByApp?: boolean;
  daw: { name: string };
  stopRecording: () => Promise<DawResult>;
  /** Resolves when a start that is still out lands or fails, with whether a take is running then. The narrator's yes waits for it, so what it stops is a take. */
  settle?: () => Promise<boolean>;
  /** Writes what the take left behind (the passage map's run); called once the stop is confirmed and before `go`. Must not reject. */
  flush?: () => Promise<void>;
};

/** How long the refusal's "Leave anyway" ignores a press after it appears: the second click of a double-click on the button it replaced. */
const LEAVE_ANYWAY_ARM_MS = 400;

/** How long the stop, the wait for a start and the passage map's run are each given after the narrator said yes (the host's own deadlines are of this order). */
export const LEAVE_WAIT_MS = 8000;
const STOPPING_TOPIC = 'booth-leave-stopping';
const STOPPING_TOAST_MS = 3 * LEAVE_WAIT_MS + 1000;
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
  // The question asked while a start was still pending ("is starting a take"): closed by itself when the start ends with no take, because nothing is left
  // to stop. A question about a take that really ran stays when that take ends by itself, as before (#3342): its "Stop and leave" then leaves.
  const open = useRef<{ close: AbortController; pending: boolean } | null>(null);
  useEffect(() => {
    if (!open.current?.pending) return;
    // The start landed as a take: from here the question is about a real take and is no longer closed for its end.
    if (session.recording && !session.startPending) open.current.pending = false;
    else if (!recording) open.current.close.abort();
  }, [recording, session.recording, session.startPending]);

  // The question, the stop and its refusal: true once the take is over (or was never the app's) and the move may go, false when the narrator stayed.
  // One at a time: a second caller while it is open is the same question, and does not move.
  const decide = useCallback((): Promise<boolean> => {
    const now = sessionRef.current;
    if (asking.current) return asking.current.then(() => false);
    const run = async (): Promise<boolean> => {
      const mine = take.current;
      const startedByApp = now.startedByApp ?? true;
      let spec = stopRecordingSpec(now.daw.name, startedByApp, now.startPending);
      let refusedOnce = false;
      for (;;) {
        const closing = new AbortController();
        open.current = { close: closing, pending: !!now.startPending && !refusedOnce };
        const yes = gone.current ? false : await overlay.confirm(spec, closing.signal).finally(() => (open.current = null));
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
        overlay.toast('Stopping the take…', { topic: STOPPING_TOPIC, durationMs: STOPPING_TOAST_MS });
        let sentence: string;
        try {
          // A start still out when the question was answered lands first; if it did not start a take there is nothing to stop.
          const landed = sessionRef.current.settle ? await within(sessionRef.current.settle(), LEAVE_WAIT_MS) : { value: true };
          if (gone.current) return false;
          if (!landed) sentence = NO_ANSWER;
          else if (!landed.value) {
            answeredFor.current = mine;
            answered.current = true;
            return true;
          } else {
            // The yes is given and this decision is stopping the take: the page's unmount stop leaves it to this one.
            answered.current = true;
            answeredFor.current = mine;
            const stopped = await within(sessionRef.current.stopRecording(), LEAVE_WAIT_MS);
            if (!stopped) sentence = NO_ANSWER;
            else if (stopped.value.ok) {
              // A run that cannot be written in time does not hold the narrator either: the take is stopped, and they leave.
              await within(sessionRef.current.flush?.() ?? Promise.resolve(), LEAVE_WAIT_MS);
              return !gone.current;
            } else sentence = stopped.value.refused ?? (stopped.value.message || '');
            // Not stopped: the take still runs, so it is not this decision's to call handled.
            answeredFor.current = -1;
            if (gone.current) {
              overlay.toast(`The take could not be stopped: ${sentence} Stop it in ${now.daw.name}.`, { tone: 'error' });
              return false;
            }
          }
        } finally {
          overlay.dismissTopic(STOPPING_TOPIC);
        }
        // The stop was refused or never answered: nothing changed that this app knows of, so the take may still run. The question stays, now with a way out.
        refusedOnce = true;
        spec = {
          ...spec,
          title: 'Could not stop the take',
          body: `${sentence} You can leave anyway, but it may keep recording.`.trim(),
          confirmLabel: 'Leave anyway',
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
  }, [overlay]);

  useEffect(() => {
    if (recording) take.current += 1;
  }, [recording]);

  // Registered while the Booth is up, not only while a take records: from the narrator's yes until the move happens (the stop, then the passage map's
  // run) the question is still answered, so a second exit in that time asks nothing new and moves nowhere.
  useEffect(() => {
    guard.setLeaveGuard(() => {
      const now = sessionRef.current;
      if (!now.recording && !asking.current) return 'allow';
      return { ask: stopRecordingSpec(now.daw.name, now.startedByApp ?? true, now.startPending), decide };
    });
    return () => guard.setLeaveGuard(null);
  }, [guard, decide]);

  const leave = useCallback(
    async (next: string, go: (next: string) => void): Promise<void> => {
      // A move already decided is on its way (the question is open, or the stop and the run are being written): this exit is the same one, and does not go twice.
      if (asking.current) {
        await asking.current;
        return;
      }
      if (!sessionRef.current.recording) {
        go(next);
        return;
      }
      if (await decide()) go(next);
    },
    [decide],
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
