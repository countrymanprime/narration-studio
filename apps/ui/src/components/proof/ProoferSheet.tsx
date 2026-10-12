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

/**
 * The Proof queue's "Import proofer sheet" and "Export for proofer" icons (Studio Next mock `#imp`, `#exp`). The mock's icons only
 * toast; the owner kept the real proofer CSV (#992, "all defaults"), so they run `pickupsImport` and `pickupsExport`. A pickup lands
 * as a DAW marker, so both need the DAW, and the host's refusal is the toast.
 */
export function ProoferSheet() {
  const pickups = usePort('pickups');
  const state = usePickupsState();
  const overlay = useOverlay();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.phase === 'success' && state.csv) downloadCSV(state.csv, 'pickups-for-proofer.csv');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per completed export (a fresh runId), not on every render
  }, [state.runId, state.csv]);

  const importSheet = async (file: File) => {
    try {
      const result = await pickups.pickupsImport(await file.text());
      const skipped = result.rowErrors.length;
      overlay.toast(
        skipped === 0 ? 'Imported the proofer’s sheet.' : `Imported the proofer’s sheet; ${skipped} ${skipped === 1 ? 'row was' : 'rows were'} skipped.`,
      );
    } catch (error) {
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
      <IconButton
        action="export"
        label="Export for proofer"
        onClick={() => pickups.pickupsExport().catch((error: unknown) => overlay.toast(describeApiError(error), { tone: 'error' }))}
      />
    </>
  );
}
