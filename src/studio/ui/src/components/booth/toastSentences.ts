// The Booth's own sentences that a narrator reads in a toast. Each fits two lines beside the buttons it comes with (`TOAST_CHAR_BUDGET`, #4095): the reason and the fix are on screen
// without a scroll. They live here, with no imports of the hooks that say them, so the guard (`refusalSentences.test.ts`) and the layout check
// (`tests/visual/booth-refusals-two-lines.spec.ts`) read the same text the Booth shows.
import type { DawKind } from '../../api/contracts/daw';
import { recorderNameCapital, recordsInApp } from '../../studio/dawNames';

/** The sentences a failed stop says: plain messages, or with Retry. */
export const LISTENING_STILL_OPEN = 'The Booth could not stop listening, so your microphone may still be open. Quit and reopen the app.';
export const LISTENING_STOP_FAILED = 'The Booth could not stop listening, so your microphone may still be open. Press Retry.';

/** Said when a take that is still recording lost its text-following. */
export const TAKE_UNFOLLOWED = 'The text could not follow your voice for this take. Press Stop, then record again.';

/** Said when a roll the Booth stopped waiting for lands after all. `recorder` is the recorder as a sentence names it (`recorderName`). */
export const rollLandedSentence = (recorder: string): string => `A late roll has landed and a take may have been cut. Check ${recorder}.`;

/** Said when the recorder did not answer a roll in time. `name` is the recorder for the start of a sentence (`recorderNameCapital`). */
export const rollTimeoutSentence = (name: string): string => `${name} did not answer the roll. The take may still run; check it, then roll again.`;

/** Where a passage was recorded is not known, could not be read, or did not come back in time: nothing was started. */
export const NOT_KNOWN = 'Where this passage was recorded is not known, so no take was started.';
export const LOOKUP_FAILED = 'Where this passage was recorded could not be read, so no start is chosen. Choose the phrase again.';
export const LOOKUP_SLOW = 'Where this passage was recorded did not come back in time. No start is chosen; choose the phrase again.';

/**
 * What the Booth says when the DAW answered that a take this app started has stopped: the narrator's own Stop there. The app's own
 * recorder has no other place to stop a take, so its take ended by itself: `why` is the recorder's own sentence for it (the host words it, so it is not held to the budget), if it has one.
 */
export const stoppedInDaw = (daw: DawKind | undefined, why = ''): string =>
  recordsInApp(daw)
    ? `${why ? `${why.replace(/[.\s]+$/, '')}. ` : ''}The take ended. Its audio is kept in the project's Recordings folder; press Record for the next one.`
    : `${recorderNameCapital(daw)} stopped recording. The take ended there; press Record to start the next one.`;

/**
 * What the Booth says once a DAW that went quiet during a take answers again: its own take ended when it went quiet, and what the DAW did with the audio is for the narrator to check.
 * A take the DAW started (`byDaw`) is only followed, so the app's own recorder never has one: its name would not fit the sentence.
 */
export const backInDaw = (daw: DawKind | undefined, byDaw: boolean): string => {
  const name = recorderNameCapital(daw);
  // A take the DAW started was only followed: the Booth stopped listening, it did not end anything.
  if (byDaw) return `${name} answers again. The Booth stopped listening while it was quiet; check it is still recording.`;
  return `${name} answers again. This window ended its take when it went quiet; check it was kept.`;
};

/** What the Booth says when the DAW stopped answering during a take: it did not say the take ended, and may still be recording. */
export const lostInDaw = (daw: DawKind | undefined): string =>
  `${recorderNameCapital(daw)} stopped answering, so the Booth can't tell if the take still runs. Check it.`;
