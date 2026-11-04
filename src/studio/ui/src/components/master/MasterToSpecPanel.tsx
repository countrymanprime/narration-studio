import { useEffect, useRef, useState } from 'react';
import type { MasteringProvider } from '../../api/contracts/mastering';
import type { ExportJob, ExportPlan, MasteringApproval, PackageItemKind } from '../../types';
import { useErrorToast } from '../../hooks/useErrorToast';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { Checkbox } from '../primitives/Checkbox';
import { HelpButton } from '../primitives/HelpButton';
import { Panel } from '../primitives/Panel';
import { ProgressBar } from '../primitives/ProgressBar';
import { Select } from '../primitives/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { StatusBadge } from '../primitives/StatusBadge';
import { TextField } from '../primitives/TextField';
import { statusTone, type StatusId } from '../../kinds/statusTone';
import { type ExportJobs, fileName } from './useExportJobs';
import { ARRIVE_CLASSES } from '../primitives/changeHighlight';
import { MasteringApprovalDialog } from './MasteringApprovalDialog';

const MUTED = { color: 'var(--text-muted)' };

/** Whether the keyboard has fallen to the page: what a control that takes itself away must not leave behind. */
const onBody = (): boolean => document.activeElement === null || document.activeElement === document.body;
const DANGER = { color: 'var(--danger-text)' };

const KIND_OPTIONS: { value: PackageItemKind; label: string }[] = [
  { value: 'chapter', label: 'Chapter' },
  { value: 'credits_opening', label: 'Opening credits' },
  { value: 'credits_closing', label: 'Closing credits' },
  { value: 'retail_sample', label: 'Retail sample' },
];

/** A row's status as the page's other tables draw one, a pill (R3MS-13): its words and the registry status that colours it. */
function exportRowStatus(file: ExportJob['files'][number] | undefined): { label: string; status: StatusId } {
  switch (file?.status) {
    case undefined:
      return { label: 'Not started', status: 'not_started' };
    case 'pending':
      return { label: 'Waiting', status: 'waiting' };
    case 'mastering':
      return { label: 'Mastering…', status: 'in_progress' };
    case 'encoding':
      return { label: 'Encoding…', status: 'in_progress' };
    case 'done':
      return { label: 'Ready', status: 'ready' };
    case 'failed':
      return { label: 'Failed', status: 'failed' };
    case 'cancelled':
      return { label: 'Cancelled', status: 'not_started' };
  }
}

// Fixed columns (`Table columns`): the file name takes the rest, the Role select and the Title box keep a width a control can be read at
// (the Title box was 35 px wide at 390, XMS-1), and the status pill and Remove keep theirs, so nothing moves between picking and running
// (XMS-8). Under the floor the table scrolls in its box.
const COLUMNS = ['auto', '10rem', '11rem', '8rem', '6.5rem'];
const TABLE_FLOOR = 'min-w-[44rem]';

/**
 * The files "Master all to spec…" picked: each
 * with its role in the package and, for a chapter, its title, then Master & encode as one job with real progress and Cancel. It is
 * always on the page: before any file is picked its own primary, a labelled text button, picks them (#2931); the page header's icon
 * is the secondary way in. `chain` is the mastering row
 * the host says the project masters with: when it makes the DAW render (`needsApproval`), Master & encode first asks the narrator's
 * approval for this one export. A refusal of the start may mean the row changed, so `onStartRefused` reads the rows again.
 */
