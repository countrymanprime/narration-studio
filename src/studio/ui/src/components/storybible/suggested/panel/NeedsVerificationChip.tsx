import { FilterChip } from '../../FilterChip';

/**
 * The "Needs verification · N" filter chip of the Story Bible list. It is drawn only while something waits (N > 0) or while the filter is
 * on, so turning the filter off is always possible; `aria-pressed` says which.
 */
export function NeedsVerificationChip({ count, on, onToggle }: { count: number; on: boolean; onToggle: (on: boolean) => void }) {
  if (!count && !on) return null;
  return <FilterChip label={`Needs verification · ${count}`} on={on} onPress={() => onToggle(!on)} />;
}
