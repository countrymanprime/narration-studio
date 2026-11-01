import { useEffect, useRef } from 'react';
import type { ExportJob, PackageItemKind } from '../../types';
import { useErrorToast } from '../../hooks/useErrorToast';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { Checkbox } from '../primitives/Checkbox';
import { Panel } from '../primitives/Panel';
import { ProgressBar } from '../primitives/ProgressBar';
import { Select } from '../primitives/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { StatusBadge } from '../primitives/StatusBadge';
import { TextField } from '../primitives/TextField';
import { statusTone, type StatusId } from '../../kinds/statusTone';
import { type ExportJobs, fileName } from './useExportJobs';
import { ARRIVE_CLASSES } from '../primitives/changeHighlight';

const MUTED = { color: 'var(--text-muted)' };
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
 * with its role in the package and, for a chapter, its title, then Master & encode as one job with real progress and Cancel. It
 * appears once files are picked or a job exists; before that the page's header action is the way in.
 */
export function MasterToSpecPanel({ jobs, chainLabel, onCheckFiles }: { jobs: ExportJobs; chainLabel?: string; onCheckFiles?: () => void }) {
  const { items, exportJob, exportRunning, problem } = jobs;
  const started = !!exportJob?.files.length;
  const hasFiles = items.length > 0 || started;
  // A start or pick that failed is a toast; the panel is not opened just to draw it (rule 7, #2632), so it does not appear with nothing in it.
  useErrorToast(problem);
  // A job that ended in error is a toast too, not a red line under the table (rule 7, #2632).
  useErrorToast(exportJob?.phase === 'error' ? exportJob.message : undefined);
  const shown = hasFiles;
  const revealRef = useRef<HTMLDivElement>(null);
  const wasShown = useRef(shown);
  // The panel sits far below the header's "Master all to spec…" button on a 15-file book, so showing it off screen looks like a dead
  // button: bring it into view and put the keyboard on its files. Not on mount: a page that opens with a job running stays where it is.
  useEffect(() => {
    if (shown && !wasShown.current) {
      revealRef.current?.scrollIntoView?.({ block: 'nearest' });
      revealRef.current?.focus();
    }
    wasShown.current = shown;
  }, [shown]);
  if (!shown) return null;
  return (
    <Panel
      title="Master to spec"
      actions={
        // The panel's action sits in its header beside Add files…, where it stays at every width; it used to follow the checkbox's
        // sentence or drop under it as the window changed (R3MS-12).
        !started && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void jobs.pick()} pending={jobs.picking} disabled={exportRunning}>
              Add files…
            </Button>
            {items.length > 0 && <Button onClick={() => void jobs.startExport()}>{jobs.master ? 'Master & encode' : 'Encode'}</Button>}
          </div>
        )
      }
    >
      {(items.length > 0 || started) && (
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
              {(started && exportJob ? exportJob.files : items).map((item) => {
                const result = exportJob?.files.find((file) => file.path === item.path);
                const status = exportRowStatus(result);
                return (
                  <TableRow key={item.path}>
                    <TableCell className="break-words">{fileName(item.path)}</TableCell>
                    <TableCell>
                      {started ? (
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
                      ) : started ? (
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
                        <span className="mt-1 block text-[0.75rem] whitespace-normal" style={DANGER}>
                          {result.error ?? 'unknown reason'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {!started && (
                        <Button variant="secondary" onClick={() => jobs.removeItem(item.path)}>
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
      {items.length > 0 && !started && (
        <div className="mt-3">
          <Checkbox checked={jobs.master} onChange={jobs.setMaster}>
            Master before encoding{chainLabel ? ` with the ${chainLabel.charAt(0).toLowerCase()}${chainLabel.slice(1)}` : ''}, to the platform&apos;s RMS window
            and peak limit
          </Checkbox>
        </div>
      )}
      {exportJob && exportRunning && (
        <div className="mt-3 flex flex-col gap-2">
          <ProgressBar label="Preparing files" value={exportJob.percent} running valueText={`${exportJob.percent}% prepared`} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p aria-live="polite" className="text-sm">
              {exportJob.message}
            </p>
            <Button variant="secondary" onClick={jobs.cancelExport}>
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
    </Panel>
  );
}
