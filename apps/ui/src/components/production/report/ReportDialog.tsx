import { useEffect, useRef, useState } from 'react';
import type { ProductionReportExport, ProductionReportPreview } from '../../../api/contracts/production';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { Checkbox } from '../../primitives/Checkbox';
import { ToggleGroup } from '../../primitives/ToggleGroup';
import { amountOffered, reportPath, type ReportFormat } from './reportModel';

const MUTED = { color: 'var(--text-muted)' };
const DANGER = { color: 'var(--danger-text)' };
const FORMATS = [
  { value: 'html', label: 'HTML' },
  { value: 'json', label: 'JSON' },
] as const;

export type ReportDialogProps = {
  projectName: string;
  /** The date the report is "as of", already worded for the narrator. */
  asOf: string;
  onClose: () => void;
};

/**
 * "Export status report" (the mock's ReportDialog): the host's own document in a preview pane, the format, the path an export would
 * write, and Cancel / Export. Nothing is rebuilt here: the preview is `productionStatusReportPreview` and Export calls the existing
 * writer, so what is drawn is what the file holds. The mock's per-section checkboxes are not built (the host report has fixed
 * sections); its money pair is the one opt-in, off on open and offered only to a per-finished-hour plan with an amount (ADR 0406).
 */
export function ReportDialog({ projectName, asOf, onClose }: ReportDialogProps) {
  const production = usePort('production');
  const [offered, setOffered] = useState(false);
  const [include, setInclude] = useState(false);
  const [format, setFormat] = useState<ReportFormat>('html');
  const [preview, setPreview] = useState<ProductionReportPreview>();
  const [previewProblem, setPreviewProblem] = useState<string>();
  const [written, setWritten] = useState<ProductionReportExport>();
  const [exportProblem, setExportProblem] = useState<string>();
  const [writing, setWriting] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    let live = true;
    production
      .productionPlan()
      .then((plan) => live && setOffered(amountOffered(plan)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [production]);

  // Each ask replaces the last: an answer for an earlier choice never lands on a later one.
  useEffect(() => {
    const ask = ++latest.current;
    setPreview(undefined);
    setPreviewProblem(undefined);
    production
      .productionStatusReportPreview(include)
      .then((answer) => ask === latest.current && setPreview(answer))
      .catch((error: unknown) => ask === latest.current && setPreviewProblem(apiErrorMessage(error)));
  }, [production, include]);

  const exportReport = async () => {
    setWriting(true);
    setExportProblem(undefined);
    try {
      setWritten(await production.productionStatusReport(include));
    } catch (error) {
      setWritten(undefined);
      setExportProblem(apiErrorMessage(error));
    } finally {
      setWriting(false);
    }
  };

  const changeAmount = (next: boolean) => {
    setWritten(undefined);
    setInclude(next);
  };

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-sm" style={MUTED}>
        {projectName} · as of {asOf}
      </p>
      <p className="text-sm" style={MUTED}>
        Writes an HTML page anyone can open and a JSON file with the same figures into this project’s reports folder. The contracted amount and effective rate
        are left out unless you include them.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup label="Format" value={format} onChange={(value) => setFormat(value as ReportFormat)} options={FORMATS} look="segmented" />
        {offered && (
          <Checkbox checked={include} onChange={changeAmount}>
            Include the contracted amount and effective rate
          </Checkbox>
        )}
      </div>
      {preview && <code className="text-xs [overflow-wrap:anywhere] select-text">{reportPath(preview.folder, preview.stem, format)}</code>}
      {previewProblem ? (
        <p role="alert" className="text-sm" style={DANGER}>
          The report could not be previewed: {previewProblem}
        </p>
      ) : (
        <div className="h-[22rem] overflow-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)]">
          {preview === undefined ? (
            <p className="p-3 text-sm" style={MUTED} aria-live="polite">
              Building the preview…
            </p>
          ) : format === 'html' ? (
            <iframe title="Preview of the report" sandbox="" srcDoc={preview.html} className="size-full border-0 bg-white" />
          ) : (
            <pre aria-label="Preview of the report" className="p-3 font-mono text-xs [overflow-wrap:anywhere] whitespace-pre-wrap">
              {preview.json}
            </pre>
          )}
        </div>
      )}
      {exportProblem && (
        <p role="alert" className="text-sm" style={DANGER}>
          The report was not written: {exportProblem}
        </p>
      )}
      {written && (
        <div aria-live="polite" className="text-sm">
          <p>
            Wrote <span className="font-medium [overflow-wrap:anywhere]">{written.htmlFile}</span> and{' '}
            <span className="font-medium [overflow-wrap:anywhere]">{written.jsonFile}</span> to {written.folder}.
          </p>
          <p className="mt-1" style={MUTED}>
            {written.contractedAmountIncluded
              ? 'The contracted amount and effective rate are included.'
              : 'The contracted amount and effective rate are left out.'}
          </p>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        {written ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void exportReport()} pending={writing} disabled={preview === undefined || writing}>
            Export
          </Button>
        )}
      </div>
    </div>
  );
}
