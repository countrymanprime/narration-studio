/**
 * The take count in a line's gutter, under its time: a round button that opens and folds the line's takes, the pointer's way in beside the chip
 * under the line. It stays out of the Tab order (the chip is the stop) and says what it opens.
 */
export function TakeBadge({
  count,
  open,
  controls,
  active,
  onToggle,
}: {
  count: number;
  open: boolean;
  controls: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    // native-control-ok: a 22 px round count in the gutter; IconButton and Button draw a 28 px or taller square or padded control.
    <button
      type="button"
      data-tbadge
      tabIndex={-1}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`${count} ${count === 1 ? 'take' : 'takes'}. ${open ? 'Fold them' : 'Show them'}`}
      onClick={onToggle}
      className={`inline-flex size-[22px] cursor-pointer items-center justify-center rounded-full border-[1.5px] border-[var(--accent)] p-0 font-mono text-xs font-semibold ${active ? 'bg-[var(--accent)] text-[var(--accent-contrast)]' : 'bg-[var(--surface)] text-[var(--accent-strong)]'}`}
    >
      {count}
    </button>
  );
}
