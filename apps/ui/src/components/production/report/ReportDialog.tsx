import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProductionReportExport, ProductionReportPreview, ReportSection } from '../../../api/contracts/production';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { Checkbox } from '../../primitives/Checkbox';
import { IconButton } from '../../primitives/IconButton';
import { ToggleGroup } from '../../primitives/ToggleGroup';
import { amountOffered, chosenSections, DEFAULT_SECTIONS, REPORT_SECTIONS, reportPath, type ReportFormat } from './reportModel';

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
 * "Export status report" (the mock's ReportDialog): two panes, the form (an Include box per section, the format and the path an export
 * would write) beside a tall preview of the host's own document. Nothing is rebuilt here: the preview is
 * `productionStatusReportPreview` and Export calls the existing writer with the same sections, so what is drawn is what the file holds.
 * The money section is off on open and offered only to a per-finished-hour plan with an amount.
 * The dialog draws its own header (the overlay is headerless) for the mock's 26 px title with "project · as of date" under it.
 */
export function ReportDialog({ projectName, asOf, onClose }: ReportDialogProps) {
  const production = usePort('production');
  const [offered, setOffered] = useState(false);
  const [ticked, setTicked] = useState<ReadonlySet<ReportSection>>(DEFAULT_SECTIONS);
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

  const sections = useMemo(() => chosenSections(ticked, offered), [ticked, offered]);
  // The ask is keyed by its text so a plan answer that changes nothing does not rebuild the preview.
  const choice = sections.join(',');

  // Each ask replaces the last: an answer for an earlier choice never lands on a later one.
  useEffect(() => {
    const ask = ++latest.current;
    setPreview(undefined);
    setPreviewProblem(undefined);
    production
      .productionStatusReportPreview(REPORT_SECTIONS.filter(({ id }) => choice.split(',').includes(id)).map(({ id }) => id))
      .then((answer) => ask === latest.current && setPreview(answer))
      .catch((error: unknown) => ask === latest.current && setPreviewProblem(apiErrorMessage(error)));
  }, [production, choice]);

  const exportReport = async () => {
    setWriting(true);
    setExportProblem(undefined);
    try {
      setWritten(await production.productionStatusReport(sections));
    } catch (error) {
      setWritten(undefined);
      setExportProblem(apiErrorMessage(error));
    } finally {
      setWriting(false);
    }
  };

  const tick = (section: ReportSection, on: boolean) => {
    setWritten(undefined);
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(section);
      else next.delete(section);
      return next;
    });
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          {/* The overlay's own (visually hidden) title names the dialog; this is the same words, drawn at the mock's size. */}
          <p aria-hidden="true" className="text-[1.625rem] leading-tight font-semibold">
            Export status report
          </p>
          <p className="text-sm [overflow-wrap:anywhere]" style={MUTED}>
            {projectName} · as of {asOf}
          </p>
        </div>
        <IconButton action="close" onClick={onClose} />
      </div>
      <div className="@container px-5 py-4">
        <div className="grid grid-cols-1 items-start gap-5 @2xl:grid-cols-[minmax(0,18.75rem)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3.5">
            <p className="text-sm" style={MUTED}>
              Writes an HTML page anyone can open and a JSON file with the same figures into this project’s reports folder. The contracted amount and effective
              rate are left out unless you include them.
            </p>
            <fieldset className="flex min-w-0 flex-col gap-2.5">
              <legend className="mb-2 text-xs font-medium tracking-wide uppercase" style={MUTED}>
                Include
              </legend>
              {REPORT_SECTIONS.filter(({ id }) => id !== 'money' || offered).map(({ id, label }) => (
                <Checkbox key={id} data-section={id} checked={ticked.has(id)} onChange={(next) => tick(id, next)}>
                  {label}
                </Checkbox>
              ))}
            </fieldset>
            <ToggleGroup label="Format" value={format} onChange={(value) => setFormat(value as ReportFormat)} options={FORMATS} look="segmented" />
            {preview && (
              <code className="rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-2 text-xs [overflow-wrap:anywhere] select-text">
                {reportPath(preview.folder, preview.stem, format)}
              </code>
            )}
            {sections.length === 0 && (
              <p className="text-sm" style={MUTED}>
                Tick at least one section to export.
              </p>
            )}
          </div>
          {previewProblem ? (
            <p role="alert" className="text-sm" style={DANGER}>
              The report could not be previewed: {previewProblem}
            </p>
          ) : (
            <div className="h-[min(32rem,58dvh)] min-w-0 overflow-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)]">
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
        </div>
        {exportProblem && (
          <p role="alert" className="mt-3 text-sm" style={DANGER}>
            The report was not written: {exportProblem}
          </p>
        )}
        {written && (
          <div aria-live="polite" className="mt-3 text-sm">
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
      <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        {written ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void exportReport()} pending={writing} disabled={preview === undefined || writing || sections.length === 0}>
            Export
          </Button>
        )}
      </div>
    </div>
  );
}
