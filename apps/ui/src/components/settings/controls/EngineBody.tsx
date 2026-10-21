import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChoosableDaw, DawChoice, DawChoiceOption } from '../../../api/contracts/daw';
import { apiErrorMessage, describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
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
          ? 'Audacity 3 was not found on this computer. Install it, or choose another recorder. '
          : `${option.daw} was not found on this computer. Install it, or set where it is under Advanced, in the REAPER program setting below. `}
      </span>,
    );
  }
  const { record } = option;
  // The resolver's sentence for an Experimental capability switched off already says so; one that is on is marked here.
  if (record.level === 'experimental' && record.reason !== 'experimental_off') lines.push(<span key="level">Experimental. </span>);
  if (!record.available && record.message) {
    lines.push(
      <span key="record">
        {record.message}
        {record.reason === 'experimental_off' && ' Turn on Experimental DAW actions under Advanced, below.'}
      </span>,
    );
  }
  return lines.length > 0 ? <>{lines}</> : undefined;
}

function optionsFor(choice: DawChoice, disabled: boolean): RadioOption<ChoosableDaw>[] {
  return choice.options.map((option) => ({
    value: option.daw,
    label: option.daw === 'Built-in' ? 'Built-in recorder. Recordings live in the app.' : `${option.daw}. Recordings live in the DAW.`,
    description: optionDescription(option) && <span className="text-[0.8125rem]">{optionDescription(option)}</span>,
    disabled,
  }));
}

type Status = { tone: StatusTone; title: string; detail: string };

/** What the connection card says, from the host's state for the project's engine. `undefined`: nothing to show (no engine, or none chosen yet). */
function statusOf(choice: DawChoice, opts: { projectMatches?: boolean }): Status | undefined {
  const { daw, state, foundFiles } = choice;
  if (state === 'app') return { tone: 'neutral', title: 'Built-in recorder', detail: 'Recording happens in the app. Nothing to connect.' };
  if (state === 'none') return undefined;
  const linkedFile = daw === 'REAPER' ? choice.linkedFile : null;
  const installed = choice.options.find((option) => option.daw === daw)?.installed;
  if (installed === false)
    return { tone: 'warning', title: 'Not found', detail: `${daw} was not found on this computer. Install it, or choose another recorder.` };
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
  if (state === 'linked') {
    return {
      tone: 'neutral',
      title: 'Not running',
      detail: `${linked}${daw} is not running. ${
        choice.launcherAutoStart
          ? 'Start it here and it connects.'
          : `Start it here, then run the Narration Utils action in ${daw} to connect, or turn on "Start the launcher script with REAPER" below.`
      }`,
    };
  }
  return { tone: 'warning', title: 'Not running', detail: `${linked}${daw} is chosen but is not running. Start ${daw}, or choose another recorder.` };
}

/** REAPER's launcher script: where it is, and how to load it once. The path is the app's own; the app never changes REAPER for you. */
function LauncherPath({ path }: { path: string }) {
  const { notify } = useSettingsHost();
  const copy = () => {
    const done = () => notify('REAPER launcher path copied.');
    const fail = () => notify('Could not copy the REAPER launcher path.', 'error');
    if (!navigator.clipboard) fail();
    else void navigator.clipboard.writeText(path).then(done, fail);
  };
  return (
    <details className="text-[0.8125rem] text-[var(--text-muted)]">
      <summary className="cursor-pointer font-medium text-[var(--text)]">REAPER launcher script</summary>
      <p className="mt-1.5 max-w-[60ch]">
        Load this file once in REAPER (Actions, Show action list, New action, Load ReaScript), then run it with your project open to connect. Load it again
        after Narration Studio is moved or updated: the path changes. The app never changes REAPER for you.
      </p>
      <code className="mt-2 block rounded p-2 text-xs break-all" style={{ background: 'var(--surface-2)' }}>
        {path}
      </code>
      <Button variant="secondary" size="sm" className="mt-2" onClick={copy}>
        Copy path
      </Button>
    </details>
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
  const [test, setTest] = useState<{ phase: 'idle' | 'testing' | 'ok' | 'bad'; text: string; file?: string | null; at?: number }>({ phase: 'idle', text: '' });
  const live = useRef(true);
  const testedFor = useSecondsSince(test.at);

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
  const status = statusOf(choice, { projectMatches: data.dawReachable ? data.dawProjectMatches : undefined });
  const notInstalled = choice.options.find((option) => option.daw === daw)?.installed === false;
  const linkable = state === 'not_linked' || linkedFile !== null;
  const launcher = daw === 'REAPER' ? data.runtime.Reaper?.launcherPath : undefined;

  return (
    <div className="flex max-w-[60ch] flex-col gap-3">
      {!choice.hasProject && <p className="text-[0.8125rem] text-[var(--text-muted)]">Open a project to choose how it records.</p>}
      <RadioGroup<ChoosableDaw>
        label="Record with"
        value={daw === 'none' ? ('' as ChoosableDaw) : daw}
        onChange={(next) => void act(() => dawChoice.dawChoose(next))}
        options={optionsFor(choice, busy || !choice.hasProject)}
      />
      {overridden && (
        <p className="text-[0.8125rem] text-[var(--text-muted)]">
          This window was opened from {daw}, so it records with {daw} until the app is opened another way. The choice saved for this project is {choice.chosen}.
        </p>
      )}
      {daw === 'Audacity' && state !== 'app' && <AudacityLinkCard view={audacity} notify={notify} />}
      {daw !== 'Audacity' && status && (
        <div
          role="group"
          aria-label="Connection"
          data-daw-status={state}
          className="flex flex-col items-start gap-2 rounded-md p-3 text-[0.8125rem]"
          style={{ background: 'var(--surface-2)' }}
        >
          <StatusBadge tone={status.tone} label={status.title} />
          <span className="text-[var(--text-muted)]">{status.detail}</span>
          <div className="flex flex-wrap items-center gap-2">
            {!notInstalled && state === 'not_linked' && foundFiles.length === 1 && (
              <Button variant="primary" size="sm" disabled={busy} onClick={() => void act(() => dawChoice.dawLinkFound())}>
                Link {foundFiles[0]}
              </Button>
            )}
            {!notInstalled && linkable && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={onLinkDawFile}>
                {linkedFile ? 'Change linked file' : 'Choose a project file'}
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
            {state !== 'app' && (
              <Button variant="secondary" size="sm" disabled={test.phase === 'testing'} onClick={() => void check()}>
                {notInstalled ? 'Check again' : 'Test connection'}
              </Button>
            )}
            <span role="status" className="text-[var(--text-muted)]">
              {test.phase === 'testing' || test.file === linkedFile ? test.text : ''}
            </span>
            {test.at !== undefined && test.phase !== 'testing' && test.file === linkedFile && (
              <span className="text-[var(--text-muted)]">Last checked {testedFor} s ago.</span>
            )}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[0.8125rem] text-[var(--danger-text)]">
          {error}
        </p>
      )}
      {launcher && <LauncherPath path={launcher} />}
    </div>
  );
}
