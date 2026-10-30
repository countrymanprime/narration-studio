import { useDawState } from './useDawSession';

/**
 * Whether the DAW is recording, from the app's one DAW session (`daw_transport_changed`). The one reader every screen asks (docs/research/ui-function-audit.md,
 * cluster 9); the Booth adds its own just-started take to it, it does not replace it. A session not yet heard from answers false.
 */
export function useIsRecording(): boolean {
  return useDawState((state) => state.transport.recording);
}
