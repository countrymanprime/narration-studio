import { useState } from 'react';
import type { MasteringProvider } from '../../api/contracts/mastering';
import type { ExportItem } from '../../types';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { Field } from '../primitives/Field';
import { fileName } from './useExportJobs';

// The macro named in this session's last approval, offered again the next time: the host never keeps one (each render's approval
// is the narrator's own), but retyping the same name for every export would be a chore.
let lastMacro = '';

/** What a row that renders a region from the DAW renders for an item: the region named for a chapter's title or for the credits
 * (export_job.go's exportRegion); a retail sample has none. */
function regionOf(item: ExportItem): string | undefined {
  switch (item.kind) {
    case 'chapter':
      return item.title;
    case 'credits_opening':
      return 'Opening credits';
    case 'credits_closing':
      return 'Closing credits';
    default:
      return undefined;
  }
}

/**
 * The narrator's approval of one Master & encode with a mastering row that makes their DAW render (`needsApproval`): it names the
 * row and what it will master, and, for a row that applies their own effect macro (`needsMacro`), asks which. Approve sends the
 * approval with this one start and nothing keeps it, so the next export asks again. While the start waits, nothing in the dialog
 * can be pressed (`pending`); the panel closes it when the host answers or the wait runs out.
 */
export function MasteringApprovalDialog({
  row,
  items,
  pending,
  onApprove,
  onCancel,
  returnFocus,
}: {
  row: MasteringProvider;
  items: ExportItem[];
  pending: boolean;
  onApprove: (macro: string) => void;
  onCancel: () => void;
  returnFocus?: () => HTMLElement | null;
}) {
  const [macro, setMacro] = useState(lastMacro);
  const [missing, setMissing] = useState(false);
  const fromRegions = row.modes.includes('daw_region') && !row.modes.includes('wav');
  const count = items.length === 1 ? '1 file' : `${items.length} files`;
  const approve = () => {
    const name = macro.trim();
    if (row.needsMacro && name === '') {
      setMissing(true);
      return;
    }
    lastMacro = name;
    onApprove(name);
  };
  return (
    <ConfirmDialog
      title={`Master with ${row.label}?`}
      body={`${row.label} masters ${count} for this export only.`}
      confirmLabel="Approve and master"
      confirm={approve}
      cancel={onCancel}
      pending={pending}
      returnFocus={returnFocus}
    >
      {/* The dialog's body scrolls when the list is long (it is never taller than the window), so the list has no scroll of its own. */}
      <ul aria-label={fromRegions ? 'Regions to render' : 'Files to master'} className="mt-1 text-sm">
        {items.map((item) => {
          const region = fromRegions ? regionOf(item) : undefined;
          return (
            <li key={item.path} className="py-0.5 break-words">
              {fromRegions ? (region ?? `${fileName(item.path)} (no region, so it fails)`) : fileName(item.path)}
            </li>
          );
        })}
      </ul>
      {row.needsMacro && (
        <div className="mt-3">
          <Field
            label="Macro"
            value={macro}
            onChange={(value) => {
              setMacro(value);
              setMissing(false);
            }}
            autoFocus
            disabled={pending}
            error={missing ? 'Name the macro to apply.' : undefined}
          />
        </div>
      )}
    </ConfirmDialog>
  );
}
