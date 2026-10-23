import { ConnectionIndicator } from '../../connection/ConnectionIndicator';

/**
 * The quiet mark over the page while the DAW cannot be reached (DQ-5: the wording names the DAW the capability reports, never a fixed one). It
 * reopens the connect dialog; nothing draws while the DAW is reachable. Just after the app opens the host is still finding the DAW, so the mark
 * says it is connecting and becomes the not-connected one only if the connection did not come in time.
 */
export function DawIndicator({ daw, settling = false, onOpen }: { daw: string; settling?: boolean; onOpen: () => void }) {
  if (settling) {
    return (
      <p role="status" className="m-0 text-[0.875rem] text-[var(--text-muted)]">
        Connecting to {daw}…
      </p>
    );
  }
  return <ConnectionIndicator label={`${daw} not connected`} onOpen={onOpen} />;
}
