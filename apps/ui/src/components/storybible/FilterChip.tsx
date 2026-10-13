import { Swatch, type SwatchColour } from '../primitives/Swatch';

/** One chip of the filters over the list (the mock's `.chip`): 28 px, fully rounded, filled with the ink when it is on; a kind carries its type's swatch. */
export function FilterChip({ label, swatch, on, onPress }: { label: string; swatch?: SwatchColour; on: boolean; onPress: () => void }) {
  return (
    // native-control-ok: the mock's filter chip is a 28 px pill with a swatch; Pill's 32 px uppercase look and Button's padded chrome do not draw it.
    <button
      type="button"
      aria-pressed={on}
      onClick={onPress}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-sm font-medium ${on ? 'border-[var(--text)] bg-[var(--text)] text-[var(--surface)]' : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
    >
      {swatch && <Swatch colour={swatch} />}
      {label}
    </button>
  );
}
