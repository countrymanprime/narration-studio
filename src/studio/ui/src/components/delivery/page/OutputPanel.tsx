import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DeliveryProfile } from '../../../types';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { Panel } from '../../primitives/Panel';
import { ProgressBar } from '../../primitives/ProgressBar';
import { SectionLabel } from '../../primitives/SectionLabel';
import { statusTone } from '../../../kinds/statusTone';
import { StatusBadge } from '../../primitives/StatusBadge';
import type { DeliveryBuild } from './useDeliveryBuild';
import { askedText, checkedText, heardText } from './useHostRead';
import { NOTHING_MEASURED } from './chapterStates';
import { ARRIVE_CLASSES } from '../../primitives/changeHighlight';

const MUTED = { color: 'var(--text-muted)' };
const WHY_ID = 'delivery-build-why';

/** A host's error as a sentence: its first letter a capital ("could not create …" reads "Could not create …", R3DL-2). */
const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * One message under the build row. Every message of the panel is one of these, in one column at one 8 px pitch (XDL-8, R3DL-3): a
 * problem is framed on `--danger-soft` with a warning icon, a note is muted text; the one button a message offers sits on its own line
 * under it, at the message's left edge, at every width (R3DL-7).
 */
function BuildMessage({ tone, role, action, children }: { tone: 'problem' | 'note'; role?: 'alert' | 'status'; action?: ReactNode; children: ReactNode }) {
  if (tone === 'note')
    return (
      <div role={role} className="flex flex-col items-start gap-2">
        <p dir="auto" className="text-sm text-pretty" style={MUTED}>
          {children}
        </p>
        {action}
      </div>
    );
  return (
    <div role={role} className="flex flex-col items-start gap-2 rounded-[var(--radius-card)] bg-[var(--danger-soft)] px-3 py-2">
      <p dir="auto" className="flex gap-2 text-sm text-pretty text-[var(--danger-text)]">
        <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" className="mt-[0.1875rem] flex-none" />
        <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
      </p>
      {action}
    </div>
  );
}

/**
 * The mock's second panel: the folder the package goes to, "Build <profile> package" (`aria-disabled` until every chapter passes, so it stays
 * in the Tab order, described by `#delivery-build-why` which says how many do not, and a press says nothing was built), and once built "<n> files in <folder>", the button that opens that folder, and a Written pill per file. The host asks for the
 * folder with the operating system's own picker when the build starts and never takes a typed path, so the folder shown is the one its
 * job reports, and before a build it says the host will ask.
 */
