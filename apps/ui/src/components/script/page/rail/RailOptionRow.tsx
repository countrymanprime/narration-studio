import type { ReactNode } from 'react';
import { SectionLabel } from '../../../primitives/SectionLabel';

/** One grid for every option row in the rail: the label (or field) takes the free width, the control keeps its own, and both centre on one line 32 px tall. */
const ROW = 'grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3';

/** A rail option: the label on the left, its control right-aligned on the same line, and an optional hint under the label. */
export function RailOptionRow({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div data-rail-row="" className={ROW}>
      <SectionLabel>{label}</SectionLabel>
      <div className="flex items-center justify-end gap-2">{children}</div>
      {hint && <div className="col-span-2 mt-1 text-xs text-[var(--text-muted)]">{hint}</div>}
    </div>
  );
}

/** A rail row whose left cell is a field (a text box) and whose right cell is its action, on the same grid as `RailOptionRow`. */
export function RailFieldRow({ field, action }: { field: ReactNode; action: ReactNode }) {
  return (
    <div data-rail-row="" className={ROW}>
      <div className="min-w-0">{field}</div>
      <div className="flex items-center justify-end gap-2">{action}</div>
    </div>
  );
}
