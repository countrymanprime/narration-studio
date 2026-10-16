import { useCallback, useEffect, useState } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { describeApiError } from '../../../api/errorMessage';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { InsetCard } from '../../primitives/InsetCard';
import { recordSetupFor, type RecordSetupFacts, type RecordSetupPlan } from './recordSetup';

/** Seconds since `at`, re-rendered every second while mounted; null when there is no time. */
function useSecondsSince(at: number | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return at == null ? null : Math.max(0, Math.round((now - at) / 1000));
}

/** What the notice is waiting for and when it last looked, with the Check again that forces a fresh read. */
function CheckLine({
  waiting,
  unknown,
  checkedAt,
  readFailed,
  onCheckAgain,
}: {
  waiting: string;
  unknown: string;
  checkedAt?: number | null;
  readFailed?: boolean;
  onCheckAgain?: () => void;
}) {
  const seconds = useSecondsSince(checkedAt);
  const last = seconds === null ? 'Not checked yet' : `Last checked ${seconds} s ago`;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[var(--text-muted)]">
      {/* Only the sentence that changes with the state is announced; the seconds tick every second and are not. */}
      <span role="status">{readFailed ? `Can't tell whether ${unknown}.` : `${waiting}.`}</span>
      <span>{last}.</span>
      {onCheckAgain && (
        <Button variant="secondary" size="sm" onClick={onCheckAgain}>
          Check again
        </Button>
      )}
    </div>
  );
}

/** A window short enough that the notice gives way to the text (the same height the explanation hides at). */
const SHORT_WINDOW = '(max-height: 760px)';

/** The notice shares the window with the text: it never takes more than 45% of its height, and scrolls inside when it needs more. */
const NOTICE_CLASS = 'mx-5 mb-2 flex max-h-[45%] flex-col gap-2 overflow-y-auto text-sm';

type Say = (sentence: string, tone?: 'error') => void;

/**
 * The Booth's one-time recording setup, shown beside the Record control only while Record is unavailable for a reason the narrator
 * can fix from here (`recordSetupFor`): turning on the Experimental record capability with one click (ADR 0230: an explicit choice,
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
}) {
  const plan = recordSetupFor(capabilities, facts);
  if (!plan) return null;
  const check = { checkedAt, readFailed, onCheckAgain };
  return plan.kind === 'turn-on' ? (
    <TurnOn plan={plan} say={say} onSettings={onSettings} onChanged={onChanged} check={check} />
  ) : (
    <Connect plan={plan} say={say} onSettings={onSettings} onChanged={onChanged} check={check} factsFailed={factsFailed} />
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
        say(`Record could not be turned on: ${describeApiError(error)}`, 'error');
      }
    });
  return (
    <InsetCard as="section" tone="warn" fill id="brec-setup" aria-labelledby="brec-setup-title" className={NOTICE_CLASS}>
      <h3 id="brec-setup-title" className="font-medium text-[var(--text)]">
        Recording in {plan.dawName} is experimental
      </h3>
      {/* The explanation gives way first in a short window: the heading, the buttons and what the notice waits for stay. */}
      <p className="text-[var(--text-muted)] [@media(max-height:760px)]:hidden">
        It is built and tested in this app, but not yet checked in every {plan.dawName} setup, so it starts switched off. Turn it on to record this chapter; the
        take goes on the chapter&apos;s own track, after what is already there.
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
    </InsetCard>
  );
}

