import { useState } from 'react';
import type { MarkType } from '../../../api/contracts/marks';
import { useMarks } from '../../script/page/data/useScriptData';
import { MarksDialog } from '../../script/page/tools/select/MarksDialog';
import { markSwatch } from '../../script/page/rail/threads/markSwatch';
import { useSaveMarkTypes } from '../../script/scriptPageHost';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import { StatusBadge } from '../../primitives/StatusBadge';
import { Swatch } from '../../primitives/Swatch';

export type MarksViewProps = {
  /** The host's mark types, in order; absent while they are read. */
  types?: readonly MarkType[];
  /** A failed read, in the host's words. */
  error?: string;
  onEdit: () => void;
};

/** The mock's "Marks" panel: a pill per mark type with its swatch, "tracks a reply" where the type asks, and the Edit marks button. Takes props only. */
export function MarksView({ types, error, onEdit }: MarksViewProps) {
  return (
    <Panel title="Marks" actions={<IconButton action="edit" label="Edit marks…" disabled={!types} onClick={onEdit} />}>
      {types && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {types.map((type) => (
            <li key={type.key}>
              <StatusBadge tone="neutral" icon={<Swatch colour={markSwatch(type.colour)} />} label={type.asks ? `${type.name} · tracks a reply` : type.name} />
            </li>
          ))}
        </ul>
      )}
      {!types && !error && <p className="m-0 text-sm text-[var(--text-muted)]">Reading the mark types…</p>}
      {error && (
        <p role="alert" className="m-0 text-sm text-[var(--danger-text)]">
          {error}
        </p>
      )}
    </Panel>
  );
}

/**
 * Settings > Marks (SN-M95): the narrator's mark types as the host has them (the Script page's read), and Edit marks, which opens the
 * Script page's Define marks dialog over them. The dialog saves each change at once and the list here redraws from the same read.
 */
export function MarksPanel() {
  const marks = useMarks();
  const [editing, setEditing] = useState(false);
  const saveMarkTypes = useSaveMarkTypes(marks.retry);
  return (
    <>
      <MarksView
        types={marks.value ? marks.types : undefined}
        error={marks.status === 'error' ? `The mark types could not be read: ${marks.message}` : undefined}
        onEdit={() => setEditing(true)}
      />
      {editing && <MarksDialog saveMarkTypes={saveMarkTypes} onClose={() => setEditing(false)} />}
    </>
  );
}
