import { useEffect, useState, type ReactNode } from 'react';
import { useApi } from '../../api/ApiContext';
import { apiErrorMessage } from '../../api/errorMessage';
import { dawShortName } from '../../studio/StudioProvider';
import { useDawKind } from '../../useDawKind';
import type { DiagnosticsJob, DiagnosticsSourceKind } from '../../types';
import { Button } from '../primitives/Button';
import { Panel } from '../primitives/Panel';
import { ProgressBar } from '../primitives/ProgressBar';
import { Tooltip } from '../primitives/Tooltip';
import { ToggleGroup } from '../primitives/ToggleGroup';
import { ProofOptions } from '../proof/proofOptions/ProofOptions';
import { cleanupThresholdRows, thresholdRows } from './diagnosticsFormat';
import { CheckedFilesTable, CleanupFindingsTable, FindingsTable } from './DiagnosticsTables';

/** How often a running check is read. */
const POLL_MS = 500;

const MUTED = { color: 'var(--text-muted)' };
const DANGER = { color: 'var(--danger-text)' };

const SOURCE_KINDS = [
  { value: 'processed_render', label: 'Rendered chapters' },
  { value: 'raw_recording', label: 'Raw recordings' },
] as const;

/** The DAW this session talks to, by name; "the DAW" until the first answer or with only the built-in recorder (the page is DAW-neutral). */
function useDawName(): string {
  const daw = useDawKind();
  return !daw || daw === 'none' ? 'the DAW' : dawShortName(daw);
}

/** The host's Cleanup settings (`fieldSchemas` in src/studio/desktop/app.go): the five thresholds of the silence, breath and click analyzer. */
const CLEANUP_OPTION_KEYS = ['pad_seconds', 'min_breath_seconds', 'max_breath_seconds', 'breath_below_speech_db', 'click_above_silence_db'] as const;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// A label and value list, one label column for every panel here so Thresholds and Silence cleanup line up (R3MS-4).
const DEFINITIONS = 'grid grid-cols-[minmax(8rem,11rem)_minmax(0,1fr)] gap-x-6 gap-y-1 text-sm';

/**
 * A table's scroll box, run to the card's edges: the table's own edge cells then start at the card's 16 px inset, level with the card's
 * text and title, and its rules reach the card's border (R4MS1-10); its edges shade while it scrolls (XMS-23). A tab stop, since a
 * scrolling region must be reachable by keyboard.
 */
