import { startingDetail, startingTitle } from '../../daw/dawSession';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { apiErrorMessage } from '../../api/errorMessage';
import type { DawCapabilities, DawChoice, DawKind } from '../../api/contracts/daw';
import { useDawState } from '../../daw/useDawSession';
import { usePort } from '../../ports/usePort';
import { recorderName } from '../../studio/dawNames';
import { useSecondsSince } from '../layout/CheckLine';
import { ResolveShell } from './ResolveShell';
import { useLinkDawFile } from './linkDawFile';
import { useReaperLaunch } from './useReaperLaunch';

/** What the host knows about the project's DAW beyond "not answering": closed, open with no bridge, or answered once and went quiet. */
function choiceSentence(choice: DawChoice | null | undefined, name: string): string | null {
  switch (choice?.state) {
    case 'linked':
      return `The project is linked, but ${name} has not connected: it is closed, or its bridge has not started yet.`;
    case 'starting':
      return startingDetail(name);
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
  /** The host started the DAW (`DawLaunch` answered) with this executable path. */
  onLaunched?: (path: string) => void;
  /** How long the dialog waits for the DAW to answer after Start before it says it has not (stories and tests shorten it). */
  waitMs?: number;
  /** The way out the header X takes. */
  onClose: () => void;
  /** More for the body: the Booth's connect steps. */
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
  onLaunched,
  waitMs,
  onClose,
  children,
}: ReaperOffDialogProps) {
  const name = nameOverride ?? recorderName(daw);
  const choiceApi = usePort('dawChoice');
  const [ownChoice, setChoice] = useState<DawChoice | null>();
  // The session's reading is what the chip and the page say, so it is what the dialog says too, the moment it opens; this dialog's own read is only for when the session has none.
  const sessionChoice = useDawState((state) => state.choice);
  const choice = sessionChoice ?? ownChoice;
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
  const launch = useReaperLaunch({ daw, name, onCaps, onLaunched, waitMs });
  const [checking, setChecking] = useState(false);
  // "Link project file…" is the app's one link action (the same one the engine panel and Settings press); the dialog follows it with a check, so the page
  // and every other page that draws this dialog read the new link without a reload.
  const linkFile = useLinkDawFile();
  const [linking, setLinking] = useState(false);
  const [linkProblem, setLinkProblem] = useState('');
  const problemRef = useRef<HTMLParagraphElement>(null);
  // In a small window the dialog body scrolls and the sentence lands under the fold: bring it into view when it appears.
  useEffect(() => {
    if (linkProblem) problemRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [linkProblem]);
  const checkedFor = useSecondsSince(checkedAt);
  const heardFor = useSecondsSince(heardAt);
  const unlinked = linked === undefined ? choice?.state === 'not_linked' : !linked;
  const detail = choiceSentence(choice, name);
  const starting = choice?.state === 'starting';

  const check = () => {
    setChecking(true);
    void Promise.resolve(onCheckAgain()).finally(() => setChecking(false));
  };
  const link = () => {
    setLinking(true);
    setLinkProblem('');
    void linkFile()
      .then((outcome) => {
        if (outcome.kind === 'linked') check();
        else if (outcome.kind === 'refused') setLinkProblem(outcome.message);
        else if (outcome.kind === 'busy') setLinkProblem('The app is already choosing a project file. Finish or cancel that picker first.');
        else if (outcome.kind === 'failed') setLinkProblem(`The project file could not be linked: ${apiErrorMessage(outcome.error)}`);
      })
      .finally(() => setLinking(false));
  };
  const busy = launch.state.phase === 'starting' || launch.state.phase === 'waiting';
  const start = {
    label: launch.state.phase === 'waiting' ? 'Connecting…' : (startLabel ?? `Start ${name}`),
    onPress: launch.start,
    // The host is already starting the DAW: a second press would be a second launch, so Start waits with it (#3668).
    pending: busy || starting,
    disabled: unlinked,
  };
  const last = checkedFor === null ? 'Not checked yet.' : `Last checked ${checkedFor} s ago.`;
  const heard = heardFor === null ? '' : ` Last heard ${heardFor} s ago.`;

  return (
    <ResolveShell
      // While the host is starting the DAW the dialog says so and does not tell the narrator to open it: that is what the app is doing (#3668).
      title={starting ? startingTitle(name) : `${name === 'the DAW' ? 'The DAW' : name} is not connected`}
      description={starting ? (detail ?? sentence) : sentence}
      onClose={onClose}
      primary={unlinked ? { label: 'Link project file…', onPress: link, pending: linking } : start}
      extra={unlinked ? start : undefined}
      secondary={{ label: 'Check again', onPress: check, pending: checking }}
    >
      {!starting && detail && <p>{detail}</p>}
      {/* The host's own account of a start that went nowhere: REAPER was opened but its bridge never answered. */}
      {choice?.bridge?.problem && <p>{choice.bridge.problem}</p>}
      <p className="text-[var(--text-muted)]">{stillWorks}</p>
      {linkProblem && (
        <p ref={problemRef} role="alert" className="text-[var(--danger-text)]">
          {linkProblem}
        </p>
      )}
      {launch.state.phase === 'refused' && (
        <p role="alert" className="text-[var(--danger-text)]">
          {name} could not be started: {launch.state.message}
        </p>
      )}
      {/* While the host says it is starting the DAW, "has not answered yet" would be false: it has not had its time yet. */}
      {launch.state.phase === 'failed' && !starting && (
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
