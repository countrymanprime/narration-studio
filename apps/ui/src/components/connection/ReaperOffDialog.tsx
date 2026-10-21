import { useEffect, useState, type ReactNode } from 'react';
import type { DawCapabilities, DawChoice, DawKind } from '../../api/contracts/daw';
import { usePort } from '../../ports/usePort';
import { recorderName } from '../../studio/dawNames';
import { Button } from '../primitives/Button';
import { useSecondsSince } from '../layout/CheckLine';
import { ResolveShell } from './ResolveShell';
import { useReaperLaunch } from './useReaperLaunch';

/** What the host knows about the project's DAW beyond "not answering": closed, open with no bridge, or answered once and went quiet. */
function choiceSentence(choice: DawChoice | null | undefined, name: string): string | null {
  switch (choice?.state) {
    case 'linked':
      return `The project is linked, but ${name} has not connected: it is closed, or open without the launcher run.`;
    case 'not_running':
      return `${name} connected before and has stopped answering.`;
    case 'not_linked':
      return `No ${name} project file is linked to this project yet, so it cannot be started from here.`;
    default:
      return null;
  }
}

export type ReaperOffDialogProps = {
  daw: DawKind;
  /** The host's own sentence for why the DAW is off (the record capability's message, or "<DAW> is not running."). */
  sentence: string;
  /** What still works while it is off, said once. */
  stillWorks: string;
  /** When the DAW was last asked (ms since the epoch); null before the first read. */
  checkedAt: number | null;
  /** When the DAW last answered; null when it has not since the app opened. */
  heardAt?: number | null;
  /** The last read failed, so the dialog says it cannot tell instead of giving the last answer as fact. */
  readFailed?: boolean;
  /** The visible Check again: a fresh read now. */
  onCheckAgain: () => Promise<unknown> | void;
  /** Each capabilities read made while waiting for a started DAW, so the page's picture follows. */
  onCaps?: (caps: DawCapabilities) => void;
  /** What the DAW is called when `daw` does not say (a launch with no DAW: the Booth words REAPER from its connect guide). */
  name?: string;
  /** What the dialog waits for: the DAW to `answer` (it went quiet) or to `connect` (its bridge was never up). */
  waitingFor?: 'answer' | 'connect';
  /** The primary action's label; the default names the DAW. */
  startLabel?: string;
  /** Whether the project's DAW file is linked, when the page knows it; absent, the host's choice (`dawChoice`) says. Start is off while it is not. */
  linked?: boolean;
  /** Opens the place the project file is linked (Settings), offered beside "Link the project file first". */
  onLink?: () => void;
  /** The host started the DAW (`DawLaunch` answered) with this executable path. */
  onLaunched?: (path: string) => void;
  /** How often, and how many times, the DAW is asked after Start before the dialog says it has not answered (stories and tests shorten it). */
  pollMs?: number;
  polls?: number;
  /** The way out the header X takes. */
  onClose: () => void;
  /** More for the body: the Booth's one-time steps, an escape to the built-in recorder. */
  children?: ReactNode;
};

/**
 * Variant 1 of the resolve dialog: the DAW is not connected. It says in the host's words what is wrong, what still works and when it last
 * looked, and offers Start <DAW> (the host's launcher) with a Check again. The page closes it by no longer drawing it once the DAW answers.
 */
export function ReaperOffDialog({
  daw,
  sentence,
  stillWorks,
  checkedAt,
  heardAt,
  readFailed,
  onCheckAgain,
  onCaps,
  name: nameOverride,
  waitingFor = 'answer',
  startLabel,
  linked,
  onLink,
  onLaunched,
  pollMs,
  polls,
  onClose,
  children,
}: ReaperOffDialogProps) {
  const name = nameOverride ?? recorderName(daw);
  const choiceApi = usePort('dawChoice');
  const [choice, setChoice] = useState<DawChoice | null>();
  // Read again with every check, so "linked" turns into "connected" at once and the sentence under the title stays true.
  useEffect(() => {
    let live = true;
    choiceApi.dawChoice().then(
      (c) => live && setChoice(c),
      () => live && setChoice(null),
    );
    return () => {
      live = false;
    };
  }, [choiceApi, checkedAt]);
  const launch = useReaperLaunch({ daw, name, onCaps, onLaunched, pollMs, polls });
  const [checking, setChecking] = useState(false);
  const checkedFor = useSecondsSince(checkedAt);
  const heardFor = useSecondsSince(heardAt);
  const unlinked = linked === undefined ? choice?.state === 'not_linked' : !linked;
  const detail = choiceSentence(choice, name);

  const check = () => {
    setChecking(true);
    void Promise.resolve(onCheckAgain()).finally(() => setChecking(false));
  };
  const busy = launch.state.phase === 'starting' || launch.state.phase === 'waiting';
  const last = checkedFor === null ? 'Not checked yet.' : `Last checked ${checkedFor} s ago.`;
  const heard = heardFor === null ? '' : ` Last heard ${heardFor} s ago.`;

  return (
    <ResolveShell
      title={`${name === 'the DAW' ? 'The DAW' : name} is not connected`}
      description={sentence}
      onClose={onClose}
      primary={{
        label: launch.state.phase === 'waiting' ? 'Connecting…' : (startLabel ?? `Start ${name}`),
        onPress: launch.start,
        pending: busy,
        disabled: unlinked,
      }}
      secondary={{ label: 'Check again', onPress: check, pending: checking }}
    >
      {detail && <p>{detail}</p>}
      <p className="text-[var(--text-muted)]">{stillWorks}</p>
      {unlinked && (
        <p className="text-[var(--text-muted)]">
          Link the project file first.{' '}
          {onLink && (
            <Button variant="link" onClick={onLink}>
              Link in Settings
            </Button>
          )}
        </p>
      )}
      {launch.state.phase === 'refused' && (
        <p role="alert" className="text-[var(--danger-text)]">
          {name} could not be started: {launch.state.message}
        </p>
      )}
      {launch.state.phase === 'failed' && (
        <p role="alert" className="text-[var(--danger-text)]">
          {launch.state.message}
        </p>
      )}
      {children}
      {/* Only the sentence is announced; the seconds tick every second. */}
      <p className="text-[var(--text-muted)]">
        <span role="status">
          {readFailed ? `Can't tell whether ${name} is ${waitingFor === 'answer' ? 'answering' : 'connected'}.` : `Waiting for ${name} to ${waitingFor}.`}
        </span>
        {readFailed && heardFor !== null ? heard : ` ${last}`}
      </p>
    </ResolveShell>
  );
}
