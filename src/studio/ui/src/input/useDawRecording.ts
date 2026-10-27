import { useCallback, useRef } from 'react';
import { useDawSession } from '../daw/useDawSession';

/**
 * The DAW's live recording state, from the app's DAW session (`daw_transport_changed`), for `<CommandRouter isRecording>`. Returns a stable
 * function that reads the session at call time: the router only calls it from inside a gesture handler, so a recording change need not
 * re-render anything mounted under it. A session with no live heartbeat yet answers `false` (not recording) rather than assuming the worst.
 */
export function useDawRecording(): () => boolean {
  const session = useDawSession();
  const ref = useRef(session);
  ref.current = session;
  return useCallback(() => ref.current.getState().transport.recording, []);
}
