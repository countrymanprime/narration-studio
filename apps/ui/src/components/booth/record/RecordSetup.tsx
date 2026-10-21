import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { DawCapabilities, DawKind } from '../../../api/contracts/daw';
import { apiErrorMessage } from '../../../api/errorMessage';
import { useToastClearance } from '../../../hooks/useToastClearance';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { InsetCard } from '../../primitives/InsetCard';
import { CheckLine } from '../../layout/CheckLine';
import { ConnectionIndicator } from '../../connection/ConnectionIndicator';
import { ConnectionResolveDialog } from '../../connection/ConnectionResolveDialog';
import { useOpenOnce } from '../../connection/useOpenOnce';
import { recordSetupFor, type RecordSetupFacts, type RecordSetupPlan } from './recordSetupModel';

/** How long a linked project's connect notice waits for the app to connect on its own before it shows the steps. */
const CONNECT_GRACE_MS = 20_000;

/**
 * The notice's frame. It shares the window with the text: it never takes more than 45% of its height, and scrolls inside when it needs more.
 * It is also a bar along the bottom, so a message rises above it (`useToastClearance`): a toast never covers the notice, the notice stays
 * visible above the toasts.
 */
function NoticeFrame({ title, titleId = 'brec-setup-title', children }: { title: ReactNode; titleId?: string; children: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);
  useToastClearance(bar);
  return (
    <div ref={bar} className="mx-5 mb-2 flex max-h-[45%] flex-col">
      <InsetCard
        as="section"
        tone="warn"
        fill
        id="brec-setup"
        aria-labelledby={titleId}
        className="flex min-h-0 flex-col gap-2 overflow-y-auto text-sm [@media(max-height:760px)]:gap-1"
      >
        <h3 id={titleId} className="font-medium text-[var(--text)]">
          {title}
        </h3>
        {children}
      </InsetCard>
    </div>
  );
}

/** What a notice says as a toast. `topic` names what the message is about, so a newer message on it replaces the old and Record becoming ready takes it away. */
type Say = (sentence: string, tone?: 'error', topic?: string) => void;

/** The topic of the messages about the DAW starting: true only until it answers or fails, so they go as soon as Record is ready. */
export const START_TOPIC = 'daw-start';

/**
 * The Booth's one-time recording setup, shown beside the Record control only while Record is unavailable for a reason the narrator
 * can fix from here (`recordSetupFor`): turning on the Experimental record capability with one click (docs/architecture/reaper-bridge.md: an explicit choice,
 * never a default), or connecting the DAW by the steps of its own guide (`dawConnectGuide`), which words them. Every button says what
 * it did or why it could not, and nothing here records or arms anything.
 */
export function RecordSetup({
  capabilities,
  facts,
  say,
  onSettings,
  onChanged,
  checkedAt,
  readFailed,
  factsFailed,
  onCheckAgain,
  graceMs = CONNECT_GRACE_MS,
}: {
  capabilities: DawCapabilities;
  facts: RecordSetupFacts;
  say: Say;
  /** Open Settings at the DAW Integration panel. */
  onSettings: () => void;
  /** Read the capabilities again after a setting the host changed. */
  onChanged: () => void;
  /** When the DAW last answered (ms since the epoch); null before it has. Shown as "Last checked N s ago". */
  checkedAt?: number | null;
  /** The last read of the DAW failed, so the notice says it cannot tell instead of giving the last answer as fact. */
  readFailed?: boolean;
  /** The link state could not be read, so the link step is not claimed missing. */
  factsFailed?: boolean;
  /** The visible Check again: a fresh read now. */
  onCheckAgain?: () => void;
  /** How long a linked project's connect notice waits for the app to connect on its own before it shows the steps. */
  graceMs?: number;
}) {
  const plan = recordSetupFor(capabilities, facts);
  if (!plan) return null;
  const check = { checkedAt, readFailed, onCheckAgain };
  if (plan.kind === 'turn-on') return <TurnOn plan={plan} say={say} onSettings={onSettings} onChanged={onChanged} check={check} />;
  if (plan.kind === 'other-project') return <OtherProject plan={plan} say={say} onSettings={onSettings} onChanged={onChanged} check={check} />;
  return (
    <Connect
      plan={plan}
      say={say}
      onSettings={onSettings}
      onChanged={onChanged}
      check={check}
      factsFailed={factsFailed}
      graceMs={graceMs}
      message={capabilities.capabilities.record?.message}
      daw={capabilities.daw}
    />
  );
}

