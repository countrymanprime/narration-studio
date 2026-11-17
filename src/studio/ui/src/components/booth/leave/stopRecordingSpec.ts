import type { ConfirmSpec } from '../../../studio/journal/leaveGuard';

/** The cancel label the mock's question uses; the shell's `ConfirmSpec` carries it as `cancelLabel`. */
const KEEP_RECORDING = 'Keep recording';

/** The label of the stop on a question about opening another chapter, and of its refusal's way out. */
export const CHAPTER_STOP_LABEL = 'Stop and open';
export const CHAPTER_OPEN_ANYWAY = 'Open anyway';

/** The second Enter of a double Enter on a jump menu row lands on the question that row raised; it must not answer it (#3349). */
export const IGNORE_ENTER_MS = 400;

/**
 * The question asked when the narrator leaves the Booth while a take records. `dawName` comes from the capability report
 * ("REAPER", "Audacity", "the built-in recorder"), never hard-coded. A recording the app did not start is never stopped
 * so that question says the DAW keeps recording and offers no stop. `destination` is the rail page the move goes to, named in the sentence when there is one. `endUnconfirmed`: the
 * take is over as far as the Booth can tell, but the DAW went quiet before it said so, so the question says it may still be recording and names the page in its title.
 */
export function stopRecordingSpec(dawName: string, startedByApp: boolean, startPending = false, destination?: string, endUnconfirmed = false): ConfirmSpec {
  const subject = dawName.charAt(0).toUpperCase() + dawName.slice(1);
  // Where the move goes, when a page of the rail owns it: "Leaving the Booth for Script ..." (#3529).
  // A destination that is the Booth itself is another chapter of it: the take stops, but the narrator does not leave.
  const leaving = destination === 'Booth' ? 'Opening another chapter' : destination ? `Leaving the Booth for ${destination}` : 'Leaving the Booth';
  // A chapter question opens a chapter: the narrator stays in the Booth, so "Stop and leave" would say the opposite (#3555). Staying hands focus back to the picker the question was asked from.
  const opens = destination === 'Booth';
  const stopLabel = opens ? CHAPTER_STOP_LABEL : 'Stop and leave';
  const returnFocus = opens ? () => document.querySelector<HTMLElement>('[data-chapter-picker]') : undefined;
  if (!startedByApp) {
    return {
      title: 'Leave the Booth?',
      body: `${subject} is recording and keeps recording after you leave. The app did not start this take, so it will not stop it.`,
      confirmLabel: 'Leave',
      cancelLabel: KEEP_RECORDING,
      safeDefault: true,
      ignoreEnterAfterMs: IGNORE_ENTER_MS,
      returnFocus,
    };
  }
  if (startPending) {
    // The DAW has not said it records: the question never claims it does. It closes by itself if the start ends with no take.
    return {
      title: 'Leave while a take is starting?',
      body: `${subject} is starting a take. ${leaving} stops it once it has started.`,
      confirmLabel: stopLabel,
      cancelLabel: 'Stay',
      safeDefault: true,
      ignoreEnterAfterMs: IGNORE_ENTER_MS,
      returnFocus,
    };
  }
  if (endUnconfirmed) {
    // The take ended in the Booth's eyes, but the DAW stopped answering before it said so: the question says only what is known (#3528), so its title does not claim a take is
    // running ("Leave for Script?", where "Stop recording?" would), and the page is named there (#3529's destination) so the body stays as short as it was: no longer than the
    // running question's in a 320 px window, so the dialog does not grow into the toast that says the DAW stopped answering. "Stay" does not claim the take is recording.
    return {
      title: destination === 'Booth' ? 'Open another chapter?' : destination ? `Leave for ${destination}?` : 'Leave the Booth?',
      body: `${subject} may still be recording. ${destination === 'Booth' ? 'Opening another chapter' : 'Leaving'} tries to stop the take.`,
      confirmLabel: stopLabel,
      cancelLabel: 'Stay',
      safeDefault: true,
      ignoreEnterAfterMs: IGNORE_ENTER_MS,
      returnFocus,
    };
  }
  return {
    title: 'Stop recording?',
    body: `${subject} is recording. ${leaving} stops it and saves the take.`,
    confirmLabel: stopLabel,
    cancelLabel: KEEP_RECORDING,
    safeDefault: true,
    ignoreEnterAfterMs: IGNORE_ENTER_MS,
    returnFocus,
  };
}
