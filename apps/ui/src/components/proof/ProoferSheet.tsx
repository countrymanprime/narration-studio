import { useEffect, useRef } from 'react';
import { describeApiError } from '../../api/errorMessage';
import { usePort } from '../../ports/usePort';
import { useOverlay } from '../../overlay/OverlayProvider';
import { IconButton } from '../primitives/IconButton';
import { usePickupsState } from '../pickups/usePickupsState';

// Triggers a browser "Save As" for the proofer's sheet without a native file dialog: the WebView2 host handles a download the way a
// browser does.
function downloadCSV(csv: string, name: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** "2 pickups", "1 pickup". */
const pickups = (n: number) => `${n} ${n === 1 ? 'pickup' : 'pickups'}`;

/** The rows of the exported CSV, its header not counted. */
const exportedRows = (csv: string) => csv.split(/\r?\n/).filter((line) => line.trim() !== '').length - 1;

/** What the finished import says: how many pickups it added, how many were there already and how many rows were skipped. */
export function importedMessage(report: { added: number; existing: number; invalid: number }, skippedRows: number): string {
  const parts = [`Added ${pickups(report.added)} from the proofer’s sheet`];
  if (report.existing > 0) parts.push(`${report.existing} ${report.existing === 1 ? 'was' : 'were'} there already`);
  const skipped = skippedRows + report.invalid;
  if (skipped > 0) parts.push(`${skipped} ${skipped === 1 ? 'row was' : 'rows were'} skipped`);
  return parts.join('; ') + '.';
}

/**
 * The Proof queue's "Import proofer sheet" and "Export for proofer" icons (Studio Next mock `#imp`, `#exp`). The mock's icons only
 * toast; the owner kept the real proofer CSV (#992, "all defaults"), so they run `pickupsImport` and `pickupsExport`. A pickup lands
 * as a DAW marker, so both need the DAW, and the host's refusal is the toast. The run finishes on the pickups event, so the toast
 * with the count (and the download) waits for the run this control started, never for one another page started or one already
 * finished when the page opened.
 */
export function ProoferSheet() {
  const port = usePort('pickups');
  const state = usePickupsState();
  const overlay = useOverlay();
  const fileInput = useRef<HTMLInputElement>(null);
  const awaiting = useRef<{ run: 'import' | 'export'; skippedRows: number; runId?: string } | null>(null);

  useEffect(() => {
    const run = awaiting.current;
    if (!run) return;
    // The host names each run; a count or another page's run that settles meanwhile is not this one.
    if (state.phase === (run.run === 'import' ? 'importing' : 'exporting')) {
      run.runId = state.runId;
      return;
    }
    if (run.runId === undefined || state.runId !== run.runId) return;
    if (state.phase === 'error') {
      awaiting.current = null;
      overlay.toast(state.message, { tone: 'error' });
    } else if (state.phase === 'success' && run.run === 'import' && state.importReport) {
      awaiting.current = null;
      overlay.toast(importedMessage(state.importReport, run.skippedRows));
    } else if (state.phase === 'success' && run.run === 'export') {
      awaiting.current = null;
      downloadCSV(state.csv, 'pickups-for-proofer.csv');
      overlay.toast(`Exported ${pickups(exportedRows(state.csv))} for the proofer.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per state the host sends, not when the overlay changes
  }, [state]);

  const importSheet = async (file: File) => {
    try {
      awaiting.current = { run: 'import', skippedRows: 0 };
      const result = await port.pickupsImport(await file.text());
      if (awaiting.current?.run === 'import') awaiting.current.skippedRows = result.rowErrors.length;
    } catch (error) {
      awaiting.current = null;
      overlay.toast(describeApiError(error), { tone: 'error' });
    }
  };
  const exportSheet = async () => {
    try {
      awaiting.current = { run: 'export', skippedRows: 0 };
      await port.pickupsExport();
    } catch (error) {
      awaiting.current = null;
      overlay.toast(describeApiError(error), { tone: 'error' });
    }
  };

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void importSheet(file);
        }}
      />
      <IconButton action="import" label="Import proofer sheet" onClick={() => fileInput.current?.click()} />
      <IconButton action="export" label="Export for proofer" onClick={() => void exportSheet()} />
    </>
  );
}
