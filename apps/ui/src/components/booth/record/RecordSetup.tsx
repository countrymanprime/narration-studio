import { useCallback, useEffect, useState } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { InsetCard } from '../../primitives/InsetCard';
import { recordSetupFor, type RecordSetupFacts, type RecordSetupPlan } from './recordSetup';

const NO_FACTS: RecordSetupFacts = { dawFileLinked: false, launcherPath: '' };

/**
 * The host's link facts for the setup steps: whether an .rpp is linked and where the launcher file is. They are read when the Booth
 * opens and again whenever the DAW's reachability changes, since a project linked or the app attached by the DAW changes them.
 */
export function useRecordSetupFacts(reachable: boolean | undefined): RecordSetupFacts {
  const system = usePort('system');
  const [facts, setFacts] = useState<RecordSetupFacts>(NO_FACTS);
  useEffect(() => {
    let live = true;
    system
      .bootstrap()
      .then((data) => live && setFacts({ dawFileLinked: data.dawFileLinked, launcherPath: data.runtime.Reaper?.launcherPath ?? '' }))
      // Without the facts the steps still show, with the link step and no path to copy: the safe side of both.
      .catch(() => live && setFacts(NO_FACTS));
    return () => {
      live = false;
    };
  }, [system, reachable]);
  return facts;
}

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
}: {
  capabilities: DawCapabilities;
  facts: RecordSetupFacts;
  say: Say;
  /** Open Settings at the DAW Integration panel. */
  onSettings: () => void;
  /** Read the capabilities again after a setting the host changed. */
  onChanged: () => void;
}) {
  const plan = recordSetupFor(capabilities, facts);
  if (!plan) return null;
  return plan.kind === 'turn-on' ? (
    <TurnOn plan={plan} say={say} onSettings={onSettings} onChanged={onChanged} />
  ) : (
    <Connect plan={plan} say={say} onSettings={onSettings} onChanged={onChanged} />
  );
}

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
}: {
  plan: Extract<RecordSetupPlan, { kind: 'turn-on' }>;
  say: Say;
  onSettings: () => void;
  onChanged: () => void;
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
    <InsetCard as="section" tone="warn" fill id="brec-setup" aria-labelledby="brec-setup-title" className="mx-5 mb-2 flex flex-col gap-2 text-sm">
      <h3 id="brec-setup-title" className="font-medium text-[var(--text)]">
        Recording in {plan.dawName} is experimental
      </h3>
      <p className="text-[var(--text-muted)]">
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
    </InsetCard>
  );
}

function Connect({
  plan,
  say,
  onSettings,
  onChanged,
}: {
  plan: Extract<RecordSetupPlan, { kind: 'connect' }>;
  say: Say;
  onSettings: () => void;
  onChanged: () => void;
}) {
  const system = usePort('system');
  const project = usePort('project');
  const [busy, run] = useBusy();
  const { guide } = plan;
  const name = guide.dawName;
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
  return (
    <InsetCard as="section" tone="warn" fill id="brec-setup" aria-labelledby="brec-setup-title" className="mx-5 mb-2 flex flex-col gap-2 text-sm">
      <h3 id="brec-setup-title" className="font-medium text-[var(--text)]">
        {plan.notAnswering ? `${name} is not answering` : `Connect ${name} to record`}
      </h3>
      <ol className="list-decimal space-y-2 pl-5 text-[var(--text-muted)]">
        {!plan.linked && (
          <li>
            {guide.link}{' '}
            <Button variant="secondary" size="sm" onClick={onSettings}>
              Link in Settings
            </Button>
          </li>
        )}
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
        <li>{guide.run}</li>
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void openAndConnect()} pending={busy} disabled={!plan.linked}>
          {guide.launch.label}
        </Button>
        <span className="text-[var(--text-muted)]">{plan.linked ? guide.launch.note : 'Link the project file first.'}</span>
      </div>
    </InsetCard>
  );
}
