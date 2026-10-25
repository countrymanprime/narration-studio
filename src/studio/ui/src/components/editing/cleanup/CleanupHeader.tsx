import { ToggleGroup } from '../../primitives/ToggleGroup';
import { CLEANUP_OPS, type CleanupKind } from './cleanupOps';

/** The operation filter: each of the five with how many findings pass its thresholds and are not yet done. The chips sit in a grid of
 * three equal columns rather than a ragged wrapping row (alignment audit XED-12); the wrapper's child selector outranks the group's own
 * `flex`. */
export function CleanupHeader({ counts, op, onOp }: { counts: Record<CleanupKind, number>; op: CleanupKind; onOp: (op: CleanupKind) => void }) {
  return (
    <div data-cleanup-kinds="" className="[&>[role=group]]:grid [&>[role=group]]:grid-cols-3 [&>[role=group]]:gap-1.5">
      <ToggleGroup
        label="Kind of finding"
        value={op}
        onChange={(v) => onOp(v as CleanupKind)}
        options={CLEANUP_OPS.map((o) => ({ value: o.kind, label: `${o.label} ${counts[o.kind]}` }))}
      />
    </div>
  );
}
