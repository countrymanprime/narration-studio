// The Booth's own sentences that a narrator reads in a toast. Each fits two lines beside the buttons it comes with (`TOAST_CHAR_BUDGET`, #4095): the reason and the fix are on screen
// without a scroll. They live here, with no imports of the hooks that say them, so the guard (`refusalSentences.test.ts`) and the layout check
// (`tests/visual/booth-refusals-two-lines.spec.ts`) read the same text the Booth shows.
import type { DawKind } from '../../api/contracts/daw';
import { recorderName, recorderNameCapital, recordsInApp } from '../../studio/dawNames';

/** The sentences a failed stop says: plain messages, or with Retry. */
export const LISTENING_STILL_OPEN = 'The Booth could not stop listening, so your microphone may still be open. Quit and reopen the app.';
export const LISTENING_STOP_FAILED = 'The Booth could not stop listening, so your microphone may still be open. Press Retry.';

/** Said when a take that is still recording lost its text-following. */
export const TAKE_UNFOLLOWED = 'The text could not follow your voice for this take. Press Stop, then record again.';

/** Where the narrator is sent to look: the recorder by name, except the app's own, whose name is too long for two lines and which has no window of its own ("the take"). */
const lookIn = (daw: DawKind | undefined): string => (recordsInApp(daw) ? 'the take' : recorderName(daw));

/** Said when a roll the Booth stopped waiting for lands after all. */
export const rollLandedSentence = (daw: DawKind | undefined): string =>
  recordsInApp(daw)
    ? 'A late roll has landed and a take may have been cut. Check the take.'
    : `A late roll has landed, so ${recorderName(daw)} may be recording and a take may have been cut. Check ${recorderName(daw)}.`;

/** Said when the recorder did not answer a roll in time. */
export const rollTimeoutSentence = (daw: DawKind | undefined): string =>
  `${recorderNameCapital(daw)} did not answer the roll. The take may still run; check ${lookIn(daw)}, then roll again.`;

/** Where a passage was recorded is not known, could not be read, or did not come back in time: nothing was started. */
export const NOT_KNOWN = 'Where this passage was recorded is not known, so no take was started.';
export const LOOKUP_FAILED = 'Where this passage was recorded could not be read, so no take started. Choose the phrase again.';
export const LOOKUP_SLOW = 'Where this passage was recorded did not come back in time. No take started; choose the phrase again.';

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
  if (byDaw) return `${name} answers again. The Booth stopped listening; check in ${recorderName(daw)} that it still records.`;
  return `${name} answers again. This window ended the take when it went quiet; check that ${recorderName(daw)} kept it.`;
};

/** What the Booth says when the DAW stopped answering during a take: it did not say the take ended, and may still be recording. */
export const lostInDaw = (daw: DawKind | undefined): string =>
  `${recorderNameCapital(daw)} stopped answering, so the Booth can't tell if the take still runs. Check ${lookIn(daw)}.`;

/** What the Booth says when Stop (or a roll, or a voice change) is pressed on a take the DAW started: the app never stops a take it did not start (#3666). */
export const heldInDawSentence = (daw: DawKind | undefined, what: 'stop it' | 'roll again' | 'change the voice' = 'stop it'): string =>
  `${recorderNameCapital(daw)} started this take, so ${what} in ${recorderName(daw)}.`;

/** What the Booth says when a press inside the start guard is ignored. */
export const START_GUARD_SENTENCE = 'Recording just started. Press Stop again in a moment if you meant to stop.';

/** Said when the DAW refuses a roll and gives no words (or only characters that draw nothing). */
export const ROLL_REFUSED = 'The DAW refused to roll again.';

/** The offer to check a take against the script, with the Check recordings button. */
export const CHECK_OFFER = 'Check this recording against the script?';

/** Said when a start the press had given up on went through after all, or a take began as the Booth was left, and then could not be stopped: the take is still recording in the DAW. */
export const unseenTakeNotStopped = (how: 'late' | 'leaving', why: string, recorder: string): string =>
  `${how === 'late' ? 'A late take' : 'A take started as you left'} could not be stopped: ${why} Stop it in ${recorder}.`;

/** Said when Record did not start because the text could not follow the voice: `reason` is the listening's own, `kept` when the take was kept (nothing is then said to be unrecorded). */
export const listeningFailedSentence = (reason: string, kept: boolean): string =>
  `Recording did not start: ${(reason || 'the text could not follow the voice').replace(/[.\s]+$/, '')}.${kept ? '' : ' Nothing was recorded.'}`;

/** Said once when a restore never got to the host; the host's own sentence for the other case (`soloLeftSentence` in bindings_daw_solo.go, the golden `daw-solo-restore-refused.json`) reads the same. */
export const soloLeftSentence = (dawName: string): string =>
  `${dawName} could not unsolo the chapter's track, so others may stay silent. Unsolo it in ${dawName}.`;
