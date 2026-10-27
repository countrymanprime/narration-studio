import { useDawState } from '../../daw/useDawSession';

/**
 * Whether the Booth is showing *and* the DAW reports recording: the
 * toast dispatcher's guard for the no-sound, no-notification rule. `boothShowing` is App.tsx's own
 * reading of the route (the Booth is a page, so the route says
 * whether it shows). Reactive, unlike `useDawRecording`, which reads its own
 * transport subscription into a ref for a gesture-time check only - this hook's caller needs to notice the moment either
 * half clears, to release whatever toast it queued while this was true.
 */
export function useBoothRecording(boothShowing: boolean): boolean {
  const recording = useDawState((state) => state.transport.recording);
  return boothShowing && recording;
}
