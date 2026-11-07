import { useId } from 'react';
import { useDawCapabilities } from '../../hooks/useDawCapabilities';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { TooltipTarget } from '../primitives/Tooltip';
import { openCheckRecordings } from './openCheckRecordings';

/** The label every Check recordings control carries (#2833); the dialog it opens is titled the same. */
export const CHECK_RECORDINGS_LABEL = 'Check recordings';

/**
 * The one answer to "can a recording check start now": the DAW's `review` capability, in its own sentence. A read that has not come back, or failed, is said.
 * Every page's entry reads it, so the same DAW state gives the same reason everywhere.
 */
export function useCheckRecordingsGate(): string | undefined {
  const { caps, failed } = useDawCapabilities();
  if (failed) return 'Could not ask the DAW what it can do.';
  if (!caps) return 'Checking what the DAW can do.';
  const review = caps.capabilities.review;
  return review?.available ? undefined : review?.message || `${caps.daw} is not reachable.`;
}

/**
 * The Check recordings button every page mounts (#2833): one label, one gate and one dialog (`openCheckRecordings`), as an icon button where space is
 * limited (the owner's ruling) and a text button where there is room. `chapterIds` are the chapters ticked when the dialog opens; `onClosed` runs
 * once it has gone, for a page that reads what the check changed. `reason` is the caller's own cause to switch it off (every chapter already checked,
 * no chapter to check), after the DAW's.
 */
export function CheckRecordingsButton({
  chapterIds,
  variant = 'text',
  primary = false,
  reason,
  describedBy,
  size,
  onOpen,
  onClosed,
}: {
  chapterIds: readonly string[];
  variant?: 'text' | 'icon';
  /** A text button drawn as the page's main action (the check card before any check has run). */
  primary?: boolean;
  reason?: string;
  describedBy?: string;
  size?: 'sm';
  /** Runs just before the dialog opens: a slide-over the button sits in closes first, so the two never stack. */
  onOpen?: () => void;
  onClosed?: () => void;
}) {
  const reasonId = useId();
  const gate = useCheckRecordingsGate();
  const why = gate ?? reason;
  const open = (): void => {
    if (why) return;
    onOpen?.();
    openCheckRecordings(chapterIds, { onClosed });
  };
  if (variant === 'icon') {
    return (
      <IconButton
        size={size}
        action="checkRecordings"
        label={CHECK_RECORDINGS_LABEL}
        aria-haspopup="dialog"
        disabledReason={why}
        aria-describedby={describedBy}
        onClick={open}
      />
    );
  }
  const button = (
    <Button
      size={size}
      variant={primary ? 'primary' : 'secondary'}
      aria-haspopup="dialog"
      aria-disabled={why ? true : undefined}
      aria-describedby={describedBy ?? (why ? reasonId : undefined)}
      onClick={open}
    >
      {CHECK_RECORDINGS_LABEL}
    </Button>
  );
  // A text button has no hint of its own: its reason is the tooltip and, for a screen reader, its description, not a line of the page (rule 8).
  return why ? (
    <>
      <TooltipTarget text={why}>{button}</TooltipTarget>
      {describedBy ? null : (
        <span id={reasonId} className="sr-only">
          {why}
        </span>
      )}
    </>
  ) : (
    button
  );
}
