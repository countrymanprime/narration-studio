import type { ConfirmSpec } from '../../../studio/journal/leaveGuard';

/** The cancel label the mock's question uses; the shell's `ConfirmSpec` carries it as `cancelLabel`. */
const KEEP_RECORDING = 'Keep recording';

/**
 * The question asked when the narrator leaves the Booth while a take records. `dawName` comes from the capability report
 * ("REAPER", "Audacity", "the built-in recorder"), never hard-coded. A recording the app did not start is never stopped
 * (ADR 0232), so that question says the DAW keeps recording and offers no stop.
 */
export function stopRecordingSpec(dawName: string, startedByApp: boolean): ConfirmSpec {
  const subject = dawName.charAt(0).toUpperCase() + dawName.slice(1);
  if (!startedByApp) {
    return {
      title: 'Leave the Booth?',
      body: `${subject} is recording and keeps recording after you leave. The app did not start this take, so it will not stop it.`,
      confirmLabel: 'Leave',
      cancelLabel: KEEP_RECORDING,
    };
  }
  return {
    title: 'Stop recording?',
    body: `${subject} is recording. Leaving the Booth stops it.`,
    confirmLabel: 'Stop and leave',
    cancelLabel: KEEP_RECORDING,
  };
}