function TableScroll({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div
      tabIndex={0}
      role="group"
      aria-label={`${label} scroll area`}
      className={`scroll-x-edges -mx-4 overflow-x-auto [--panel-pad:0px] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none focus-visible:ring-inset ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Silence cleanup candidates: every
 * `silence_cleanup` finding a checked file raised, apart from the Diagnostics tab's own findings above, with the
 * thresholds a check used (the narrator's own, from Settings > Silence cleanup). Findings view only: nothing here
 * applies a cut, because acting on a candidate in REAPER is not built here.
 */
function CleanupSection({ job, openSettings }: { job: DiagnosticsJob | undefined; openSettings: () => void }) {
  const dawName = useDawName();
  const files = job?.files ?? [];
  const candidates = files.flatMap((file) => file.cleanupFindings);
  const anyChecked = files.some((file) => file.status === 'checked');
  const ended = job !== undefined && (job.phase === 'success' || job.phase === 'cancelled' || job.phase === 'error');
  return (
    <Panel
      title="Silence cleanup candidates"
      actions={
        // In the header (XMS-21). What the list is goes on the "?", not in a paragraph under the title (#2251).
        <div className="flex items-center gap-2">
          <Tooltip label="About silence cleanup candidates" text={`Candidates to cut in ${dawName}, never applied here`} />
          <Button variant="secondary" onClick={openSettings}>
            Open Settings
          </Button>
        </div>
      }
    >
      {candidates.length > 0 ? (
        <TableScroll label="Silence cleanup candidates" className="mt-3">
          <CleanupFindingsTable files={files} />
        </TableScroll>
      ) : (
        ended &&
        anyChecked && (
          <p className="mt-3 text-sm" style={MUTED}>
            No silence, breath or click candidates in the checked files, against the thresholds below.
          </p>
        )
      )}
      {job ? (
        <>
          <dl className={`mt-4 ${DEFINITIONS}`}>
            {cleanupThresholdRows(job.cleanupThresholds).map((row) => (
              <div key={row.label} className="contents">
                <dt>{row.label}</dt>
                <dd className="[overflow-wrap:anywhere]">{row.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="mt-2 text-sm" style={MUTED}>
          Reading the thresholds…
        </p>
      )}
      <ProofOptions title="Silence cleanup options" group="Master & QC" tool="Cleanup" keys={CLEANUP_OPTION_KEYS} />
    </Panel>
  );
}

function ThresholdsPanel({ job }: { job: DiagnosticsJob | undefined }) {
  return (
    <Panel title="Thresholds" actions={<Tooltip label="About the thresholds" text="Starting values, not a delivery specification" />}>
      {job ? (
        <>
          <dl className={DEFINITIONS}>
            {thresholdRows(job.thresholds).map((row) => (
              <div key={row.label} className="contents">
                <dt>{row.label}</dt>
                <dd className="[overflow-wrap:anywhere]">{row.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="text-sm" style={MUTED}>
          Reading the thresholds…
        </p>
      )}
    </Panel>
  );
}

/**
 * Master & QC's Diagnostics section: the windowed analyzers
 * over files picked for measuring, as a host job with real progress and Cancel. Each finding shows its time in
 * the file, what was measured, the threshold that raised it and whether the audio is a raw recording or a rendered chapter, never a
 * grade. It is read-only: nothing is saved, played or sent to REAPER, so every finding stays unreviewed, and
 * the narrator listens at those times in REAPER. `measuredPaths` are the files of the last measurement, which the
 * host already accepts, so they can be checked without picking them again. Below it, `CleanupSection` lists the same check's silence
 * cleanup candidates apart from these findings; `openSettings` opens Settings > Silence cleanup.
 */
export function DiagnosticsSection({ measuredPaths, openSettings }: { measuredPaths: readonly string[]; openSettings: () => void }) {
  const dawName = useDawName();
  const api = useApi();
  const [job, setJob] = useState<DiagnosticsJob>();
  const [jobError, setJobError] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [picking, setPicking] = useState(false);
  const [sourceKind, setSourceKind] = useState<DiagnosticsSourceKind>('processed_render');

  useEffect(() => {
    let active = true;
    api
      .diagnosticsState()
      .then((state) => {
        if (!active) return;
        setJob(state);
        if (state.sourceKind) setSourceKind(state.sourceKind);
      })
      .catch((error) => active && setJobError(apiErrorMessage(error)));
    return () => {
      active = false;
    };
  }, [api]);

  // A running check is read until it ends; an answer after the tab closed is dropped.
  const running = job?.phase === 'running';
  useEffect(() => {
    if (!running) return;
    let active = true;
    const timer = setTimeout(() => {
      api
        .diagnosticsState()
        .then((next) => active && setJob(next))
        .catch((error) => active && setJobError(apiErrorMessage(error)));
    }, POLL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, running, job]);

  const check = async (paths: () => Promise<readonly string[]>) => {
    setPicking(true);
    setProblem(undefined);
    try {
      const chosen = await paths();
      if (chosen.length === 0) return;
      setJob(await api.diagnosticsAnalyze([...chosen], sourceKind));
      setJobError(undefined);
    } catch (error) {
      setProblem(apiErrorMessage(error));
    } finally {
      setPicking(false);
    }
  };

  const chooseFiles = () => check(async () => (await api.measurePickFiles()).paths);
  const checkMeasured = () => check(async () => measuredPaths);
  const cancel = () => void api.diagnosticsCancel().then(setJob, (error) => setProblem(apiErrorMessage(error)));

  const files = job?.files ?? [];
  const ended = job !== undefined && (job.phase === 'success' || job.phase === 'cancelled' || job.phase === 'error');
  const findings = files.flatMap((file) => file.findings);
  const anyChecked = files.some((file) => file.status === 'checked');
  const checkedKind = job?.sourceKind ?? sourceKind;

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Diagnostics"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip label="About diagnostics" text={`Times to listen to in ${dawName}: nothing here is changed`} />
            {measuredPaths.length > 0 && (
              <Button variant="secondary" onClick={() => void checkMeasured()} pending={picking} disabled={running}>
                {`Check the ${plural(measuredPaths.length, 'measured file', 'measured files')}`}
              </Button>
            )}
            <Button onClick={() => void chooseFiles()} pending={picking} disabled={running}>
              Choose files to check…
            </Button>
          </div>
        }
      >
        {/* A setting, so the segmented switch and not a second solid orange button beside "Choose files to check…" (R4MS1-8). */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span aria-hidden="true">The files are</span>
          <ToggleGroup
            label="The files are"
            look="segmented"
            value={sourceKind}
            onChange={(value) => setSourceKind(value as DiagnosticsSourceKind)}
            options={SOURCE_KINDS.map((option) => ({ ...option, disabled: running }))}
          />
        </div>
        {jobError && (
          <p role="alert" className="mt-2 text-sm" style={DANGER}>
            The diagnostics could not be read: {jobError}
          </p>
        )}
        {problem && (
          <p role="alert" className="mt-2 text-sm" style={DANGER}>
            {problem}
          </p>
        )}
        {job && running && (
          <div className="mt-3 flex flex-col gap-2">
            <ProgressBar label="Checking" value={job.percent} running valueText={`${job.percent}% read`} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p aria-live="polite" className="text-sm">
                {job.message}
              </p>
              <Button variant="secondary" onClick={cancel}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {job && ended && (
          <div className="mt-2 text-sm">
            {job.phase === 'error' ? (
              <p role="alert" style={DANGER}>
                {job.message} Choose the files again to check them.
              </p>
            ) : (
              <p aria-live="polite">{job.message}</p>
            )}
            {findings.length > 0 && <p className="mt-1 font-medium">{`${plural(findings.length, 'finding', 'findings')} to listen to.`}</p>}
          </div>
        )}
        {files.length > 0 ? (
          <>
            <TableScroll label="Checked files" className="mt-3">
              <CheckedFilesTable files={files} />
            </TableScroll>
            {findings.length > 0 ? (
              <TableScroll label="Findings" className="mt-4">
                <FindingsTable files={files} sourceKind={checkedKind} />
              </TableScroll>
            ) : (
              ended &&
              anyChecked && (
                <p className="mt-3 text-sm" style={MUTED}>
                  Nothing reached a threshold in the checked files. That is not a pass: it only means no clipping, level shift, room-tone change or long pause
                  reached the thresholds below.
                </p>
              )
            )}
          </>
        ) : (
          !running &&
          !jobError && (
            <p className="mt-2 text-sm" style={MUTED}>
              Nothing checked yet. Check the files you measured, or choose rendered chapters or raw recordings (WAV) to check.
            </p>
          )
        )}
      </Panel>
      <ThresholdsPanel job={job} />
      <CleanupSection job={job} openSettings={openSettings} />
    </div>
  );
}
