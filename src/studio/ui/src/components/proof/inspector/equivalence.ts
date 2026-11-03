import { useCallback, useSyncExternalStore } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import type { Finding, NarrationApi } from '../../../types';

/** What "Treat these two words as the same" asks of the host: the add, and the note read again after a refusal. */
export type EquivalenceApi = Pick<NarrationApi, 'transcriptAddEquivalence' | 'findingsGet'>;

/** How long a press waits for the host before the button is free again. The host writes one short line, so this is a host that hung. */
export const EQUIVALENCE_WAIT_MS = 15_000;

const NO_ANSWER = `The app did not answer in ${EQUIVALENCE_WAIT_MS / 1000} s, so the two words may not have been added. Press again to try: a pair already added is not added twice.`;

// The host's own test of a word (src/studio/desktop/internal/transcript/service.go oneWord): not empty, and no space, tab or line break.
const oneWord = (word: string | undefined): boolean => Boolean(word) && !/[ \t\r\n]/.test(word!);

/**
 * A Transcript Compare note that read one word as one other word: the notes the host's transcript.OneWordMisread accepts, so the button
 * is never shown for a request that can only be refused.
 */
export function oneWordMisread(finding: Finding): boolean {
  return (
    finding.analyzer === 'transcript-compare' &&
    finding.category === 'transcript_discrepancy' &&
    finding.evidence?.kind === 'MISREAD' &&
    oneWord(finding.manuscript?.expected) &&
    oneWord(finding.manuscript?.recorded)
  );
}

// The requests in flight, by finding id, each with its own token. They live outside the Inspector, so selecting another note and coming
// back, or leaving Proof, neither loses a request nor lets a second one start.
const inFlight = new Map<string, number>();
const listeners = new Set<() => void>();
let lastToken = 0;
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Whether the note's add is waiting for the host. */
export function useEquivalencePending(findingId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => inFlight.has(findingId), [findingId]),
  );
}

/** Forgets every request (tests). */
export function resetEquivalenceRequests(): void {
  inFlight.clear();
  notify();
}

/**
 * Asks the host to treat the note's two words as the same in later checks. A press while the note's request runs is ignored. The host's
 * answer is an information toast (the words it names say which note it was), and the note's decision is left as it was. A refusal or a
 * failure is the host's sentence in an error toast, and the note is read again and handed to `onNoteRead`, since the refusal usually
 * means a re-check changed it; the re-read is of the note pressed, whichever note is shown by then. With no answer in
 * `EQUIVALENCE_WAIT_MS` the button is free again and a late answer is dropped.
 */
export async function addEquivalence(api: EquivalenceApi, findingId: string, onNoteRead: (finding: Finding) => void): Promise<void> {
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
    else overlay.toast(answer.message, { topic: 'equivalence' });
  } catch (error) {
    overlay.toast(apiErrorMessage(error), { tone: 'error' });
    try {
      onNoteRead(await api.findingsGet(findingId));
    } catch (reread) {
      // The note stays as shown; the failed re-read is said too, so a stale button is not trusted silently.
      overlay.toast(apiErrorMessage(reread), { tone: 'error' });
    }
  } finally {
    clearTimeout(timer);
    if (inFlight.get(findingId) === token) {
      inFlight.delete(findingId);
      notify();
    }
  }
}
