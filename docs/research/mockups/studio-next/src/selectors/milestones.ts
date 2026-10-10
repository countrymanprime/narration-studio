/** How a milestone's measure is offered and written. */
import type { BookData } from '@/domain/schemas'
import { platformHas } from './platform'
import { CHECKPOINT_SCOPE, MEASURES, measOf, minutesOf, nOf } from './progress'

/** The measures the project's delivery profile offers, plus the one the milestone already has (a stored value is always an option). */
export function measureOptions(b: Pick<BookData, 'deliveryProfile'>, current?: string): Array<{ value: string; label: string }> {
  return MEASURES
    .filter((m) => !m.needs || platformHas(b, m.needs) || m.id === current)
    .map((m) => ({ value: m.id, label: m.label }))
}

/** The measure as the narrator chose it, with its value filled in: "First 15 finished minutes", "First 4 chapters edited and proofed", "Whole book". */
export function measureText(scope: string | undefined): string {
  const m = measOf(scope)
  if (m === 'chN') return 'First ' + nOf(scope) + ' chapters edited and proofed'
  if (m === 'minN' || scope === CHECKPOINT_SCOPE) return 'First ' + minutesOf(scope) + ' finished minutes'
  if (m === 'custom') return 'Custom'
  return MEASURES.find((x) => x.id === m)?.label ?? m
}
