import type { ConfirmSpec } from '../../../studio/journal/leaveGuard';

/**
 * The question before the DAW replaces audio, as the mock words it. The take is held while it is open, so the cancel is
 * "Keep recording" while a take runs and "Cancel" before one (a punch-in at the start). `dawName` is read from the capability
 * report. The overlay's confirm focuses Cancel, the safe answer, and names itself by `title`.
 */
export function rollConfirmSpec({
  title,
  confirmLabel,
  dawName,
  recording,
}: {
  title: string;
  confirmLabel: string;
  dawName: string;
  recording: boolean;
}): ConfirmSpec {
  const subject = dawName.charAt(0).toUpperCase() + dawName.slice(1);
  return {
    title,
    confirmLabel,
    cancelLabel: recording ? 'Keep recording' : 'Cancel',
    body: `${subject} will record over the audio from here, and what it replaces is not kept as a take.`,
  };
}
