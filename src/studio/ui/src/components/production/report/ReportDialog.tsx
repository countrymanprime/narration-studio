import { useEffect, useRef, useState } from 'react';
import type { ProductionReportExport, ProductionReportInclude, ProductionReportPreview } from '../../../api/contracts/production';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { Checkbox } from '../../primitives/Checkbox';
import { ToggleGroup } from '../../primitives/ToggleGroup';
import { amountOffered, DEFAULT_INCLUDE, REPORT_SECTIONS, reportPath, type ReportFormat, type ReportSection } from './reportModel';

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
 * "Export status report" (the mock's ReportDialog): two panes, the form (an Include checkbox per section, the format, the path an
 * export would write) beside a tall live preview, then Cancel / Export. Nothing is rebuilt here: the preview is
 * `productionStatusReportPreview(include)` and Export calls the existing writer with the same sections, so what is drawn is what the
 * file holds. The money section is off on open and offered only to a per-finished-hour plan with an amount.
 */
export function ReportDialog({ projectName, asOf, onClose }: ReportDialogProps) {
  const production = usePort('production');
  const [offered, setOffered] = useState(false);
  const [include, setInclude] = useState<ProductionReportInclude>(DEFAULT_INCLUDE);
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

  const changeSection = (section: ReportSection, next: boolean) => {
    setWritten(undefined);
    setInclude((current) => ({ ...current, [section]: next }));
  };

  return (
    // At most the dialog's own cap (Dialog's 80dvh, less its 1 px border): the title and the action row stay put and only the form and preview between them scroll, so Export is never
    // below the first screen at 390 px or on the bottom edge of a short window (alignment audit XPR2-24, R3PR2-2). It spans the dialog's width
    // (XPR2-23).
    <div className="flex max-h-[calc(80dvh-2px)] w-full flex-col">
      <div className="flex flex-none items-start justify-between gap-3 border-b border-[var(--border)] px-[1.1rem] py-4">
        <div>
          <h2 className="text-[26px] leading-tight font-semibold">Export status report</h2>
          <p className="text-sm" style={MUTED}>
            {projectName} · as of {asOf}
          </p>
        </div>
        <IconButton action="close" label="Close" onClick={onClose} />
      </div>
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-[1.1rem] md:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3.5">
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2 text-xs font-semibold tracking-wide uppercase" style={MUTED}>
              Include
            </legend>
            {REPORT_SECTIONS.filter((section) => section.id !== 'money' || offered).map((section) => (
              <Checkbox key={section.id} checked={include[section.id]} onChange={(next) => changeSection(section.id, next)}>
                {section.label}
              </Checkbox>
            ))}
          </fieldset>
          <p className="text-xs" style={MUTED}>
            Writes an HTML page anyone can open and a JSON file with the same figures into this project’s reports folder. The contracted amount and effective
            rate are left out unless you include them.
          </p>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold tracking-wide uppercase" style={MUTED}>
              Format
            </span>
            <div>
              <ToggleGroup label="Format" value={format} onChange={(value) => setFormat(value as ReportFormat)} options={FORMATS} look="segmented" />
            </div>
          </div>
          {preview && <code className="text-xs [overflow-wrap:anywhere] select-text">{reportPath(preview.folder, preview.stem, format)}</code>}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          {previewProblem ? (
            <p role="alert" className="text-sm" style={DANGER}>
              The report could not be previewed: {previewProblem}
            </p>
          ) : (
            <div className="h-[min(34rem,58dvh)] overflow-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)]">
              {preview === undefined ? (
                <p className="p-3 text-sm" style={MUTED} aria-live="polite">
                  Building the preview…
                </p>
              ) : format === 'html' ? (
                // No fill of its own: the page draws its background, light or dark as the app's theme (the frame takes the root's color-scheme, XPR2-46).
                <iframe title="Preview of the report" sandbox="" srcDoc={preview.html} className="size-full border-0" />
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
        </div>
      </div>
      <div data-report-actions="" className="flex flex-none flex-wrap justify-end gap-2 border-t border-[var(--border)] px-[1.1rem] pt-3 pb-4">
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
