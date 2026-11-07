import { useCallback, useSyncExternalStore } from 'react';
import { equivalencePair } from '../../../api/equivalenceWords';
import { apiErrorMessage } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import { retryAction } from '../../primitives/Toast';
import type { Finding, NarrationApi } from '../../../types';

/** What "Treat these two words as the same" asks of the host: the add, and the note read again after a refusal. */
export type EquivalenceApi = Pick<NarrationApi, 'transcriptAddEquivalence' | 'findingsGet'>;

/** How long a press waits for the host before the button is free again. The host writes one short line, so this is a host that hung. */
export const EQUIVALENCE_WAIT_MS = 15_000;

/** The off button's reason once the host has the pair (walkthrough 4 on #2807): it is not a toggle, so it does not stay looking pressed. */
export const ALREADY_TREATED = 'Already treated as the same';

/** What comes next, after the host's answer (walkthrough 1 on #2807): the note itself stays as the narrator decided it. */
const NEXT = 'Later checks count them as one word, so this note can be marked Fine as read.';

const NO_ANSWER = `The app did not answer in ${EQUIVALENCE_WAIT_MS / 1000} s, so the two words may not have been added. Press again to try: a pair already added is not added twice.`;

/**
 * A Transcript Compare note that read one word as one other word that the host can write: the notes the host's transcript.OneWordMisread
 * accepts, so the button is never shown for a request that can only be refused.
 */
export function oneWordMisread(finding: Finding): boolean {
  return (
    finding.analyzer === 'transcript-compare' &&
    finding.category === 'transcript_discrepancy' &&
    finding.evidence?.kind === 'MISREAD' &&
    equivalencePair(finding.manuscript?.expected, finding.manuscript?.recorded)
  );
}

// The requests in flight, by finding id, each with its own token, and the pairs the host has (by `pairKey`). They live outside the
// Inspector, so selecting another note and coming back, or leaving Proof, neither loses a request, nor lets a second one start, nor shows a
// pair the host has as if it could be added again.
const inFlight = new Map<string, number>();
const treated = new Set<string>();
const listeners = new Set<() => void>();
let lastToken = 0;
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The two words of a note, in either order and any case: the host treats `Dinah = Dina` and `DINA = dinah` as one pair. */
const pairKey = (finding: Finding): string =>
  [finding.manuscript?.expected ?? '', finding.manuscript?.recorded ?? '']
    .map((word) => word.toLowerCase())
    .sort()
    .join('\u0000');

/** Whether the note's add is waiting for the host. */
export function useEquivalencePending(findingId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => inFlight.has(findingId), [findingId]),
  );
}

/** Whether the host has said, since the app started, that it has the note's two words. */
export function useEquivalenceTreated(finding: Finding): boolean {
  const key = pairKey(finding);
  return useSyncExternalStore(
    subscribe,
    useCallback(() => treated.has(key), [key]),
  );
}

/** Forgets every request and every pair (tests). */
export function resetEquivalenceRequests(): void {
  inFlight.clear();
  treated.clear();
  notify();
}

/**
 * Asks the host to treat the note's two words as the same in later checks. A press while the note's request runs is ignored. The host's
 * answer, with what comes next, is an information toast (the words it names say which note it was), the button is then off with
 * `ALREADY_TREATED` as its reason, and the note's decision is left as it was. A refusal or a failure is the host's sentence in an error
 * toast, and the note is read again and handed to `onNoteRead`, since the refusal usually means a re-check changed it; the re-read is of
 * the note pressed, whichever note is shown by then. With no answer in `EQUIVALENCE_WAIT_MS` the button is free again and a late answer is
 * dropped.
 */
export async function addEquivalence(api: EquivalenceApi, finding: Finding, onNoteRead: (finding: Finding) => void): Promise<void> {
  const findingId = finding.id;
  if (inFlight.has(findingId)) return;
  const token = ++lastToken;
  inFlight.set(findingId, token);
  notify();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), EQUIVALENCE_WAIT_MS);
  });
  try {
    const answer = await Promise.race([api.transcriptAddEquivalence(findingId).then((message) => ({ message })), timedOut]);
    if (answer === 'timeout') overlay.toast(NO_ANSWER, { tone: 'error' });
    else {
      treated.add(pairKey(finding));
      overlay.toast(`${answer.message}. ${NEXT}`, { topic: 'equivalence' });
    }
  } catch (error) {
    overlay.toast(apiErrorMessage(error), { tone: 'error' });
    // Reading the note again changes nothing, so the failed re-read's toast offers Retry (issue #2919).
    const reread = async (): Promise<void> => {
      try {
        onNoteRead(await api.findingsGet(findingId));
      } catch (again) {
        // The note stays as shown; the failed re-read is said too, so a stale button is not trusted silently.
        overlay.toast(apiErrorMessage(again), { tone: 'error', action: retryAction(() => void reread()) });
      }
    };
    await reread();
  } finally {
    clearTimeout(timer);
    if (inFlight.get(findingId) === token) inFlight.delete(findingId);
    notify();
  }
}