export function MasterToSpecPanel({
  jobs,
  chain,
  onStartRefused,
  onCheckFiles,
}: {
  jobs: ExportJobs;
  chain?: MasteringProvider;
  onStartRefused?: () => void;
  onCheckFiles?: () => void;
}) {
  const { items, exportJob, exportRunning, problem } = jobs;
  const chainLabel = chain?.label;
  // The plan the open approval dialog shows: the host's answer when it opened, so a later read cannot change what the narrator approves.
  const [approving, setApproving] = useState<ExportPlan>();
  // While a job runs the table is its own files, read-only. Once it ends, finished, cancelled or failed, the picked files are editable
  // again with Add files…, the checkbox and Master & encode (#2935); the job the page opened on gives its files to an empty list
  // (useExportJobs), so a last run is dismissed by removing its rows, and the card is back to its own "Choose files…" (#2931).
  const showsJob = exportRunning && !!exportJob?.files.length;
  // From the press of Master & encode until the host answers, the rows are locked too: the job runs on the files as they were then.
  const locked = showsJob || jobs.starting;
  const hasFiles = items.length > 0 || showsJob;
  const masterRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  // What gets the keyboard after the render that follows a Remove: the next row's Remove, or the one before, or the card's own button.
  const afterRemove = useRef<string | 'emptied'>(undefined);
  // A start or pick that failed is a toast, never a line in the card (rule 7, #2632).
  useErrorToast(problem);
  // A job that ended in error is a toast too, not a red line under the table (rule 7, #2632).
  useErrorToast(exportJob?.phase === 'error' ? exportJob.message : undefined);
  const revealRef = useRef<HTMLDivElement>(null);
  const hadFiles = useRef(hasFiles);
  // The table sits far below the header's "Master all to spec…" icon on a 15-file book, so drawing it off screen looks like a dead
  // button; and the card's own "Choose files…" button goes away once files are picked. Either way, bring the table into view and put
  // the keyboard on its files. Not on mount: a page that opens with a job running stays where it is.
  // The other way, Remove on the last row takes itself and the table away: the card's own button gets the keyboard back, not <body>.
  const chooseRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (hasFiles && !hadFiles.current) {
      revealRef.current?.scrollIntoView?.({ block: 'nearest' });
      revealRef.current?.focus();
    }
    // Lost means anywhere but this card: <body>, a node that went with the table, or the page a second click landed on (qa on #2988).
    const active = document.activeElement;
    const card = chooseRef.current?.closest('section');
    const lost = active === null || !active.isConnected || !card?.contains(active);
    if (!hasFiles && hadFiles.current && lost) chooseRef.current?.focus();
    hadFiles.current = hasFiles;
  }, [hasFiles]);
  // A run that ends takes Cancel away with it, whether it was pressed or the run finished: the keyboard goes to Master & encode (or Add
  // files… when nothing is picked), never to the page's <body> (#2935 review).
  const wasRunning = useRef(exportRunning);
  useEffect(() => {
    const ended = wasRunning.current && !exportRunning;
    wasRunning.current = exportRunning;
    if (ended && onBody()) (masterRef.current ?? addRef.current ?? chooseRef.current)?.focus();
  }, [exportRunning]);
  useEffect(() => {
    const target = afterRemove.current;
    if (target === undefined) return;
    afterRemove.current = undefined;
    // The last Remove leaves the card with its own "Choose files…" button, which takes the keyboard (#2931; #2935's review).
    if (target === 'emptied') chooseRef.current?.focus();
    else removeRefs.current.get(target)?.focus();
  });
  const remove = (path: string, rows: readonly { path: string }[]) => {
    const at = rows.findIndex((row) => row.path === path);
    afterRemove.current = rows[at + 1]?.path ?? rows[at - 1]?.path ?? 'emptied';
    jobs.removeItem(path);
  };
  // Starting removes Master & encode (the table shows the job instead): focus goes to the files, never to the page's <body>.
  const focusFiles = () => revealRef.current;
  // Answers whether the export started, so the dialog keeps a macro name only once the host took it.
  const start = (approval: MasteringApproval | null): Promise<boolean> =>
    jobs.startExport(approval).then((outcome) => {
      if (outcome === 'busy') return false;
      setApproving(undefined);
      if (outcome === 'refused') onStartRefused?.();
      if (outcome === 'started' && onBody()) focusFiles()?.focus();
      return outcome === 'started';
    });
  // With mastering on, the host says first what it would do (ExportPlan): a request it would refuse is refused here, before any
  // dialog, and a row that needs the narrator's approval opens the dialog over exactly the plan the host answered.
  const masterAndEncode = () => {
    if (!jobs.master) {
      void start(null);
      return;
    }
    void jobs.planExport().then(({ outcome, plan }) => {
      if (outcome === 'refused') onStartRefused?.();
      if (outcome !== 'started' || !plan) return;
      if (plan.needsApproval) setApproving(plan);
      else void start(null);
    });
  };
  const masterCheckbox = (
    <div className={`flex items-center gap-2 ${hasFiles ? 'mt-3' : ''}`}>
      <Checkbox checked={jobs.master} onChange={jobs.setMaster} disabled={jobs.starting}>
        {/* The row's own label, as the host words it: lowercasing it made "the your DAW's FX chain" (#2879's review). */}
        Master before encoding{chainLabel ? `: ${chainLabel}` : ''}
      </Checkbox>
      <HelpButton label="About mastering before encoding">
        Mastering brings each file to the platform&apos;s RMS window and peak limit before it is encoded.
      </HelpButton>
    </div>
  );
  const rows = showsJob && exportJob ? exportJob.files : items;
  return (
    <Panel
      title="Master to spec"
      actions={
        // Before any file is picked, the card's primary is a labelled text button that picks them: the owner's rule is primary = text,
        // and the page header's icon stays the secondary way in (#2931). It names what it does, so it is not a second "Master all to spec…".
        !hasFiles ? (
          <Button ref={chooseRef} onClick={() => void jobs.pick()} pending={jobs.picking}>
            {jobs.master ? 'Choose files to master…' : 'Choose files to encode…'}
          </Button>
        ) : (
          // The panel's action sits in its header beside Add files…, where it stays at every width; it used to follow the checkbox's
          // sentence or drop under it as the window changed (R3MS-12).
          !showsJob && (
            <div className="flex flex-wrap gap-2">
              <Button ref={addRef} variant="secondary" onClick={() => void jobs.pick()} pending={jobs.picking} disabled={jobs.starting}>
                Add files…
              </Button>
              {items.length > 0 && (
                <Button ref={masterRef} onClick={masterAndEncode} pending={jobs.starting && !approving}>
                  {jobs.master ? 'Master & encode' : 'Encode'}
                </Button>
              )}
            </div>
          )
        )
      }
    >
      {hasFiles && (
        <div
          ref={revealRef}
          tabIndex={0}
          // Run to the card's edges, so the table's text starts at the card's inset and Remove ends where Add files… does (XMS-8, R3MS-13).
          className={`scroll-x-edges -mx-4 overflow-x-auto [--panel-pad:0px] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none focus-visible:ring-inset`}
        >
          <Table label="Files to export" columns={COLUMNS} className={TABLE_FLOOR}>
            <TableHead>
              <TableRow>
                <TableHeader>File</TableHeader>
                <TableHeader>Role</TableHeader>
                <TableHeader>Title</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader hiddenLabel="Remove" />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((item) => {
                // A running job's row is its own result; otherwise the last job's, unless the row was removed or is starting again.
                const result = showsJob ? exportJob?.files.find((file) => file.path === item.path) : jobs.resultFor(item.path);
                const status = exportRowStatus(result);
                return (
                  <TableRow key={item.path}>
                    <TableCell className="break-words">{fileName(item.path)}</TableCell>
                    <TableCell>
                      {locked ? (
                        KIND_OPTIONS.find((option) => option.value === item.kind)?.label
                      ) : (
                        <Select
                          label={`Role for ${fileName(item.path)}`}
                          value={item.kind}
                          onChange={(value) => jobs.updateItem(item.path, { kind: value as PackageItemKind })}
                          options={KIND_OPTIONS}
                        />
                      )}
                    </TableCell>
                    <TableCell className="break-words">
                      {item.kind !== 'chapter' ? (
                        // Only a chapter takes a title; the others say so rather than leave a gap in the column.
                        <span style={MUTED}>
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">No title for this role</span>
                        </span>
                      ) : locked ? (
                        item.title
                      ) : (
                        <TextField
                          label={`Title for ${fileName(item.path)}`}
                          value={item.title}
                          onChange={(value) => jobs.updateItem(item.path, { title: value })}
                        />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <StatusBadge tone={statusTone(status.status)} label={status.label} />
                      {result?.status === 'failed' && (
                        // A reason with no spaces (a long path) breaks anywhere rather than run past the column (#2935 review).
                        <span className="mt-1 block text-[0.75rem] [overflow-wrap:anywhere] whitespace-normal" style={DANGER}>
                          {result.error ?? 'unknown reason'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {!locked && (
                        <Button
                          ref={(button) => {
                            if (button) removeRefs.current.set(item.path, button);
                            else removeRefs.current.delete(item.path);
                          }}
                          variant="secondary"
                          onClick={() => remove(item.path, rows)}
                        >
                          Remove
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {/* With nothing picked the checkbox is the card's body: the one choice that applies before picking. */}
      {(!hasFiles || (items.length > 0 && !showsJob)) && masterCheckbox}
      {exportJob && exportRunning && (
        <div className="mt-3 flex flex-col gap-2">
          <ProgressBar label="Preparing files" value={exportJob.percent} running valueText={`${exportJob.percent}% prepared`} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p aria-live="polite" className="text-sm">
              {exportJob.message}
            </p>
            <Button variant="secondary" onClick={jobs.cancelExport} pending={jobs.cancelling}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {exportJob && !exportRunning && exportJob.phase !== 'idle' && exportJob.phase !== 'error' && (
        <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 ${ARRIVE_CLASSES}`}>
          <p aria-live="polite" className="min-w-0 flex-[1_1_20rem] text-sm">
            {exportJob.message}
          </p>
          {exportJob.phase === 'success' && onCheckFiles && (
            // The export writes new copies and measures nothing, so Delivery and the table above still go by the files that were checked (issue 2631): the tooltip says so.
            <IconButton action="checkPreparedFiles" onClick={onCheckFiles} />
          )}
        </div>
      )}
      {approving && (
        <MasteringApprovalDialog
          plan={approving}
          pending={jobs.starting}
          // The approval binds the chain the dialog showed: its digest, as the plan answered it (#2932's review).
          onApprove={(macro) => start({ provider: approving.provider, macro, ...(approving.chainDigest ? { chainDigest: approving.chainDigest } : {}) })}
          onCancel={() => setApproving(undefined)}
          returnFocus={focusFiles}
        />
      )}
    </Panel>
  );
}
