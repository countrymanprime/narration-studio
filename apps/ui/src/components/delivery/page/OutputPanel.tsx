import type { DeliveryProfile } from '../../../types';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import { ProgressBar } from '../../primitives/ProgressBar';
import { SectionLabel } from '../../primitives/SectionLabel';
import { StatusBadge } from '../../primitives/StatusBadge';
import type { BuildPackage } from './useBuildPackage';

const MUTED = { color: 'var(--text-muted)' };
const DANGER = { color: 'var(--danger-text)' };

/**
 * The mock's second panel: the folder the package goes to, "Build <profile> package" (disabled until every chapter passes, saying how many
 * do not), and once built "<n> files in <folder>", the button that opens that folder, and a Written pill per file. The host asks for the folder when the build starts, so the
 * folder shown is the one its job reports.
 */
export function OutputPanel({
  profile,
  ready,
  waiting,
  build,
  showBuilt,
}: {
  profile: DeliveryProfile;
  ready: boolean;
  waiting: string;
  build: BuildPackage;
  /** False after a profile change or while the chapters stop passing: the built list goes away. */
  showBuilt: boolean;
}) {
  const built = showBuilt && ready ? build.built : undefined;
  const canBuild = ready && build.encoded > 0 && !build.busy;
  return (
    <Panel title="Output">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <SectionLabel>Folder</SectionLabel>
          <p className="font-mono text-sm [overflow-wrap:anywhere]" style={build.folder ? undefined : MUTED}>
            {build.folder ?? 'Chosen when you build'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={build.build} disabled={!canBuild} pending={build.running}>
            Build {profile.name} package
          </Button>
          {build.running && (
            <Button variant="secondary" onClick={build.cancel}>
              Cancel
            </Button>
          )}
          <span className="text-sm" style={MUTED}>
            {ready && build.encoded === 0 ? 'Master all to spec in Master & QC first.' : waiting}
          </span>
        </div>
        {build.running && <ProgressBar label="Building the package" value={null} running />}
        {(build.problem || build.failed) && (
          <p role="alert" className="text-sm" style={DANGER}>
            {build.problem ?? build.failed?.error ?? build.failed?.message}
          </p>
        )}
        {built && (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge tone="success" label="Built" />
              <b>{built.files.length} files</b>
              <span style={MUTED}>in {built.outputDir}</span>
              <span className="flex-1" />
              <IconButton action="openFolder" onClick={build.openFolder} pending={build.opening} />
            </div>
            {build.openProblem && (
              <p role="alert" className="text-sm" style={DANGER}>
                {build.openProblem}
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {built.files.map((file) => (
                <li key={file.destPath} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{file.name}</span>
                  <StatusBadge tone="success" label="Written" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}
