import { Swatch, type SwatchColour } from '../primitives/Swatch';

/**
 * One chip of the filters over the table (the mock's `.chip`): 28 px, fully rounded, filled with the ink when it is on; a kind carries its type's
 * swatch and, when it is given, how many entries it stands for.
 */
export function FilterChip({ label, swatch, count, on, onPress }: { label: string; swatch?: SwatchColour; count?: number; on: boolean; onPress: () => void }) {
  return (
    // native-control-ok: the mock's filter chip is a 28 px pill with a swatch; Pill's 32 px uppercase look and Button's padded chrome do not draw it.
    <button
      type="button"
      aria-pressed={on}
      onClick={onPress}
      className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap ${on ? 'border-[var(--text)] bg-[var(--text)] text-[var(--surface)]' : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
    >
      {swatch && <Swatch colour={swatch} />}
      {label}
      {count !== undefined && <span className="font-normal tabular-nums opacity-80">{count}</span>}
    </button>
  );
}