function Connect({
  plan,
  say,
  onSettings,
  onChanged,
  check,
  factsFailed,
}: {
  plan: Extract<RecordSetupPlan, { kind: 'connect' }>;
  say: Say;
  onSettings: () => void;
  onChanged: () => void;
  check: CheckProps;
  factsFailed?: boolean;
}) {
  const system = usePort('system');
  const project = usePort('project');
  const [busy, run] = useBusy();
  const { guide } = plan;
  const name = guide.dawName;
  // A launch hands its project to this app, which turns it away while it is busy (the host's `system:attached` with a reason). Nothing else on the
  // page would say why the notice is still here, so the notice says it, and what to do, until a project is taken or the narrator checks again.
  const [turnedAway, setTurnedAway] = useState<string | null>(null);
  useEffect(
    () =>
      system.subscribeProjectAttach((state) => {
        if (state.attached) setTurnedAway(null);
        else if (state.reason) setTurnedAway(state.reason);
      }),
    [system],
  );
  // In a short window the steps fold into one line the narrator opens, so the notice leaves the text its room.
  const short = useMediaQuery(SHORT_WINDOW, false);
  const copy = () =>
    void navigator.clipboard
      .writeText(plan.launcherPath)
      .then(() => say('Launcher file path copied.'))
      .catch(() => say('Could not copy the launcher file path.', 'error'));
  const openAndConnect = () =>
    run(async () => {
      try {
        await system.saveSettings('DAW', 'global', guide.launch.settings);
        const started = await project.launchDaw();
        say(`${name} is starting (${started.path}). Record turns on here once it connects.`);
        onChanged();
      } catch (error) {
        say(`${name} could not be started: ${describeApiError(error)}`, 'error');
      }
    });
  const linkStep = factsFailed ? (
    'Could not read whether a project file is linked. Press Check again.'
  ) : (
    <>
      {guide.link}{' '}
      <Button variant="secondary" size="sm" onClick={onSettings}>
        Link in Settings
      </Button>
    </>
  );
  const installStep = (
    <li>
      {guide.install}
      {plan.launcherPath ? ':' : `: ${guide.installFile}.`}
      {plan.launcherPath && (
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <code className="rounded bg-[var(--surface)] px-2 py-1 text-xs break-all text-[var(--text)]">{plan.launcherPath}</code>
          <Button variant="secondary" size="sm" onClick={copy}>
            Copy path
          </Button>
        </span>
      )}
      <span className="mt-1 block">{guide.installAgain}</span>
    </li>
  );
  return (
    <InsetCard as="section" tone="warn" fill id="brec-setup" aria-labelledby="brec-setup-title" className={NOTICE_CLASS}>
      <h3 id="brec-setup-title" className="font-medium text-[var(--text)]">
        {plan.notAnswering ? `${name} is not answering` : `Connect ${name} to record`}
      </h3>
      {turnedAway && (
        <p role="alert" className="text-[var(--danger-text)]">
          {name} started, but this app turned its project away: {turnedAway} Finish or cancel what is running, then press {guide.launch.label} again.
        </p>
      )}
      {short ? (
        // In a short window the steps fold into one line the narrator opens; the one that needs a button now (the link) stays out in the open.
        <>
          {!plan.linked && <p className="text-[var(--text-muted)]">{linkStep}</p>}
          <details key="short" className="text-[var(--text-muted)]">
            <summary className="cursor-pointer text-[var(--text)]">Steps to connect</summary>
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              {installStep}
              <li>{guide.run}</li>
            </ol>
          </details>
        </>
      ) : (
        <ol className="list-decimal space-y-2 pl-5 text-[var(--text-muted)]">
          {!plan.linked && <li>{linkStep}</li>}
          {installStep}
          <li>{guide.run}</li>
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void openAndConnect()} pending={busy} disabled={!plan.linked}>
          {guide.launch.label}
        </Button>
        {/* What the button does gives way in a short window; why it is off ("Link the project file first.") never does. */}
        <span className={`text-[var(--text-muted)] ${plan.linked ? '[@media(max-height:760px)]:hidden' : ''}`}>
          {plan.linked ? guide.launch.note : 'Link the project file first.'}
        </span>
      </div>
      {check.onCheckAgain && (
        <CheckLine
          waiting={`Waiting for ${name} to ${plan.notAnswering ? 'answer' : 'connect'}`}
          unknown={`${name} is ${plan.notAnswering ? 'answering' : 'connected'}`}
          {...check}
          onCheckAgain={() => {
            setTurnedAway(null);
            check.onCheckAgain?.();
          }}
        />
      )}
    </InsetCard>
  );
}
