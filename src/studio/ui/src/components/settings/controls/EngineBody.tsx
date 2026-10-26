import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChoosableDaw, DawChoice, DawChoiceOption } from '../../../api/contracts/daw';
import { apiErrorMessage, describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { ConfirmDialog } from '../../primitives/ConfirmDialog';
import { InsetCard } from '../../primitives/InsetCard';
import { RadioGroup, type RadioOption } from '../../primitives/RadioGroup';
import { StatusBadge, type StatusTone } from '../../primitives/StatusBadge';
import { useSecondsSince } from '../../layout/CheckLine';
import { engineChanged } from '../data/engineSignal';
import { AudacityLinkCard } from '../../engine/AudacityLinkCard';
import { useAudacityLink } from '../../engine/useAudacityLink';
import { useSettingsHost } from '../row/SettingsHost';

/** One engine's honest state under its radio: not found on this computer, or why it cannot record now, in the host's sentence. */
function optionDescription(option: DawChoiceOption): ReactNode {
  const lines: ReactNode[] = [];
  if (option.installed === false) {
    lines.push(
      <span key="installed">
        {option.daw === 'Audacity'
          ? 'Audacity 3 was not found on this computer. Install it to record with it. '
          : `${option.daw} was not found on this computer. Install it, or set where it is under Advanced, in the REAPER program setting below. `}
      </span>,
    );
  }
  const { record } = option;
  if (!record.available && record.message) lines.push(<span key="record">{record.message}</span>);
  return lines.length > 0 ? <>{lines}</> : undefined;
}

/** Whether the project records into a DAW whose project file is linked: then the built-in recorder is a last resort, behind a confirm. */
function dawLinked(choice: DawChoice): boolean {
  return choice.daw !== 'Built-in' && choice.daw !== 'none' && choice.state !== 'not_linked' && (choice.daw !== 'REAPER' || choice.linkedFile !== null);
}

function optionsFor(choice: DawChoice, disabled: boolean): RadioOption<ChoosableDaw>[] {
  const linked = dawLinked(choice);
  return choice.options.map((option) => {
    const lastResort = linked && option.daw === 'Built-in';
    const detail = optionDescription(option);
    return {
      value: option.daw,
      label: option.daw === 'Built-in' ? 'Built-in recorder. Recordings live in the app.' : `${option.daw}. Recordings live in the DAW.`,
      description: (detail || lastResort) && (
        <span className="text-[0.8125rem]">
          {lastResort && `Only if ${choice.daw} cannot be used at all: takes already in ${choice.daw} stay there and this app stops reading them. `}
          {detail}
        </span>
      ),
      disabled,
    };
  });
}

type Status = { tone: StatusTone; title: string; detail: string };

/** What the connection card says, from the host's state for the project's engine. `undefined`: nothing to show (no engine, or none
 * chosen yet). A DAW short of connected is the app's to connect: the card says what the app is doing, never steps for the narrator,
 * and never offers another recorder. */
function statusOf(choice: DawChoice, opts: { projectMatches?: boolean; startedFor?: number }): Status | undefined {
  const { daw, state, foundFiles } = choice;
  if (state === 'app') return { tone: 'neutral', title: 'Built-in recorder', detail: 'Recording happens in the app. Nothing to connect.' };
  if (state === 'none') return undefined;
  const linkedFile = daw === 'REAPER' ? choice.linkedFile : null;
  const installed = choice.options.find((option) => option.daw === daw)?.installed;
  if (installed === false)
    return { tone: 'warning', title: 'Not found', detail: `${daw} was not found on this computer. Install it, and this app connects to it.` };
  if (state === 'connected') {
    const mismatch = daw === 'REAPER' && opts.projectMatches === false ? ' Its open project does not match the one linked here.' : '';
    return {
      tone: 'success',
      title: `${daw} linked`,
      detail: `${linkedFile ? `Linked to ${linkedFile}. ` : ''}${daw} is open and answering. Record goes through ${daw}.${mismatch}`,
    };
  }
  if (state === 'not_linked') {
    return {
      tone: 'warning',
      title: `${daw} not linked`,
      detail:
        foundFiles.length === 1
          ? `${foundFiles[0]} is in the project folder.`
          : foundFiles.length > 1
            ? `${foundFiles.length} ${daw} project files are in the project folder. Choose the one this project records into.`
            : `No ${daw} project file is in the project folder yet. Save one there from ${daw}, then link it.`,
    };
  }
  const linked = linkedFile ? `Linked to ${linkedFile}. ` : '';
  if (state === 'starting') {
    const since = opts.startedFor === undefined ? '' : ` Opened ${opts.startedFor} s ago.`;
    return {
      tone: 'neutral',
      title: `Starting ${daw}`,
      detail: `${linked}The app opened ${daw} and connects on its own once ${daw} has the project open.${since}`,
    };
  }
  const off = choice.launcherAutoStart ? '' : ` "Start the launcher script with REAPER" is off below, so ${daw} does not connect until it is on.`;
  if (state === 'linked') return { tone: 'neutral', title: 'Not running', detail: `${linked}${daw} is not running. Start it here and it connects.${off}` };
  return { tone: 'warning', title: 'Not answering', detail: `${linked}${daw} is not answering. Start it here and it connects.${off}` };
}

/** The app's bridge in REAPER, as the host reports it: installed and started by REAPER itself, or the host's sentence for what is wrong. */
function BridgeLine({ choice }: { choice: DawChoice }) {
  const { bridge } = choice;
  if (!bridge) return null;
  if (bridge.problem) {
    return (
      <p role="status" data-bridge="problem" className="text-[0.8125rem] text-[var(--text-muted)]">
        {bridge.problem}
      </p>
    );
  }
  if (!bridge.installed || !bridge.startsWithReaper) return null;
  return (
    <p data-bridge="ok" className="text-[0.8125rem] text-[var(--text-muted)]">
      The app keeps its bridge in REAPER’s Scripts folder and REAPER starts it each time it opens, so there is nothing to set up in REAPER.
    </p>
  );
}

/**
 * The body of "Record with": the project's engine as radios (REAPER, Audacity, the built-in recorder), each with its honest state, and a
 * connection card with the one action that moves the project on (link the .rpp found in the folder, choose a file, start the DAW) and
 * Test connection, which reads the host again. The host refuses a choice with its own sentence; the choice stays where it was. A DAW that is
 * not running stays chosen.
 */
export function EngineBody() {
  const dawChoice = usePort('dawChoice');
  const dawEvents = usePort('dawCapabilities');
  const project = usePort('project');
  const catalog = usePort('dawCatalog');
  const { data, notify, onLinkDawFile } = useSettingsHost();
  const audacity = useAudacityLink();
  const [choice, setChoice] = useState<DawChoice>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmBuiltIn, setConfirmBuiltIn] = useState(false);
  const [test, setTest] = useState<{ phase: 'idle' | 'testing' | 'ok' | 'bad'; text: string; file?: string | null; at?: number }>({ phase: 'idle', text: '' });
  const live = useRef(true);
  const testedFor = useSecondsSince(test.at);
  const startedAt = choice?.starting ? Date.parse(choice.starting.since) : undefined;
  const startedFor = useSecondsSince(startedAt !== undefined && Number.isFinite(startedAt) ? startedAt : undefined);

  const read = useCallback(
    () =>
      dawChoice.dawChoice().then(
        (next) => {
          if (live.current) setChoice(next);
          return next;
        },
        (failure: unknown) => {
          if (live.current) setError(`How this project records could not be read: ${apiErrorMessage(failure)}`);
          return undefined;
        },
      ),
    [dawChoice],
  );

  useEffect(() => {
    live.current = true;
    void read();
    const unsubscribe = dawEvents.subscribeDawCapabilities(() => void read());
    return () => {
      live.current = false;
      unsubscribe();
    };
  }, [read, dawEvents, data.dawFileLinked]);

  const act = useCallback(async (call: () => Promise<DawChoice>) => {
    setBusy(true);
    try {
      setChoice(await call());
      engineChanged();
      setError(undefined);
      setTest({ phase: 'idle', text: '' });
    } catch (failure) {
      setError(apiErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }, []);

  const start = async () => {
    setStarting(true);
    try {
      const result = await project.launchDaw();
      notify(`Started ${choice?.daw ?? 'the DAW'} (${result.path}).`);
    } catch (failure) {
      notify(describeApiError(failure), 'error');
    } finally {
      setStarting(false);
    }
  };

  const check = async () => {
    setTest({ phase: 'testing', text: 'Testing…' });
    const began = performance.now();
    const next = await read();
    if (!next) return setTest({ phase: 'bad', text: 'The connection could not be read.' });
    setError(undefined);
    const file = next.daw === 'REAPER' ? next.linkedFile : null;
    setTest(
      next.state === 'connected'
        ? { phase: 'ok', text: `Connected. Answered in ${Math.max(1, Math.round(performance.now() - began))} ms.`, file, at: Date.now() }
        : { phase: 'bad', text: `No answer from ${next.daw}.`, file, at: Date.now() },
    );
  };

  const getIt = async () => {
    try {
      const entries = await catalog.dawCatalogList();
      const entry = entries.find((candidate) => candidate.name === choice?.daw) ?? entries[0];
      if (entry) await catalog.dawCatalogOpenDownloadPage(entry.id);
    } catch (failure) {
      notify(describeApiError(failure), 'error');
    }
  };

  if (!choice) {
    return error ? (
      <p role="alert" className="text-[0.8125rem] text-[var(--danger-text)]">
        {error}
      </p>
    ) : (
      <p className="text-[0.8125rem] text-[var(--text-muted)]">Reading how this project records…</p>
    );
  }

  const { daw, state, foundFiles } = choice;
  const linkedFile = daw === 'REAPER' ? choice.linkedFile : null;
  const overridden = choice.source === 'launch' && choice.chosen !== null && choice.chosen !== daw;
  const status = statusOf(choice, {
    projectMatches: data.dawReachable ? data.dawProjectMatches : undefined,
    startedFor: choice.starting ? (startedFor ?? undefined) : undefined,
  });
  const notInstalled = choice.options.find((option) => option.daw === daw)?.installed === false;
  const linkable = state === 'not_linked' || linkedFile !== null;
  const choose = (next: ChoosableDaw) => {
    if (next === 'Built-in' && next !== daw && dawLinked(choice)) setConfirmBuiltIn(true);
    else void act(() => dawChoice.dawChoose(next));
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      {!choice.hasProject && <p className="text-[0.8125rem] text-[var(--text-muted)]">Open a project to choose how it records.</p>}
      <RadioGroup<ChoosableDaw>
        label="Record with"
        value={daw === 'none' ? ('' as ChoosableDaw) : daw}
        onChange={choose}
        options={optionsFor(choice, busy || !choice.hasProject)}
      />
      {overridden && (
        <p className="text-[0.8125rem] text-[var(--text-muted)]">
          This window was opened from {daw}, so it records with {daw} until the app is opened another way. The choice saved for this project is {choice.chosen}.
        </p>
      )}
      {daw === 'Audacity' && state !== 'app' && <AudacityLinkCard view={audacity} notify={notify} />}
      {daw !== 'Audacity' && status && (
        // The card is on the card surface with a border, so a neutral badge's own fill shows (alignment audit XSE2-7). Its buttons are one row in
        // one order, the step that moves the project on first and Test connection last; what a test found is the line under them (XSE2-6).
        <InsetCard role="group" aria-label="Connection" data-daw-status={state} className="flex flex-col items-start gap-2 text-[0.8125rem]">
          <StatusBadge tone={status.tone} label={status.title} />
          <span className="max-w-[60ch] text-[var(--text-muted)]">{status.detail}</span>
          <div className="flex flex-wrap items-center gap-2">
            {!notInstalled && state === 'not_linked' && foundFiles.length === 1 && (
              <Button variant="primary" size="sm" disabled={busy} onClick={() => void act(() => dawChoice.dawLinkFound())}>
                Link {foundFiles[0]}
              </Button>
            )}
            {!notInstalled && linkedFile !== null && (state === 'linked' || state === 'not_running') && (
              <Button variant="secondary" size="sm" disabled={busy || starting} onClick={() => void start()}>
                {starting ? `Starting ${daw}…` : `Start ${daw}`}
              </Button>
            )}
            {notInstalled && daw === 'REAPER' && (
              <Button variant="secondary" size="sm" onClick={() => void getIt()}>
                Get REAPER
              </Button>
            )}
            {!notInstalled && linkable && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={onLinkDawFile}>
                {linkedFile ? 'Change linked file' : 'Choose a project file'}
              </Button>
            )}
            {state !== 'app' && (
              <Button variant="secondary" size="sm" disabled={test.phase === 'testing'} onClick={() => void check()}>
                {notInstalled ? 'Check again' : 'Test connection'}
              </Button>
            )}
          </div>
          <span className="flex flex-wrap gap-x-2 text-[var(--text-muted)]">
            <span role="status">{test.phase === 'testing' || test.file === linkedFile ? test.text : ''}</span>
            {test.at !== undefined && test.phase !== 'testing' && test.file === linkedFile && <span>Last checked {testedFor} s ago.</span>}
          </span>
        </InsetCard>
      )}
      {error && (
        <p role="alert" className="text-[0.8125rem] text-[var(--danger-text)]">
          {error}
        </p>
      )}
      {daw === 'REAPER' && <BridgeLine choice={choice} />}
      {confirmBuiltIn && (
        <ConfirmDialog
          title={`Stop recording with ${daw}?`}
          body={
            <>
              <p>
                New takes would be recorded by this app and kept in the project’s own folder, not in {daw}
                {linkedFile ? ` (${linkedFile})` : ''}.
              </p>
              <p className="mt-2">
                Takes already recorded in {daw} stay in {daw}, but the Booth, Editing and Proof stop reading them, and nothing from {daw} reaches the app while
                the built-in recorder is chosen. The link to {daw} is kept: choosing {daw} again brings those takes back.
              </p>
              <p className="mt-2">Use this only when {daw} cannot be used at all.</p>
            </>
          }
          confirmLabel="Switch to the built-in recorder"
          confirmVariant="danger"
          cancelLabel={`Keep ${daw}`}
          focusCancel
          confirm={() => {
            setConfirmBuiltIn(false);
            void act(() => dawChoice.dawChoose('Built-in'));
          }}
          cancel={() => setConfirmBuiltIn(false)}
        />
      )}
    </div>
  );
}
