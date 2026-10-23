import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { ARRIVE_CLASSES } from '../../primitives/changeHighlight';

/**
 * The banner over the page while the DAW cannot be reached (DQ-5: the wording names the DAW the capability reports, never a fixed one).
 * Nothing draws while it is reachable. It never offers the built-in recorder: a project linked to a DAW records there, and switching
 * recorders is a deliberate choice in Settings, behind a confirm (#2251).
 */
export function DawBanner({
  reachable,
  daw,
  onRetry,
  onConnect,
  connecting = false,
  settling = false,
}: {
  reachable: boolean;
  daw: string;
  onRetry: () => void;
  onConnect?: () => void;
  connecting?: boolean;
  settling?: boolean;
}) {
  if (reachable) return null;
  // Just after the app opens the host is still finding the DAW: say so quietly, and only show the failure if it does not connect in time.
  if (settling) {
    return (
      <div
        role="status"
        className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-[0.875rem] text-[var(--text-muted)]"
      >
        Connecting to {daw}…
      </div>
    );
  }
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-card)] border border-[var(--review)] bg-[var(--review-soft)] px-4 py-2.5 text-[0.875rem] ${ARRIVE_CLASSES}`}
    >
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <b>{daw} is not running.</b> Progress that comes from {daw} may be out of date until it is running again.
      </span>
      <IconButton action="retry" label="Retry" onClick={onRetry} />
      {onConnect && (
        <Button variant="secondary" size="sm" onClick={onConnect} disabled={connecting}>
          {connecting ? 'Connecting…' : `Connect ${daw}`}
        </Button>
      )}
    </div>
  );
}
