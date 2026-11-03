import { useState } from 'react';
import { MACRO_NAME_CHARACTERS, macroNameProblem } from '../../api/macroName';
import type { ExportPlan } from '../../types';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { Field } from '../primitives/Field';
import { Panel } from '../primitives/Panel';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { fileName } from './useExportJobs';

// The macro name of this session's last export the host started with one, offered again the next time a row needs a macro: the
// host never keeps one (each render's approval is the narrator's own), but retyping it for every export would be a chore. A name
// the host refused is never kept.
let lastMacro = '';

/**
 * The narrator's approval of one Master & encode with a mastering row that makes their DAW render (`plan.needsApproval`). It draws
 * the host's own plan (ExportPlan): the row, and each file with the DAW region it renders from when the row renders regions, in a
 * list capped to its own scroll. For a row that applies the narrator's effect macro (`plan.needsMacro`) it asks which, and checks
 * the name with the host's rule (macroName.ts) before sending, staying open on a name the host could not run. Approve sends the
 * approval with this one start (the macro only to a row that needs one); nothing keeps it, so the next export asks again. Focus
 * opens on Cancel, the safe answer, so the question stays in view at any height; while the start waits nothing can be pressed.
 */
export function MasteringApprovalDialog({
  plan,
  pending,
  onApprove,
  onCancel,
  returnFocus,
}: {
  plan: ExportPlan;
  pending: boolean;
  /** Sends the approval; answers whether the export started. */
  onApprove: (macro: string) => Promise<boolean>;
  onCancel: () => void;
  returnFocus?: () => HTMLElement | null;
}) {
  const [macro, setMacro] = useState(plan.needsMacro ? lastMacro : '');
  const [problem, setProblem] = useState<string>();
  const regions = plan.items.some((item) => item.region !== '');
  const count = plan.items.length === 1 ? '1 file' : `${plan.items.length} files`;
  const listLabel = regions ? 'Files and the regions they render' : 'Files to master';
  const approve = () => {
    if (!plan.needsMacro) {
      void onApprove('');
      return;
    }
    const name = macro.trim();
    const refusal = macroNameProblem(name);
    if (refusal) {
      setProblem(refusal);
      return;
    }
    void onApprove(name).then((started) => {
      if (started) lastMacro = name;
    });
  };
  return (
    <ConfirmDialog
      title="Approve this render?"
      body={`${plan.label} masters ${count} for this export only.`}
      confirmLabel="Approve and master"
      confirm={approve}
      cancel={onCancel}
      pending={pending}
      focusCancel
      returnFocus={returnFocus}
    >
      <Panel flush scroll label={listLabel} className="mt-2 max-h-[14rem]">
        <Table label={listLabel} columns={regions ? ['minmax(0,1fr)', 'minmax(0,1fr)'] : ['minmax(0,1fr)']}>
          <TableHead>
            <TableRow>
              <TableHeader>File</TableHeader>
              {regions && <TableHeader>Region</TableHeader>}
            </TableRow>
          </TableHead>
          <TableBody>
            {plan.items.map((item) => (
              <TableRow key={item.path}>
                <TableCell className="break-words">{fileName(item.path)}</TableCell>
                {regions && <TableCell className="break-words">{item.region}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
      {plan.needsMacro && (
        <div className="mt-3">
          <Field
            label="Macro"
            value={macro}
            onChange={(value) => {
              setMacro(value);
              setProblem(undefined);
            }}
            disabled={pending}
            // While the name is refused its error says the rule, so the hint, which says it too, steps aside until the name changes.
            hint={problem ? undefined : `Its name as Audacity's Macro Manager lists it: ${MACRO_NAME_CHARACTERS}.`}
            error={problem}
          />
        </div>
      )}
    </ConfirmDialog>
  );
}
