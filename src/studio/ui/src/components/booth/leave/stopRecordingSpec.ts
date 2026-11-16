import type { ConfirmSpec } from '../../../studio/journal/leaveGuard';

/** The cancel label the mock's question uses; the shell's `ConfirmSpec` carries it as `cancelLabel`. */
const KEEP_RECORDING = 'Keep recording';

/** The second Enter of a double Enter on a jump menu row lands on the question that row raised; it must not answer it (#3349). */
export const IGNORE_ENTER_MS = 400;

/**
 * The question asked when the narrator leaves the Booth while a take records. `dawName` comes from the capability report
 * ("REAPER", "Audacity", "the built-in recorder"), never hard-coded. A recording the app did not start is never stopped
 * so that question says the DAW keeps recording and offers no stop. `destination` is the rail page the move goes to, named in the sentence when there is one.
 */
export function stopRecordingSpec(dawName: string, startedByApp: boolean, startPending = false, destination?: string): ConfirmSpec {
  const subject = dawName.charAt(0).toUpperCase() + dawName.slice(1);
  // Where the move goes, when a page of the rail owns it: "Leaving the Booth for Script ..." (#3529).
  // A destination that is the Booth itself is another chapter of it: the take stops, but the narrator does not leave.
  const leaving = destination === 'Booth' ? 'Opening another chapter' : destination ? `Leaving the Booth for ${destination}` : 'Leaving the Booth';
  if (!startedByApp) {
    return {
      title: 'Leave the Booth?',
      body: `${subject} is recording and keeps recording after you leave. The app did not start this take, so it will not stop it.`,
      confirmLabel: 'Leave',
      cancelLabel: KEEP_RECORDING,
      safeDefault: true,
      ignoreEnterAfterMs: IGNORE_ENTER_MS,
    };
  }
  if (startPending) {
    // The DAW has not said it records: the question never claims it does. It closes by itself if the start ends with no take.
    return {
      title: 'Leave while a take is starting?',
      body: `${subject} is starting a take. ${leaving} stops it once it has started.`,
      confirmLabel: 'Stop and leave',
      cancelLabel: 'Stay',
      safeDefault: true,
      ignoreEnterAfterMs: IGNORE_ENTER_MS,
    };
  }
  return {
    title: 'Stop recording?',
    body: `${subject} is recording. ${leaving} stops it.`,
    confirmLabel: 'Stop and leave',
    cancelLabel: KEEP_RECORDING,
    safeDefault: true,
    ignoreEnterAfterMs: IGNORE_ENTER_MS,
  };
}