type CheckProps = { checkedAt?: number | null; readFailed?: boolean; onCheckAgain?: () => void };

function useBusy(): [boolean, (work: () => Promise<void>) => Promise<void>] {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  }, []);
  return [busy, run];
}

function TurnOn({
  plan,
  say,
  onSettings,
  onChanged,
  check,
}: {
  plan: Extract<RecordSetupPlan, { kind: 'turn-on' }>;
  say: Say;
  onSettings: () => void;
  onChanged: () => void;
  check: CheckProps;
}) {
  const system = usePort('system');
  const [busy, run] = useBusy();
  const turnOn = () =>
    run(async () => {
      try {
        // Only Record's own toggle: the other Experimental actions stay as the narrator set them.
        await system.saveSettings('DAW', 'global', { 'capability.record': 'on' });
        say(`Record in ${plan.dawName} is on. You can turn it off again in Settings, DAW Integration.`);
        onChanged();
      } catch (error) {
        say(`Record could not be turned on: ${apiErrorMessage(error)}`, 'error');
      }
    });
  return (
    <NoticeFrame title={`Recording in ${plan.dawName} is experimental`}>
      {/* The explanation gives way first in a short window: the heading, the buttons and what the notice waits for stay. */}
      <p className="text-[var(--text-muted)] [@media(max-height:760px)]:hidden">
        {plan.inApp
          ? "It is built and tested in this app, but not yet checked on every microphone and computer, so it starts switched off. Turn it on to record; the take is saved in the project's Recordings folder."
          : `It is built and tested in this app, but not yet checked in every ${plan.dawName} setup, so it starts switched off. Turn it on to record this chapter; the take goes on the chapter's own track, after what is already there.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void turnOn()} pending={busy}>
          Turn on Record
        </Button>
        <Button variant="secondary" onClick={onSettings}>
          DAW settings
        </Button>
      </div>
      {check.onCheckAgain && (
        <CheckLine waiting={`Waiting for Record to be turned on in ${plan.dawName}`} unknown={`Record is on in ${plan.dawName}`} {...check} />
      )}
    </NoticeFrame>
  );
}

/**
 * The DAW has another project open than the one linked here, so a take would not land where the book expects it. The narrator links the
 * open project (the project picker, the same action as Settings' link of a different project file; the app writes no path the DAW
 * reports, the narrator chooses the file), or opens the linked one in the DAW; either way the next read clears this.
 */
function OtherProject({
  plan,
  say,
  onSettings,
  onChanged,
  check,
}: {
  plan: Extract<RecordSetupPlan, { kind: 'other-project' }>;
  say: Say;
  onSettings: () => void;
  onChanged: () => void;
  check: CheckProps;
}) {
  const project = usePort('project');
  const [busy, run] = useBusy();
  const { dawName } = plan;
  const linkOpen = () =>
    run(async () => {
      try {
        const result = await project.linkDawFile();
        // A closed picker is not a failure: nothing was asked for, so nothing is said.
        if (!result.selected) return;
        if (!result.linked) {
          say(result.message || 'That project file could not be linked.', 'error');
          return;
        }
        say(
          result.note
            ? `${dawName === 'the DAW' ? 'The' : dawName} project linked. ${result.note}`
            : `${dawName === 'the DAW' ? 'The' : dawName} project linked.`,
        );
        onChanged();
      } catch (error) {
        say(`The project could not be linked: ${apiErrorMessage(error)}`, 'error');
      }
    });
  return (
    <NoticeFrame title={`${dawName === 'the DAW' ? 'The DAW' : dawName} has a different project open`} titleId="brec-setup-title">
      {/* The explanation gives way first in a short window, as the other notices' do: the title, the buttons and what the notice waits for stay. */}
      <p className="text-[var(--text-muted)] [@media(max-height:760px)]:hidden">
        A take would not land in the project linked here. Open the linked project in {dawName}, or link the one that is open now.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void linkOpen()} pending={busy}>
          Link the open project
        </Button>
        <Button variant="secondary" onClick={onSettings}>
          DAW settings
        </Button>
        <span className="text-[var(--text-muted)] [@media(max-height:760px)]:hidden">Choose the project file {dawName} has open.</span>
      </div>
      {check.onCheckAgain && (
        <CheckLine waiting={`Waiting for ${dawName} to open the linked project`} unknown={`${dawName} has the linked project open`} {...check} />
      )}
    </NoticeFrame>
  );
}

function Connect({
  plan,
  say,
  onSettings,
  onChanged,
  check,
  factsFailed,
  graceMs,
  message,
  daw,
}: {
  plan: Extract<RecordSetupPlan, { kind: 'connect' }>;
  daw: DawKind;
  say: Say;
  onSettings: () => void;
  onChanged: () => void;
  check: CheckProps;
  factsFailed?: boolean;
  graceMs: number;
  /** The host's own sentence for why Record is off, when it sent one. */
  message?: string;
}) {
  const system = usePort('system');
  const { guide } = plan;
  const name = guide.dawName;
  // A launch hands its project to this app, which turns it away while it is busy (the host's `system:attached` with a reason). Nothing else on the
  // page would say why the dialog is still needed, so the dialog says it, and what to do, until a project is taken or the narrator checks again.
  const [turnedAway, setTurnedAway] = useState<string | null>(null);
  // A linked project connects on its own (the app runs the launcher in the open DAW), so the dialog waits until that has had its time.
  const [settling, setSettling] = useState(plan.linked && graceMs > 0);
  useEffect(() => {
    if (!plan.linked) return;
    const timer = window.setTimeout(() => setSettling(false), graceMs);
    return () => window.clearTimeout(timer);
  }, [plan.linked, graceMs]);
  const dialog = useOpenOnce(`reaper-off:${name}`, settling && !turnedAway);
  const reopen = dialog.reopen;
  useEffect(
    () =>
      system.subscribeProjectAttach((state) => {
        if (state.attached) setTurnedAway(null);
        else if (state.reason) setTurnedAway(state.reason);
      }),
    [system],
  );
  // A project turned away is news the narrator has to see, whether or not they closed the dialog before.
  useEffect(() => {
    if (turnedAway) reopen();
  }, [turnedAway, reopen]);
  const copy = () =>
    void navigator.clipboard
      .writeText(plan.launcherPath)
      .then(() => say('Launcher file path copied.'))
      .catch(() => say('Could not copy the launcher file path.', 'error'));
  const installStep = (
    <li>
      {guide.install}
      {plan.launcherPath ? ':' : `: ${guide.installFile}.`}
      {plan.launcherPath && (
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <code className="rounded bg-[var(--surface-2)] px-2 py-1 text-xs break-all text-[var(--text)]">{plan.launcherPath}</code>
          <Button variant="secondary" size="sm" onClick={copy}>
            Copy path
          </Button>
        </span>
      )}
      <span className="mt-1 block">{guide.installAgain}</span>
    </li>
  );
  const label = turnedAway
    ? `${name} started, project turned away`
    : settling
      ? `Connecting to ${name}…`
      : plan.notAnswering
        ? `${name} not answering`
        : `${name} not connected`;
  return (
    <>
      <div className="mx-5 mb-2 flex">
        <ConnectionIndicator id="brec-setup" label={label} onOpen={dialog.reopen} />
      </div>
      {dialog.open && (
        <ConnectionResolveDialog
          variant="reaper-off"
          daw={daw}
          name={name}
          waitingFor={plan.notAnswering ? 'answer' : 'connect'}
          sentence={
            turnedAway
              ? `${name} started, but its project was turned away.`
              : (message ?? `${name} is ${plan.notAnswering ? 'not answering' : 'not connected'}.`)
          }
          stillWorks="You can still read the script and rehearse. Record turns on here once it connects."
          checkedAt={check.checkedAt ?? null}
          readFailed={check.readFailed}
          onCheckAgain={() => {
            setTurnedAway(null);
            check.onCheckAgain?.();
          }}
          onCaps={() => onChanged()}
          onLaunched={(path) => say(`${name} is starting (${path}). Record turns on here once it connects.`, undefined, START_TOPIC)}
          startLabel={guide.launch.label}
          linked={factsFailed ? undefined : plan.linked}
          onLink={onSettings}
          onClose={dialog.close}
        >
          {turnedAway && (
            <p role="alert" className="text-[var(--danger-text)]">
              {name} started, but this app turned its project away: {turnedAway} Finish or cancel what is running, then press {guide.launch.label} again.
            </p>
          )}
          {factsFailed && <p className="text-[var(--text-muted)]">Could not read whether a project file is linked. Press Check again.</p>}
          <p className="text-[var(--text-muted)]">{plan.linked ? guide.launch.note : null}</p>
          <ol className="list-decimal space-y-2 pl-5 text-[var(--text-muted)]">
            {installStep}
            <li>{guide.run}</li>
          </ol>
        </ConnectionResolveDialog>
      )}
    </>
  );
}
