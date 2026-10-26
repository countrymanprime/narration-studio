import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowDown, faArrowUp, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { GuideProperty } from '../../types';
import { IconButton } from '../primitives/IconButton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { TextField } from '../primitives/TextField';
import { TooltipTarget } from '../primitives/Tooltip';
import { ENTRY_LABEL_COLUMN } from './Relationships';
import { addDraftRow, moveDraftRow, removeDraftRow, updateDraftRow, type DraftProperty } from './propertyDraft';

// The narrator's labelled facts about an entry ("Codename", "Abilities", "Dossier"), in the order they keep. Read view: the saved list as
// text. Edit mode: a row of two fields per property with move and remove buttons, and Add at the foot. The rows are the parent's draft
// (they are saved and cancelled with the rest of the form), so this holds no state of its own.
// Move up, Move down and Remove, 36 px each 4 px apart, and the cell's 10 px each side: the value takes the rest (SBX-9).
const ACTIONS_COLUMN = 'calc(3 * 2.25rem + 2 * 0.25rem + 1.25rem)';

export function PropertiesSection({
  saved,
  rows,
  editing,
  error,
  onChange,
}: {
  saved: GuideProperty[];
  rows: DraftProperty[];
  editing: boolean;
  error?: string;
  onChange: (rows: DraftProperty[]) => void;
}) {
  const shown = editing ? rows : saved;
  return (
    <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
      <div className="mb-2 text-[0.82rem] font-medium text-[var(--text-muted)]">Properties</div>
      {shown.length === 0 ? (
        // No table and no column headers over nothing (R3SB1-9): one muted line, the same in read and edit view.
        <p className="m-0 text-sm text-[var(--text-muted)]">No properties yet.</p>
      ) : (
        <Table label="Properties" textEdges columns={editing ? [ENTRY_LABEL_COLUMN, 'auto', ACTIONS_COLUMN] : [ENTRY_LABEL_COLUMN, 'auto']}>
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Value</TableHeader>
              {editing && <TableHeader hiddenLabel="Actions" />}
            </TableRow>
          </TableHead>
          <TableBody>
            {editing
              ? rows.map((row, index) => <EditRow key={row.id} row={row} index={index} count={rows.length} rows={rows} onChange={onChange} />)
              : saved.map((property) => (
                  <TableRow key={property.key}>
                    <TableCell className="font-medium break-words">{property.key}</TableCell>
                    <TableCell className="break-words whitespace-pre-wrap">{property.value}</TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      )}
      {editing && (
        <>
          {error && (
            <p role="alert" className="mt-2 text-sm text-[var(--danger-text)]">
              {error}
            </p>
          )}
          <div className="mt-3">
            <TooltipTarget text="Add a property">
              <IconButton label="Add property" onClick={() => onChange(addDraftRow(rows))}>
                <FontAwesomeIcon icon={faPlus} />
              </IconButton>
            </TooltipTarget>
          </div>
        </>
      )}
    </div>
  );
}

function EditRow({
  row,
  index,
  count,
  rows,
  onChange,
}: {
  row: DraftProperty;
  index: number;
  count: number;
  rows: DraftProperty[];
  onChange: (rows: DraftProperty[]) => void;
}) {
  const position = index + 1;
  // A row still being named is called by its place, so its buttons have a name.
  const name = row.key.trim() || String(position);
  return (
    <TableRow>
      <TableCell>
        <TextField label={`Property ${position} name`} value={row.key} onChange={(key) => onChange(updateDraftRow(rows, row.id, { key }))} />
      </TableCell>
      <TableCell>
        <TextField label={`Property ${position} value`} value={row.value} onChange={(value) => onChange(updateDraftRow(rows, row.id, { value }))} />
      </TableCell>
      <TableCell align="right">
        <div className="flex justify-end gap-1">
          <IconButton label={`Move property ${name} up`} disabled={index === 0} onClick={() => onChange(moveDraftRow(rows, row.id, -1))}>
            <FontAwesomeIcon icon={faArrowUp} />
          </IconButton>
          <IconButton label={`Move property ${name} down`} disabled={index === count - 1} onClick={() => onChange(moveDraftRow(rows, row.id, 1))}>
            <FontAwesomeIcon icon={faArrowDown} />
          </IconButton>
          <IconButton label={`Remove property ${name}`} onClick={() => onChange(removeDraftRow(rows, row.id))}>
            <FontAwesomeIcon icon={faXmark} />
          </IconButton>
        </div>
      </TableCell>
    </TableRow>
  );
}
