import { HeaderChip } from '../primitives/HeaderChip';

/**
 * The quiet mark that stands where the red banner stood: a neutral chip with the condition in a few words, which reopens the dialog that
 * explains it and offers the fix. It never draws more than one line and is not a live region: the dialog is what says it.
 */
export function ConnectionIndicator({ label, onOpen, id }: { label: string; onOpen: () => void; id?: string }) {
  return (
    <span id={id} className="inline-flex flex-none">
      <HeaderChip dot="var(--warn)" onClick={onOpen} title="Show what is wrong and how to fix it" aria-label={`${label}. Show details`}>
        {label}
      </HeaderChip>
    </span>
  );
}
