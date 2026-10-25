import { useCallback, useEffect, useRef, useState } from 'react';
import type { DawCapabilities, DawKind } from '../../../api/contracts/daw';
import { apiErrorMessage } from '../../../api/errorMessage';
import { useToastClearance } from '../../../hooks/useToastClearance';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { CheckLine } from '../../layout/CheckLine';
import { ConnectionIndicator } from '../../connection/ConnectionIndicator';
import { ConnectionResolveDialog } from '../../connection/ConnectionResolveDialog';
import { useOpenOnce, useReopenOnAsk } from '../../connection/useOpenOnce';
import { ResolveShell } from '../../connection/ResolveShell';
import { recordSetupFor, type RecordSetupFacts, type RecordSetupPlan } from './recordSetupModel';

/** How long a linked project's connect notice waits for the app to connect on its own before it shows the steps. */
const CONNECT_GRACE_MS = 20_000;

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
  asked = 0,
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
  /** How many times Record was pressed while it could not start: each press opens the dialog of the notice that is up. */
  asked?: number;
}) {
  const plan = recordSetupFor(capabilities, facts);
  if (!plan) return null;
  const check = { checkedAt, readFailed, onCheckAgain };
  if (plan.kind === 'turn-on') return <TurnOn plan={plan} say={say} onSettings={onSettings} onChanged={onChanged} check={check} asked={asked} />;
  if (plan.kind === 'other-project') return <OtherProject plan={plan} say={say} onSettings={onSettings} onChanged={onChanged} check={check} asked={asked} />;
  return (
    <Connect
      asked={asked}
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

/** Where a notice's chip stands: above the footer, beside nothing, so a message rises above it (`useToastClearance`) and never covers it. */
export function NoticeChip({ id, label, onOpen }: { id: string; label: string; onOpen: () => void }) {
  const bar = useRef<HTMLDivElement>(null);
  useToastClearance(bar);
  return (
    <div ref={bar} className="mx-[var(--page-gutter)] mb-2 flex">
      <ConnectionIndicator id={id} label={label} onOpen={onOpen} />
    </div>
  );
}

/**
 * Record's capability is Experimental and switched off. The chip above the footer says so; the dialog explains and turns it on with one click.
 * It opens on a press of Record (or the chip), not by itself: Record being off is how every new project starts, not news.
 */
function TurnOn({
  plan,
  say,
  onSettings,
  onChanged,
  check,
  asked,
}: {
  plan: Extract<RecordSetupPlan, { kind: 'turn-on' }>;
  say: Say;
  onSettings: () => void;
  onChanged: () => void;
  check: CheckProps;
  asked: number;
}) {
  const system = usePort('system');
  const [busy, run] = useBusy();
  const [open, setOpen] = useState(false);
  const reopen = useCallback(() => setOpen(true), []);
  useReopenOnAsk(asked, reopen);
  const turnOn = () =>
    run(async () => {
      try {
        // Only Record's own toggle: the other Experimental actions stay as the narrator set them.
        await system.saveSettings('DAW', 'global', { 'capability.record': 'on' });
        say(`Record in ${plan.dawName} is on. You can turn it off again in Settings, DAW Integration.`);
        setOpen(false);
        onChanged();
      } catch (error) {
        say(`Record could not be turned on: ${apiErrorMessage(error)}`, 'error');
      }
    });
  return (
    <>
      <NoticeChip id="brec-setup" label="Record is switched off" onOpen={reopen} />
      {open && (
        <ResolveShell
          title={`Recording in ${plan.dawName} is experimental`}
          description={
            plan.inApp
              ? "It is built and tested in this app, but not yet checked on every microphone and computer, so it starts switched off. Turn it on to record; the take is saved in the project's Recordings folder."
              : `It is built and tested in this app, but not yet checked in every ${plan.dawName} setup, so it starts switched off. Turn it on to record this chapter; the take goes on the chapter's own track, after what is already there.`
          }
          onClose={() => setOpen(false)}
          primary={{ label: 'Turn on Record', onPress: () => void turnOn(), pending: busy }}
          // An in-app recorder's switch is this app's own setting: nothing outside can turn it on, so there is nothing to wait for or
          // check again, and no DAW to name; its secondary opens the recording settings instead (alignment audit R4BO1-2).
          secondary={plan.inApp ? { label: 'Recording settings', onPress: onSettings } : { label: 'Check again', onPress: () => check.onCheckAgain?.() }}
        >
          {!plan.inApp && (
            <p>
              <Button variant="secondary" onClick={onSettings}>
                DAW settings
              </Button>
            </p>
          )}
          {check.onCheckAgain && !plan.inApp && (
            <CheckLine
              waiting={`Waiting for Record to be turned on in ${plan.dawName}`}
              unknown={`Record is on in ${plan.dawName}`}
              checkedAt={check.checkedAt}
              readFailed={check.readFailed}
            />
          )}
        </ResolveShell>
      )}
    </>
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
  asked,
}: {
  plan: Extract<RecordSetupPlan, { kind: 'other-project' }>;
  say: Say;
  onSettings: () => void;
  onChanged: () => void;
  check: CheckProps;
  asked: number;
}) {
  const project = usePort('project');
  const [busy, run] = useBusy();
  const { dawName } = plan;
  const Name = dawName === 'the DAW' ? 'The DAW' : dawName;
  // A take would land in the wrong project: that is news, so the dialog opens by itself once, and on every press of Record.
  const dialog = useOpenOnce(`other-project:${dawName}`, false, { forgetOnUnmount: true });
  useReopenOnAsk(asked, dialog.reopen);
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
        say(result.note ? `${Name} project linked. ${result.note}` : `${Name} project linked.`);
        dialog.close();
        onChanged();
      } catch (error) {
        say(`The project could not be linked: ${apiErrorMessage(error)}`, 'error');
      }
    });
  return (
    <>
      <NoticeChip id="brec-setup" label={`${Name} has another project open`} onOpen={dialog.reopen} />
      {dialog.open && (
        <ResolveShell
          title={`${Name} has a different project open`}
          description={`A take would not land in the project linked here. Open the linked project in ${dawName}, or link the one that is open now.`}
          onClose={dialog.close}
          primary={{ label: 'Link the open project', onPress: () => void linkOpen(), pending: busy }}
          secondary={{ label: 'Check again', onPress: () => check.onCheckAgain?.() }}
        >
          {/* The caption sits with the action it describes; DAW settings, which only shows the linked file, has its own line. */}
          <p className="text-[var(--text-muted)]">Link the open project asks you to choose the project file {dawName} has open.</p>
          <p className="flex flex-wrap items-center gap-2 text-[var(--text-muted)]">
            The file linked now is in
            <Button variant="secondary" onClick={onSettings}>
              DAW settings
            </Button>
          </p>
          {check.onCheckAgain && (
            <CheckLine
              waiting={`Waiting for ${dawName} to open the linked project`}
              unknown={`${dawName} has the linked project open`}
              checkedAt={check.checkedAt}
              readFailed={check.readFailed}
            />
          )}
        </ResolveShell>
      )}
    </>
  );
}

function Connect({
  asked,
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
  asked: number;
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
  useReopenOnAsk(asked, reopen);
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
          <Button variant="secondary" onClick={copy}>
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
      <NoticeChip id="brec-setup" label={label} onOpen={dialog.reopen} />
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
              {turnedAway} Finish or cancel what is running, then press {guide.launch.label} again.
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
