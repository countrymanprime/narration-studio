import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';

/**
 * The banner over the page while the DAW cannot be reached (DQ-5: the wording names the DAW the capability reports, never a fixed one).
 * Nothing draws while it is reachable.
 */
export function DawBanner({ reachable, daw, onRetry, onUseBuiltIn }: { reachable: boolean; daw: string; onRetry: () => void; onUseBuiltIn: () => void }) {
  if (reachable) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-card)] border border-[var(--review)] bg-[var(--review-soft)] px-4 py-2.5 text-[0.875rem]"
    >
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <b>{daw} is not running.</b> Progress that comes from {daw} may be out of date until it is running again.
      </span>
      <IconButton action="retry" label="Retry" onClick={onRetry} />
      <Button variant="ghost" size="sm" onClick={onUseBuiltIn}>
        Use built-in recorder
      </Button>
    </div>
  );
}
