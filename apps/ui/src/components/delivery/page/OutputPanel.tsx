import { useRef } from 'react';
import type { DeliveryProfile } from '../../../types';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import { ProgressBar } from '../../primitives/ProgressBar';
import { SectionLabel } from '../../primitives/SectionLabel';
import { StatusBadge } from '../../primitives/StatusBadge';
import type { DeliveryBuild } from './useDeliveryBuild';
import { askedText, checkedText, heardText } from './useHostRead';

const MUTED = { color: 'var(--text-muted)' };
const DANGER = { color: 'var(--danger-text)' };

/**
 * The mock's second panel: the folder the package goes to, "Build <profile> package" (disabled until every chapter passes, saying how many
 * do not), and once built "<n> files in <folder>", the button that opens that folder, and a Written pill per file. The host asks for the
 * folder with the operating system's own picker when the build starts and never takes a typed path, so the folder shown is the one its
 * job reports, and before a build it says the host will ask.
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
  build: DeliveryBuild;
  /** False after a profile change or while the chapters stop passing: the built list goes away. */
  showBuilt: boolean;
}) {
  const built = showBuilt && ready ? build.built : undefined;
  // Busy is shown with `pending`, not `disabled`, so the Build button keeps keyboard focus while it works.
  const canBuild = ready && build.encoded > 0;
  const buildButton = useRef<HTMLButtonElement>(null);
  const why = !ready
    ? waiting
    : build.encoded === 0
      ? 'Master all to spec in Master & QC first.'
      : build.exportRunning
        ? 'Master & QC is still preparing the files.'
        : waiting;
  return (
    <Panel title="Output">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <SectionLabel>Folder</SectionLabel>
          <p dir="auto" className="font-mono text-sm [overflow-wrap:anywhere]" style={build.folder ? undefined : MUTED}>
            {build.starting ? 'Choose a folder in the window that opened…' : (build.folder ?? 'Chosen when you build')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="max-w-full text-left [overflow-wrap:anywhere] whitespace-normal"
            ref={buildButton}
            onClick={() => void build.build()}
            disabled={!canBuild}
            pending={build.starting || build.busy}
          >
            Build {profile.name} package
          </Button>
          {build.running && (
            <Button
              variant="secondary"
              onClick={() => {
                build.cancel();
                // Cancel goes away when the job ends; keyboard focus goes back to Build, which stays.
                buildButton.current?.focus();
              }}
            >
              Cancel
            </Button>
          )}
          <span className="text-sm" style={MUTED}>
            {why}
          </span>
        </div>
        {build.running && <ProgressBar label="Building the package" value={null} running />}
        {build.quiet !== undefined && (
          <p role="alert" className="text-sm" style={DANGER}>
            Can't tell how the build is going, {heardText(build.lastHeard)}: {build.quiet} ({askedText(build.lastAsked)}).{' '}
            <Button variant="ghost" size="sm" onClick={build.checkAgain}>
              Check again
            </Button>
          </p>
        )}
        {build.quiet !== undefined && build.checkedAt !== undefined && build.lastAsked !== undefined && build.lastAsked >= build.checkedAt && (
          <p role="status" className="text-sm" style={MUTED}>
            {checkedText(build.checkedAt)}: the host still did not answer.
          </p>
        )}
        {build.cancelUnconfirmed && (
          <p role="status" className="text-sm" style={MUTED}>
            Cancel was sent, but the host did not confirm it, so the build may still be running.
          </p>
        )}
        {/* What the last attempt came to belongs to the profile and limits it was made with: a change drops it, as it drops the built list. */}
        {showBuilt && (build.problem || build.failed) && (
          <p role="alert" className="text-sm" style={DANGER}>
            {build.problem ?? build.failed?.error ?? build.failed?.message}
          </p>
        )}
        {showBuilt && (build.notice || build.cancelled) && (
          <p role="status" className="text-sm" style={MUTED}>
            {build.notice ?? build.cancelled?.message}
          </p>
        )}
        {built && (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge tone="success" label="Built" />
              <b>{built.files.length} files</b>
              <span dir="auto" style={MUTED}>
                in {built.outputDir}
              </span>
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
                  <span dir="auto" title={file.name} className="min-w-0 truncate">
                    {file.name}
                  </span>
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
