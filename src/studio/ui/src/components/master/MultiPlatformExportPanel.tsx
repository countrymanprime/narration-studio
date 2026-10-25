import { Fragment, useState } from 'react';
import type { DeliveryProfile, DeliveryRuleStatus, MultiPackagePhase, MultiPackageResult } from '../../types';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { Panel } from '../primitives/Panel';
import { ProgressBar } from '../primitives/ProgressBar';
import { SectionLabel } from '../primitives/SectionLabel';
import { deliveryProfileKey } from './deliveryProfile';
import { ResultIcon } from './RuleBadges';
import type { ExportJobs } from './useExportJobs';

const MUTED = { color: 'var(--text-muted)' };
const DANGER = { color: 'var(--danger-text)' };
const OK = { color: 'var(--ok-text)' };
const MONO = "font-['IBM_Plex_Mono',ui-monospace,monospace]";

/** The label a checkbox gives a profile: its platform for a built-in, its own name for a custom profile (docs/guides/using-the-app/master-and-qc.md#building-packages-for-several-platforms-at-once: the
 * project's own single delivery-profile choice is Delivery's profile card; this list is a separate, multi-select export-platform picker). */
const platformNameFor = (profile: DeliveryProfile) => (profile.builtIn ? profile.platform : profile.name);

/** The host names a result's profile by its key (`deliveryProfileKey`); an id alone is matched too. */
const resultIsFor = (result: MultiPackageResult, profile: DeliveryProfile) => result.profile === deliveryProfileKey(profile) || result.profile === profile.id;

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** A multi-platform result's own status, in the same icon language as a package checklist row (RuleBadges.tsx). */
const RESULT_STATUS: Record<MultiPackagePhase, { icon: DeliveryRuleStatus; word: string }> = {
  pending: { icon: 'not_measurable', word: 'Waiting' },
  running: { icon: 'not_checked', word: 'Building…' },
  success: { icon: 'met', word: 'Built' },
  error: { icon: 'not_met', word: "Couldn't build" },
};

/** A folder path that may break after each separator and nowhere else, so "…\\Wonderland\\ACX" never splits as "A / CX" (XMS-18). */
function BreakablePath({ path }: { path: string }) {
  const parts = path.split(/(?<=[\\/])/);
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < parts.length - 1 && <wbr />}
        </Fragment>
      ))}
    </>
  );
}

/**
 * A platform's result, under its own checkbox and level with the checkbox's label (R4MS2-8, R3MS-14): the status in words with its icon,
 * then the folder and the file count, or what went wrong.
 */
function ResultLine({ result }: { result: MultiPackageResult }) {
  const { icon, word } = RESULT_STATUS[result.phase];
  return (
    <div className="pb-1 pl-6 text-[0.8rem]">
      <span className="flex items-center" style={result.phase === 'error' ? DANGER : MUTED}>
        <ResultIcon status={icon} />
        {word}
      </span>
      {result.phase === 'success' && (
        <>
          <span className={`${MONO} block break-words`} style={MUTED}>
            <BreakablePath path={result.outputDir} />
          </span>
          <span className="block" style={MUTED}>
            {plural(result.files.length, 'file')}
          </span>
        </>
      )}
      {result.phase === 'error' && (
        <span className="block" style={DANGER}>
          {result.error || result.message}
        </span>
      )}
    </div>
  );
}

/**
 * One mastered/encoded source's packages for several platforms in one action:
 * a checkbox per profile the host lists (the same list Master & QC's platform tabs read, docs/guides/using-the-app/master-and-qc.md#building-packages-for-several-platforms-at-once - the tabs
 * themselves stay a single-select choice of the project's own judged profile, never repurposed here), a "Build N
 * packages" action once at least one is checked and the export job has files ready, a progress indicator and Cancel
 * while it runs, and a per-profile result row once it has (or has started to) run.
 */
export function MultiPlatformExportPanel({ profiles, jobs }: { profiles: DeliveryProfile[]; jobs: ExportJobs }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { multiPackageJob, multiPackageRunning, multiPackageProblem } = jobs;

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const chosen = profiles.filter((profile) => selected.has(profile.id));
  const canBuild = chosen.length > 0 && jobs.doneFiles.length > 0 && !jobs.exportRunning && !jobs.packageRunning && !multiPackageRunning;
  const results = multiPackageJob && multiPackageJob.phase !== 'idle' ? multiPackageJob.results : [];

  return (
    <Panel title="Multi-platform export">
      {profiles.length === 0 ? (
        <p className="text-sm" style={MUTED}>
          No delivery platforms are set up yet.
        </p>
      ) : (
        <fieldset className="flex flex-col gap-0.5">
          <SectionLabel as="legend" className="mb-1">
            Build packages for
          </SectionLabel>
          {profiles.map((profile) => {
            const result = results.find((candidate) => resultIsFor(candidate, profile));
            return (
              <div key={profile.id}>
                <Checkbox checked={selected.has(profile.id)} onChange={(checked) => toggle(profile.id, checked)} disabled={multiPackageRunning}>
                  {platformNameFor(profile)}
                </Checkbox>
                {result && <ResultLine result={result} />}
              </div>
            );
          })}
        </fieldset>
      )}
      {/* A result for a profile the list no longer holds (it was deleted while the build ran) still says how it went. */}
      {results
        .filter((result) => !profiles.some((profile) => resultIsFor(result, profile)))
        .map((result) => (
          <div key={result.profile} className="mt-2 text-sm">
            <span className="font-medium">{result.platform}</span>
            <ResultLine result={result} />
          </div>
        ))}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => void jobs.startMultiPackage(chosen)} disabled={!canBuild} pending={multiPackageRunning}>
          Build {plural(chosen.length, 'package')}
        </Button>
        {multiPackageRunning && (
          <Button variant="secondary" onClick={jobs.cancelMultiPackage}>
            Cancel
          </Button>
        )}
      </div>
      {multiPackageRunning && <ProgressBar label="Building packages" value={null} running className="mt-3" />}
      {multiPackageProblem && (
        <p role="alert" className="mt-2 text-sm" style={DANGER}>
          {multiPackageProblem}
        </p>
      )}
      {multiPackageJob && multiPackageJob.phase !== 'idle' && multiPackageJob.phase !== 'running' && (
        <p aria-live="polite" className="mt-2 text-sm" style={multiPackageJob.phase === 'error' ? DANGER : OK}>
          {multiPackageJob.message}
        </p>
      )}
    </Panel>
  );
}
