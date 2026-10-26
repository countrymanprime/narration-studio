import { useId, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { apiErrorMessage } from '../../api/errorMessage';
import type { DeliveryReportExport } from '../../types';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { Panel } from '../primitives/Panel';
import { brand } from '../../brand.gen';

const MUTED = { color: 'var(--text-muted)' };
const DANGER = { color: 'var(--danger-text)' };

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The report export: an explicit action that writes an HTML page a reviewer can open
 * without the app and a JSON file with the same finding IDs, covering the last measurement and diagnostics check, into the project's
 * sidecar folder. File locations stay out unless the narrator ticks the box. The host refuses while a job runs, without a project, or
 * with nothing measured; the button is off while a job runs or nothing is measured, and any refusal that remains is shown.
 */
export function ReportExportPanel({ busy, measured }: { busy: boolean; measured: boolean }) {
  const api = useApi();
  const [includePaths, setIncludePaths] = useState(false);
  const [pending, setPending] = useState(false);
  const [written, setWritten] = useState<DeliveryReportExport>();
  const [problem, setProblem] = useState<string>();
  const reasonId = useId();

  const exportReport = async () => {
    setPending(true);
    setProblem(undefined);
    try {
      setWritten(await api.deliveryExportReport(includePaths));
    } catch (error) {
      setWritten(undefined);
      setProblem(apiErrorMessage(error));
    } finally {
      setPending(false);
    }
  };

  // The option, the button and why it is off sit together at the foot of the card, in the order they are used (R4TB-4, R4MS1-11,
  // R4MS2-3): the reason is the line beside the dead button, and the option that only changes what it writes is off with it.
  const off = busy || !measured;
  const reason = busy ? 'Wait for the running check to end.' : !measured ? 'Check some files first: the report covers the files measured here.' : undefined;
  return (
    <Panel title="Report">
      <p className="max-w-[80ch] text-sm" style={MUTED}>
        Writes an HTML page anyone can open and a JSON file with the same findings, of the files measured and checked here, into this project’s{' '}
        {/* One unbroken name: it broke at its hyphen into "narration-" and "studio/delivery" (R4MS2-2). */}
        <span className="font-['IBM_Plex_Mono',ui-monospace,monospace] text-[0.8125rem] whitespace-nowrap">{brand.identity.projectFolder}/delivery</span>{' '}
        folder. Every open finding and every file not measured is listed. It is a measurement, not a distributor’s approval, and your audio is never changed.
      </p>
      <div className="mt-3">
        <Checkbox checked={includePaths} onChange={setIncludePaths} disabled={off}>
          Include each file’s full location (otherwise only file names are written)
        </Checkbox>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button onClick={() => void exportReport()} pending={pending} disabled={off} aria-describedby={reason ? reasonId : undefined}>
          Export report
        </Button>
        {reason && (
          <span id={reasonId} className="text-sm" style={MUTED}>
            {reason}
          </span>
        )}
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-sm" style={DANGER}>
          The report was not written: {problem}
        </p>
      )}
      {written && (
        <div aria-live="polite" className="mt-2 text-sm">
          <p>
            Wrote <span className="font-medium [overflow-wrap:anywhere]">{written.htmlFile}</span> and{' '}
            <span className="font-medium [overflow-wrap:anywhere]">{written.jsonFile}</span> to {written.folder}.
          </p>
          <p className="mt-1" style={MUTED}>
            {count(written.files, 'file', 'files')}, {count(written.openFindings, 'open finding', 'open findings')} of {written.findings};{' '}
            {written.pathsIncluded ? 'full file locations included.' : 'file names only, no locations.'}
          </p>
        </div>
      )}
    </Panel>
  );
}
