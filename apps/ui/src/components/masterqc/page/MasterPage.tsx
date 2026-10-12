import { useEffect, useMemo, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import type { DeliveryProfile } from '../../../types';
import { deliveryProfileKey } from '../../master/deliveryProfile';
import { DiagnosticsSection } from '../../master/DiagnosticsSection';
import { FileRulesPanel } from '../../master/FileRulesPanel';
import { MasteringChain, useMasteringProviders } from '../../master/MasteringChain';
import { MasterToSpecPanel } from '../../master/MasterToSpecPanel';
import { MultiPlatformExportPanel } from '../../master/MultiPlatformExportPanel';
import { ReportExportPanel } from '../../master/ReportExportPanel';
import { useExportJobs } from '../../master/useExportJobs';
import { Button } from '../../primitives/Button';
import { Heading } from '../../primitives/Heading';
import { Panel } from '../../primitives/Panel';
import type { FileActions } from '../files/FileActions';
import { FileChecks } from '../files/FileChecks';
import { FilesTable } from '../files/FilesTable';
import { buildRows } from '../files/rows';
import { Consistency } from './Consistency';
import { MeasureControls, MeasureProgress, useMeasureRun } from './MeasureRun';
import { PackageChecks } from './PackageChecks';
import { profileName } from './packageItems';

const MUTED = { color: 'var(--text-muted)' };
const DANGER = { color: 'var(--danger-text)' };

/**
 * Master & QC (the Studio Next mock's Master page, at `/master`): the per-file checks and their detail, the book's consistency
 * against the profile, and the delivery package beside them. The profile pill and "Open Delivery" call `onOpenDelivery`; this page
 * navigates nowhere itself. The run controls, a file's every-rule list, mastering to spec, the mastering chain, the diagnostics, the
 * multi-platform export and the report export have no equivalent in the mock (D98) and stay as built, beside its sections. Playing a stretch of a file
 * and opening it in the DAW are the caller's (`fileActions`): the DAW port has no such call yet, so they do nothing until one is given.
 */
export function MasterPage({
  onOpenDelivery,
  openSettings,
  fileActions,
}: {
  onOpenDelivery: () => void;
  openSettings: () => void;
  fileActions?: Pick<FileActions, 'onPlayQuietest' | 'onOpenInDaw'>;
}) {
  const profilesPort = usePort('deliveryProfiles');
  const run = useMeasureRun();
  const jobs = useExportJobs();
  const mastering = useMasteringProviders();
  const [all, setAll] = useState<DeliveryProfile[]>([]);
  const [chosen, setChosen] = useState<DeliveryProfile>();
  const [profileProblem, setProfileProblem] = useState<string>();
  const [selected, setSelected] = useState<string>();
  // The file whose every-rule list the narrator closed; selecting another file shows its list again.
  const [rulesClosed, setRulesClosed] = useState<string>();

  useEffect(() => {
    let active = true;
    profilesPort.deliveryProfiles().then(
      (state) => {
        if (!active) return;
        setAll(state.profiles);
        const found = state.profiles.find((candidate) => deliveryProfileKey(candidate) === state.projectProfile);
        if (found) setChosen(found);
        else setProfileProblem(`the profile ${state.projectProfile} is not in the list`);
      },
      (error) => active && setProfileProblem(apiErrorMessage(error)),
    );
    return () => {
      active = false;
    };
  }, [profilesPort]);

  // The profile a measurement was judged against wins over the project's current choice until it is measured again.
  const profile = run.job?.profile ?? chosen;
  const rows = useMemo(() => (profile ? buildRows(run.files, profile) : []), [run.files, profile]);
  const current = rows.find((row) => row.id === selected);
  const currentFile = run.files.find((file) => file.path === selected && file.status === 'measured');
  const chain = mastering.providers?.providers.find((row) => row.name === mastering.providers?.effective);
  const actions: FileActions = {
    onPlayQuietest: fileActions?.onPlayQuietest ?? (() => undefined),
    onOpenInDaw: fileActions?.onOpenInDaw ?? (() => undefined),
    onRecheck: () => void run.check(),
  };

  return (
    <div className="mx-auto max-w-[96rem]">
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,22.4rem)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Heading title="Master & QC" />
            {profile && (
              <Button variant="ghost" size="sm" title="Open Delivery" onClick={onOpenDelivery}>
                {profileName(profile)}
              </Button>
            )}
            <div className="lg:ml-auto">
              <MeasureControls run={run} />
            </div>
          </div>
          {profileProblem && (
            <p role="alert" className="text-sm" style={DANGER}>
              The delivery profile could not be read: {profileProblem}
            </p>
          )}
          <MeasureProgress run={run} />
          {profile && run.files.length > 0 ? (
            <>
              <FilesTable files={run.files} profile={profile} selected={selected} onSelect={setSelected} actions={actions} />
              <FileChecks row={current} actions={actions} />
              {profile && currentFile && rulesClosed !== currentFile.path && (
                <FileRulesPanel file={currentFile} profile={profile} onClose={() => setRulesClosed(currentFile.path)} />
              )}
            </>
          ) : (
            !run.running && (
              <p className="text-sm" style={MUTED}>
                Nothing measured yet. Check your rendered chapter files (WAV) to see them here.
              </p>
            )
          )}
          <Panel title="Book consistency" subtitle={profile ? `RMS by file against the ${profileName(profile)} range` : undefined}>
            <Consistency files={run.files} profile={profile} />
          </Panel>
          <MasterToSpecPanel jobs={jobs} chainLabel={chain?.label} />
          <MasteringChain providers={mastering.providers} problem={mastering.problem} />
          <DiagnosticsSection measuredPaths={run.paths} openSettings={openSettings} />
          <ReportExportPanel busy={run.running} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <PackageChecks profile={profile} files={run.files} onOpenDelivery={onOpenDelivery} />
          <MultiPlatformExportPanel profiles={all} jobs={jobs} />
        </div>
      </div>
    </div>
  );
}