export function OutputPanel({
  profile,
  ready,
  waiting,
  failure,
  build,
  showBuilt,
  onOpenMaster,
}: {
  profile: DeliveryProfile;
  ready: boolean;
  waiting: string;
  /** The first failing chapter, rule, value and limit, said beside Build while Build is off. */
  failure?: string;
  build: DeliveryBuild;
  /** False after a profile change or while the chapters stop passing: the built list goes away. */
  showBuilt: boolean;
  /** Opens Master & QC: offered when nothing is measured yet (R4DL-2). */
  onOpenMaster?: () => void;
}) {
  const built = showBuilt && ready ? build.built : undefined;
  // Busy is shown with `pending`, not `disabled`, so the Build button keeps keyboard focus while it works.
  const canBuild = ready && build.encoded > 0;
  const buildButton = useRef<HTMLButtonElement>(null);
  // While a build runs and the host has stopped answering, "Every chapter passes." would be a stale fact; the alert below says what is known.
  const stale = build.running && build.quiet !== undefined;
  const lastFailed = showBuilt && Boolean(build.problem || build.failed);
  // Once a build starts, the pre-build verdict ("Every chapter passes.") gives way to what the build is doing (R3DL-2, R4DL-5).
  const why = stale
    ? ''
    : build.running
      ? 'Building the package…'
      : ready && lastFailed
        ? 'The last build did not finish.'
        : !ready
          ? waiting
          : build.encoded === 0
            ? 'Master all to spec in Master & QC first.'
            : build.exportRunning
              ? 'Master & QC is still preparing the files.'
              : waiting;
  // A press on a blocked Build builds nothing; this says so, with the reason, to a screen reader as well as the eye. It goes when Build is live.
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    if (canBuild) setRefused(false);
  }, [canBuild]);
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
            onClick={canBuild ? () => void build.build() : () => setRefused(true)}
            // Spread only when blocked: an explicit `aria-disabled={undefined}` would override the Button's own pending `aria-disabled`.
            {...(canBuild ? {} : { 'aria-disabled': true, 'aria-describedby': why ? WHY_ID : undefined })}
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
          <span id={WHY_ID} className="text-sm" style={MUTED}>
            {why}
          </span>
        </div>
        {refused && !canBuild && (
          <p role="status" className="sr-only">
            Nothing was built{why ? `: ${why}` : ''}
          </p>
        )}
        {build.running && <ProgressBar label="Building the package" value={null} running />}
        {/* Why Build is off: the first failing or unready chapter, or that nothing is measured at all, with the way to Master & QC (R4DL-2). */}
        {!ready && failure && !stale && (
          <BuildMessage
            tone="problem"
            action={
              failure === NOTHING_MEASURED && onOpenMaster ? (
                <Button variant="secondary" size="sm" onClick={onOpenMaster}>
                  Open Master & QC
                </Button>
              ) : undefined
            }
          >
            {failure}
          </BuildMessage>
        )}
        {/* A quiet host is one message: the warning with its age said once (a press of Check again names itself there rather than in a
            second line, R4DL-4); Check again under it is Cancel's variant, so the two are one kind of control (R4DL-3). */}
        {build.quiet !== undefined && (
          <BuildMessage
            tone="problem"
            role="alert"
            action={
              <Button variant="secondary" size="sm" onClick={build.checkAgain}>
                Check again
              </Button>
            }
          >
            Can't tell how the build is going, {heardText(build.lastHeard)}: {build.quiet} (
            {build.checkedAt !== undefined && build.lastAsked !== undefined && build.lastAsked >= build.checkedAt
              ? checkedText(build.checkedAt).replace(/^You/, 'you')
              : askedText(build.lastAsked)}
            ).
          </BuildMessage>
        )}
        {build.cancelUnconfirmed && (
          <BuildMessage tone="note" role="status">
            Cancel was sent, but the host did not confirm it, so the build may still be running.
          </BuildMessage>
        )}
        {/* What the last attempt came to belongs to the profile and limits it was made with: a change drops it, as it drops the built list. */}
        {lastFailed && (
          <BuildMessage tone="problem" role="alert">
            {sentence(build.problem ?? build.failed?.error ?? build.failed?.message ?? '')}
          </BuildMessage>
        )}
        {showBuilt && (build.notice || build.cancelled) && (
          <BuildMessage tone="note" role="status">
            {build.notice ?? build.cancelled?.message}
          </BuildMessage>
        )}
        {built && (
          <div className={`flex flex-col gap-1.5 ${ARRIVE_CLASSES}`}>
            {/* The summary and the folder button share the first line at every width: the button never drops to a row of its own (XDL-9). */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-sm">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <StatusBadge tone={statusTone('done')} label="Built" />
                <b>{built.files.length} files</b>
                <span dir="auto" className="[overflow-wrap:anywhere]" style={MUTED}>
                  in {built.outputDir}
                </span>
              </span>
              <IconButton action="openFolder" onClick={build.openFolder} pending={build.opening} />
            </div>
            {build.openProblem && (
              <BuildMessage tone="problem" role="alert">
                {build.openProblem}
              </BuildMessage>
            )}
            {/* Each file's Written pill sits after the longest name, not at the card's far edge (XDL-9). */}
            <ul className="grid grid-cols-[minmax(0,max-content)_auto] items-center gap-x-4 gap-y-1">
              {built.files.map((file) => (
                <li key={file.destPath} className="col-span-2 grid grid-cols-subgrid items-center text-sm">
                  <span dir="auto" title={file.name} className="min-w-0 truncate">
                    {file.name}
                  </span>
                  <span className="justify-self-start">
                    <StatusBadge tone={statusTone('done')} label="Written" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}
