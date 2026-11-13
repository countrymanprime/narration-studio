import { useEffect, useRef } from 'react';
import type { OverlayService } from '../../../overlay/overlayService';
import { retryAction, TOAST_MAX_MS } from '../../primitives/Toast';
import type { TeleprompterState } from '../../../types';
import { ACTIVE_PHASES } from '../useTeleprompterSession';

const STOP_FAILED_TOPIC = 'booth-listening-stop-failed';
// One topic for both sentences (stopped-failed on this page, still-open after leaving): the later replaces the earlier, never two at once.
const LEFT_TOPIC = STOP_FAILED_TOPIC;
/** How long a Retry that is out is said to be, at most: the stop call's own limit and its retry, and a little more. */
const TRYING_MS = 30_000;

type Overlay = Pick<OverlayService, 'toast' | 'dismissTopic'>;

/**
 * The microphone may still be open and the page that asked for the stop is gone (the narrator left with "Stop and leave" and the host refused it twice, or left
 * while the sentence was up): said once on the page they are on, without a Retry (nothing there can stop it, and the next Booth must not stop a session it did not
 * start), with the next step. It goes when the host reports the session ended, and after the longest a toast stays.
 */
export function sayListeningStillOpen(overlay: Overlay, subscribeState: (listener: (state: TeleprompterState) => void) => () => void): void {
  overlay.toast('The Booth could not stop listening, so your microphone may still be open. Quit and reopen the app to be sure.', {
    tone: 'error',
    topic: LEFT_TOPIC,
    durationMs: TOAST_MAX_MS,
  });
  let off = () => {};
  const done = () => {
    window.clearTimeout(timer);
    off();
  };
  const timer = window.setTimeout(done, TOAST_MAX_MS);
  off = subscribeState((state) => {
    if (ACTIVE_PHASES.includes(state.phase)) return;
    overlay.dismissTopic(LEFT_TOPIC);
    done();
  });
}

type Session = {
  stopFailed: boolean;
  stopRetry: 'idle' | 'trying' | 'stopped';
  retryStop: () => void;
  /** Counts the stops the host took. */
  stopTaken: number;
  /** A stop asked for by leaving: retried after the page is gone, `onFailed` called when it is refused twice then. */
  stopForLeave: (onFailed: () => void) => void;
  /** True once the narrator left asking for the stop (its own failure is said by `sayListeningStillOpen`). */
  leaving: { current: boolean };
  subscribeState: (listener: (state: TeleprompterState) => void) => () => void;
};

/**
 * Says, once, that the host would not stop the listening session (#3409): the microphone may still be open and the next start would find the session
 * "already running". Retry sends the stop again, only while the session it meant is still the one running (`retryStop`); the toast then says it is trying again
 * (so it never vanishes and comes back), and says "Listening stopped." when the host took it. The sentence stays the longest a toast may, and goes when its
 * reason does: the session ends, a new one starts or is joined (`stopFailed` clears). When the Booth is left with the sentence up, the page they land on says it
 * once more (`sayListeningStillOpen`). Only a sentence this page said is ever dismissed.
 */
export function useStopFailedSentence(overlay: Overlay, session: Session): void {
  const { stopFailed, stopRetry, stopTaken } = session;
  const leaveStop = useRef(session.stopForLeave);
  leaveStop.current = session.stopForLeave;
  const said = useRef(false);
  // A stop the host took ends the reason for a sentence said on another page too (the leave sentence outlives its Booth): the first render is not one.
  const taken = useRef(stopTaken);
  useEffect(() => {
    if (taken.current === stopTaken) return;
    taken.current = stopTaken;
    if (!said.current) overlay.dismissTopic(STOP_FAILED_TOPIC);
  }, [overlay, stopTaken]);
  const again = useRef(session.retryStop);
  again.current = session.retryStop;
  const watch = useRef(session.subscribeState);
  watch.current = session.subscribeState;
  const leaving = useRef(session.leaving);
  leaving.current = session.leaving;
  const failed = useRef(stopFailed);
  failed.current = stopFailed;
  useEffect(() => {
    if (stopFailed) {
      said.current = true;
      overlay.toast('The Booth could not stop listening, so your microphone may still be open. Press Retry.', {
        tone: 'error',
        topic: STOP_FAILED_TOPIC,
        durationMs: TOAST_MAX_MS,
        action: retryAction(() => {
          again.current();
          // The toast hands focus to another toast's button: the narrator's place is Record.
          window.setTimeout(() => {
            const active = document.activeElement;
            if (!active || active === document.body || active.closest('[data-toast-region]'))
              (document.getElementById('brec') ?? document.querySelector<HTMLElement>('button[aria-label="Stop reading"]'))?.focus();
          }, 400);
        }),
      });
    } else if (stopRetry === 'trying') {
      said.current = true;
      overlay.toast('Trying to stop listening again…', { topic: STOP_FAILED_TOPIC, durationMs: TRYING_MS });
    } else if (stopRetry === 'stopped' && said.current) {
      said.current = false;
      overlay.toast('Listening stopped.', { topic: STOP_FAILED_TOPIC });
    } else if (said.current) {
      said.current = false;
      overlay.dismissTopic(STOP_FAILED_TOPIC);
    }
  }, [overlay, stopFailed, stopRetry]);
  useEffect(
    () => () => {
      if (!said.current) return;
      said.current = false;
      overlay.dismissTopic(STOP_FAILED_TOPIC);
      // Left with the sentence up (a link, Ctrl+Alt+C, Back): the stop was refused, but no stop was asked for the way out, so it is tried once more now, and said on
      // the next page only if that is refused too. A leave's own stop that is still out says its own result.
      if (failed.current && !leaving.current.current) leaveStop.current(() => sayListeningStillOpen(overlay, watch.current));
    },
    [overlay],
  );
}
