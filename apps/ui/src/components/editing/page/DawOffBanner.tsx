import { IconButton } from '../../primitives/IconButton';

/**
 * The banner over the script while the DAW is not answering (the Studio Next mock's `#offbanner`): the capability's own sentence, what still
 * works, and Retry. The page is read-only meanwhile: the slices' edit actions say the same sentence, and playback goes on in the app.
 */
export function DawOffBanner({ sentence, onRetry }: { sentence: string; onRetry: () => void }) {
  return (
    <div
      id="offbanner"
      role="status"
      className="mx-4 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-card)] border border-[var(--review)] bg-[var(--review-soft)] px-4 py-2.5 text-[0.875rem]"
    >
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <b>{sentence}</b> You can look at takes, findings and effects and play the chapter. Changes wait until the DAW answers.
      </span>
      <IconButton action="retry" label="Retry" id="retry" onClick={onRetry} />
    </div>
  );
}
