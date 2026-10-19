/**
 * The take count in a line's gutter (the mock's `.pbadge`): a button that opens the line's takes, so a line with one take has a way in too.
 * Filled on the line the cursor is in.
 */
export function TakeBadge({
  count,
  active,
  open,
  controls,
  onToggle,
}: {
  count: number;
  active: boolean;
  open: boolean;
  controls?: string;
  onToggle: () => void;
}) {
  return (
    // native-control-ok: a 22 px count in the gutter, which Button's padded chrome would not fit
    <button
      type="button"
      data-pbadge
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`${count} ${count === 1 ? 'take' : 'takes'}. Show them`}
      onClick={onToggle}
      className={`inline-flex size-[22px] cursor-pointer items-center justify-center rounded-full border-[1.5px] border-[var(--org)] p-0 font-mono text-xs font-semibold ${
        active ? 'bg-[var(--org)] text-[var(--surface)]' : 'bg-[var(--surface)] text-[var(--org-text)]'
      }`}
    >
      {count}
    </button>
  );
}
