import { Button } from '../../primitives/Button';

/**
 * The banner over the script while the DAW is not answering (the Studio Next mock's `#offbanner`): the cause, what still works, and a visible
 * Check again. The page is read-only meanwhile: the slices' edit actions say the same sentence, and playback goes on in the app. Why an edit is
 * off for another reason (a setting) is the notice above the bar, never this banner.
 */
export function DawOffBanner({ sentence, dawName, onRetry }: { sentence: string; dawName: string; onRetry: () => void }) {
  return (
    <div
      id="offbanner"
      role="status"
      className="mx-4 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-card)] border border-[var(--review)] bg-[var(--review-soft)] px-4 py-2.5 text-[0.875rem]"
    >
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <b>{sentence}</b> You can look at takes, findings and effects. Changes wait until {dawName} is running.
      </span>
      <Button variant="secondary" size="sm" id="retry" onClick={onRetry}>
        Check again
      </Button>
    </div>
  );
}
