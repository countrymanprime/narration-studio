import { useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import type { DiagnosticsPreview } from '../../../api/contracts/system';
import { useOverlay } from '../../../overlay/OverlayProvider';
import { usePort } from '../../../ports/usePort';
import { Dialog } from '../../primitives/Dialog';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import { SectionLabel } from '../../primitives/SectionLabel';
import { ABOUT_ROW } from './aboutRow';
import { plural } from '../../../plural';

// Copies text to the clipboard; false when there is no clipboard or it refuses, so the toast still says where the file is.
const copyText = async (text: string): Promise<boolean> => {
  if (!navigator.clipboard) return false;
  return navigator.clipboard.writeText(text).then(
    () => true,
    () => false,
  );
};

const kilobytes = (bytes: number): string => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * The diagnostics bundle under App & updates (named so it is not a second "Diagnostics" beside the Advanced rows of that name): look at what a diagnostics bundle would hold, then save it as a zip in a folder the narrator picks. The
 * path is copied to the clipboard. Nothing is sent anywhere; the narrator attaches the file to an issue by hand. The preview is a
 * dialog, so a long list of files never moves the page.
 */
export function DiagnosticsSection() {
  const api = usePort('system');
  const overlay = useOverlay();
  const [preview, setPreview] = useState<DiagnosticsPreview>();
  const [busy, setBusy] = useState<'preview' | 'save' | ''>('');

  const showPreview = async () => {
    setBusy('preview');
    try {
      setPreview(await api.systemDiagnosticsPreview());
    } catch (failure) {
      overlay.toast(apiErrorMessage(failure), { tone: 'error' });
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    setBusy('save');
    try {
      const { path } = await api.systemSaveDiagnostics();
      if (!path) return; // the narrator closed the folder picker
      const copied = await copyText(path);
      overlay.toast(copied ? `Saved to ${path}. The path is copied.` : `Saved to ${path}.`);
    } catch (failure) {
      overlay.toast(apiErrorMessage(failure), { tone: 'error' });
    } finally {
      setBusy('');
    }
  };

  return (
    <section aria-label="Diagnostics bundle" className="flex flex-col">
      <SectionLabel as="h3" className="mb-1.5">
        Diagnostics bundle
      </SectionLabel>
      <Panel flush>
        <div className={ABOUT_ROW} data-about="diagnostics">
          <div className="flex min-w-0 flex-col gap-[3px]">
            <b className="text-[0.9375rem] font-semibold">File for a bug report</b>
            <span className="max-w-[60ch] text-[0.8125rem] text-[var(--text-muted)]">
              A zip of how the app behaved, with no text, names or file paths from your books. Nothing is sent anywhere.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <IconButton
              action="list"
              label="Preview the diagnostics bundle"
              aria-haspopup="dialog"
              pending={busy === 'preview'}
              onClick={() => void showPreview()}
            />
            <IconButton action="export" label="Save the diagnostics bundle" pending={busy === 'save'} onClick={() => void save()} />
          </div>
        </div>
      </Panel>
      {preview && (
        <Dialog
          title="Diagnostics bundle"
          size="wide"
          dismissOnOutsidePress
          onClose={() => setPreview(undefined)}
          actions={<IconButton action="export" label="Save the diagnostics bundle" pending={busy === 'save'} onClick={() => void save()} />}
        >
          <div className="flex max-h-[60dvh] flex-col gap-4 overflow-y-auto text-[0.875rem]">
            <section aria-label="Included" className="flex flex-col gap-1.5">
              <SectionLabel as="p">Included</SectionLabel>
              {preview.files.length === 0 ? (
                <p className="m-0 text-[var(--text-muted)]">Nothing has been recorded yet.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {preview.files.map((file) => (
                    <li key={file.name} className="flex flex-wrap justify-between gap-x-4">
                      <span>
                        <b className="font-semibold">{file.name}</b> <span className="text-[var(--text-muted)]">{file.source}</span>
                      </span>
                      <span className="text-[var(--text-muted)]">
                        {file.lines} lines, {kilobytes(file.bytes)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Left out" className="flex flex-col gap-1.5">
              <SectionLabel as="p">Left out</SectionLabel>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {preview.excluded.map((item) => (
                  <li key={item.name}>
                    <b className="font-semibold">{item.name}</b> <span className="text-[var(--text-muted)]">{item.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
            <p className="m-0 text-[var(--text-muted)]">Leak check: {plural(preview.leakCheck.linesDropped, 'line')} dropped for naming you or your project.</p>
          </div>
        </Dialog>
      )}
    </section>
  );
}
