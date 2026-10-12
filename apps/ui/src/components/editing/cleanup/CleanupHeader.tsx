import { ToggleGroup } from '../../primitives/ToggleGroup';
import { CLEANUP_OPS, type CleanupKind } from './cleanupOps';

/** The operation filter: each of the five with how many findings pass its thresholds and are not yet done. */
export function CleanupHeader({ counts, op, onOp }: { counts: Record<CleanupKind, number>; op: CleanupKind; onOp: (op: CleanupKind) => void }) {
  return (
    <ToggleGroup
      label="Kind of finding"
      value={op}
      onChange={(v) => onOp(v as CleanupKind)}
      options={CLEANUP_OPS.map((o) => ({ value: o.kind, label: `${o.label} ${counts[o.kind]}` }))}
      className="flex-wrap gap-1.5"
    />
  );
}
