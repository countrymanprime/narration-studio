import { useState, type DragEvent } from 'react';
import { Button } from '../primitives/Button';
import { Dialog } from '../primitives/Dialog';

/** What a drop on the zone can hand over in a browser. A browser `File` has no path: in the desktop app the host reads the dropped file itself (`hostProblem`, `data-file-drop-target`). */
export type DroppedManuscript = { name: string; path?: string };

/**
 * Step 1 of the import (the Studio Next mock's "Choose your manuscript"): a drop zone, "Choose a file…" and the line that says the
 * manuscript is read-only. Opening the host's file chooser and starting the preview are the caller's, so this only reports a choice.
 * The deviations from the mock are written next to the dialog's design in docs/architecture/import-review.md.
 */
export function ImportChooseDialog({
  replacing,
  importedOn,
  choosing,
  onChoose,
  onDrop,
  hostProblem,
  cancel,
}: {
  replacing: boolean;
  /** When the manuscript being replaced was imported, as a short date; absent when the project does not say. */
  importedOn?: string;
  /** The host's file chooser is open: the button is busy and ignores a press (it would open a second one). */
  choosing: boolean;
  onChoose: () => void;
  /** A file was dropped on the zone. It answers in words when the drop cannot be used, so the zone never fails silently. */
  onDrop: (file: DroppedManuscript) => string | undefined;
  /** Why the host could not use a file dropped on the zone (it checks the file and starts the import itself). */
  hostProblem?: string;
  cancel: () => void;
}) {
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string>();
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    setProblem(onDrop({ name: file.name, path: (file as File & { path?: string }).path }));
  };
  const steps = 2;
  return (
    <Dialog
      title={`${replacing ? 'Replace' : 'Import'} manuscript · step 1 of ${steps}`}
      onClose={cancel}
      dismissOnOutsidePress={false}
      description={<span className="sr-only">Choose the manuscript to import.</span>}
      actions={
        <Button variant="secondary" onClick={cancel}>
          Cancel
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <h3 className="text-[length:var(--font-size-xl)] font-semibold">Choose your manuscript</h3>
          <p className="text-sm text-[var(--text-muted)]">
            {replacing && importedOn ? `Replaces the manuscript imported ${importedOn}.` : 'Use a .docx, .md or .txt file. A copy is kept in your project.'}
          </p>
        </div>
        <div
          data-drop-zone
          // Wails reports an operating-system drop only over an element marked like this (the host then reads the path, never the page).
          data-file-drop-target
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed p-8 text-center"
          style={{ borderColor: over ? 'var(--accent)' : 'var(--border-strong, var(--border))', background: over ? 'var(--accent-soft)' : undefined }}
        >
          <b>Drop a manuscript here</b>
          <span className="text-sm text-[var(--text-muted)]">or</span>
          <Button variant="primary" pending={choosing} onClick={onChoose}>
            Choose a file…
          </Button>
        </div>
        {(problem ?? hostProblem) && (
          <p role="alert" className="text-sm" style={{ color: 'var(--danger-text)' }}>
            {problem ?? hostProblem}
          </p>
        )}
        <p className="text-sm text-[var(--text-muted)]">The manuscript is read-only. Your marks and notes are stored separately.</p>
      </div>
    </Dialog>
  );
}
