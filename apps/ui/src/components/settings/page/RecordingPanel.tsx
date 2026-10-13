import { useCallback, useEffect, useState } from 'react';
import type { ChoosableDaw, DawChoice, DawChoiceOption } from '../../../api/contracts/daw';
import { apiErrorMessage, describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { Panel } from '../../primitives/Panel';
import { RadioGroup, type RadioOption } from '../../primitives/RadioGroup';
import { Dot } from '../../primitives/StatusBadge';
import type { Notify } from '../../primitives/Toast';

export type RecordingPanelViewProps = {
  /** The project's DAW choice; absent while it is read. */
  choice?: DawChoice;
  busy?: boolean;
  /** A failed read or a refused choice, in the host's words. */
  error?: string;
  onChoose: (daw: ChoosableDaw) => void;
  /** Links the one project file the host found in the folder. */
  onLinkFound: () => void;
  /** Opens the file dialog to link a project file. */
  onPickFile: () => void;
  /** Starts the DAW on the linked project; absent hides the button. */
  onStart?: () => void;
  starting?: boolean;
};

const DAW_SETTINGS_ID = 'settings-daw';

/** Where on this page a fix lives: the DAW Integration panel further down holds the DAW's path, the launcher switch and the
 * Experimental switch (ADR 0230 keeps that switch there, global). */
function DawSettingsLink({ children }: { children: string }) {
  return (
    <a
      href={`#${DAW_SETTINGS_ID}`}
      className="underline"
      onClick={(event) => {
        event.preventDefault();
        document.getElementById(DAW_SETTINGS_ID)?.scrollIntoView?.({ block: 'start' });
      }}
    >
      {children}
    </a>
  );
}

/** One engine's honest state under its radio: not found on this computer, or why it cannot record now, in the host's sentence. */
function optionDescription(option: DawChoiceOption) {
  const lines: React.ReactNode[] = [];
  if (option.installed === false) {
    lines.push(
      <span key="installed">
        {option.daw} was not found on this computer. Install it, or set where it is under <DawSettingsLink>DAW Integration</DawSettingsLink>.
      </span>,
    );
  }
  const { record } = option;
  if (record.level === 'experimental') lines.push(<span key="level">Experimental. </span>);
  if (!record.available && record.message) {
    lines.push(
      <span key="record">
        {record.message}
        {record.reason === 'experimental_off' && (
          <>
            {' '}
            Turn on Experimental actions under <DawSettingsLink>DAW Integration</DawSettingsLink>.
          </>
        )}
      </span>,
    );
  }
  return lines.length > 0 ? <>{lines}</> : undefined;
}

// The mock's wording (`pages/Settings.tsx`, Recording): every engine the app supports, named from the host's list.
function optionsFor(choice: DawChoice, disabled: boolean): RadioOption<ChoosableDaw>[] {
  return choice.options.map((option) => ({
    value: option.daw,
    label: option.daw === 'Built-in' ? 'Built-in recorder. Recordings live in the app.' : `${option.daw}. Recordings live in the DAW.`,
    description: optionDescription(option),
    disabled,
  }));
}

/** The project's DAW and its project file: linked, found in the folder, or missing, with the one action that moves it on. */
function DawStatus({ choice, busy, onLinkFound, onPickFile, onStart, starting }: Omit<RecordingPanelViewProps, 'onChoose' | 'error'> & { choice: DawChoice }) {
  const { daw, state, linkedFile, foundFiles } = choice;
  if (state === 'app' || state === 'none') return null;
  const linkable = state === 'not_linked' || linkedFile !== null;
  let title: string;
  let detail: string;
  if (state === 'connected') {
    title = linkedFile ? `${daw} linked: ${linkedFile}` : `${daw} connected`;
    detail = `${daw} is open and answering. Record goes through ${daw}.`;
  } else if (state === 'not_linked') {
    title = `${daw} not linked`;
    detail =
      foundFiles.length === 1
        ? `${foundFiles[0]} is in the project folder.`
        : foundFiles.length > 1
          ? `${foundFiles.length} ${daw} project files are in the project folder. Choose the one this project records into.`
          : `No ${daw} project file is in the project folder yet. Save one there from ${daw}, then link it.`;
  } else if (state === 'linked') {
    title = `${daw} linked: ${linkedFile ?? 'from the launch'}`;
    detail = choice.launcherAutoStart
      ? `${daw} is not running. Start it here and it connects.`
      : `${daw} is not running. Start it here, then run the Narration Utils action in ${daw} to connect, or turn on "Start the launcher script automatically" under DAW Integration.`;
  } else {
    title = linkedFile ? `${daw} linked: ${linkedFile}` : daw;
    detail = `${daw} is not running. Start it, or open this app from it.`;
  }
  return (
    <div className="flex flex-col gap-2 rounded-md p-3 text-sm" style={{ background: 'var(--surface-2)' }} data-testid="recording-daw-status">
      <div className="flex items-center gap-3">
        <Dot color={state === 'connected' ? 'var(--character)' : state === 'not_linked' ? 'var(--warning-text)' : 'var(--non-text)'} />
        <div>
          <div className="font-medium">{title}</div>
          <div style={{ color: 'var(--text-muted)' }}>{detail}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {state === 'not_linked' && foundFiles.length === 1 && (
          <Button variant="primary" disabled={busy} onClick={onLinkFound}>
            Link {foundFiles[0]}
          </Button>
        )}
        {linkable && (
          <Button variant="secondary" disabled={busy} onClick={onPickFile}>
            {linkedFile ? 'Change linked file' : 'Choose a project file'}
          </Button>
        )}
        {onStart && linkedFile !== null && (state === 'linked' || state === 'not_running') && (
          <Button variant="secondary" disabled={busy || starting} onClick={onStart}>
            {starting ? `Starting ${daw}…` : `Start ${daw}`}
          </Button>
        )}
      </div>
    </div>
  );
}

/** The mock's "Recording" panel: every engine the app supports, each with its state, and the project's DAW with its project file.
 * A DAW that is not running stays chosen. Takes props only. */
export function RecordingPanelView({ choice, busy = false, error, onChoose, onLinkFound, onPickFile, onStart, starting }: RecordingPanelViewProps) {
  const overridden = choice && choice.source === 'launch' && choice.chosen !== null && choice.chosen !== choice.daw;
  return (
    <Panel title="Recording">
      <div className="flex flex-col gap-3">
        {choice ? (
          <>
            {!choice.hasProject && (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Open a project to choose how it records.
              </p>
            )}
            <RadioGroup<ChoosableDaw>
              label="Recording"
              value={choice.daw === 'none' ? ('' as ChoosableDaw) : choice.daw}
              onChange={onChoose}
              options={optionsFor(choice, busy || !choice.hasProject)}
            />
            {overridden && (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                This window was opened from {choice.daw}, so it records with {choice.daw} until the app is opened another way. The choice saved for this project
                is {choice.chosen}.
              </p>
            )}
            <DawStatus choice={choice} busy={busy} onLinkFound={onLinkFound} onPickFile={onPickFile} onStart={onStart} starting={starting} />
          </>
        ) : (
          !error && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Reading how this project records…
            </p>
          )
        )}
        {error && (
          <p role="alert" className="text-sm" style={{ color: 'var(--danger-text)' }}>
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}

/**
 * Settings > Recording: the project's engine, read with `dawChoice` (again whenever the capability report changes or the
 * project's link does) and saved with `dawChoose`. Link uses `dawLinkFound` for the one file the host found and the shared link
 * action otherwise; Start uses `launchDaw`. The host refuses with its own sentence; the choice stays where it was.
 */
export function RecordingPanel({ dawFileLinked, onLinkDawFile, notify }: { dawFileLinked?: boolean; onLinkDawFile: () => void; notify: Notify }) {
  const api = usePort('dawChoice');
  const report = usePort('dawCapabilities');
  const project = usePort('project');
  const [choice, setChoice] = useState<DawChoice>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let live = true;
    const read = () =>
      api.dawChoice().then(
        (next) => live && setChoice(next),
        (failure: unknown) => live && setError(`How this project records could not be read: ${apiErrorMessage(failure)}`),
      );
    void read();
    const unsubscribe = report.subscribeDawCapabilities(() => void read());
    return () => {
      live = false;
      unsubscribe();
    };
  }, [api, report, dawFileLinked]);

  const act = useCallback(async (call: () => Promise<DawChoice>) => {
    setBusy(true);
    try {
      setChoice(await call());
      setError(undefined);
    } catch (failure) {
      setError(apiErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }, []);

  const start = useCallback(async () => {
    setStarting(true);
    try {
      const result = await project.launchDaw();
      notify(`Started ${choice?.daw ?? 'the DAW'} (${result.path}).`);
    } catch (failure) {
      notify(describeApiError(failure), 'error');
    } finally {
      setStarting(false);
    }
  }, [project, notify, choice?.daw]);

  return (
    <RecordingPanelView
      choice={choice}
      busy={busy}
      error={error}
      onChoose={(next) => void act(() => api.dawChoose(next))}
      onLinkFound={() => void act(() => api.dawLinkFound())}
      onPickFile={onLinkDawFile}
      onStart={() => void start()}
      starting={starting}
    />
  );
}
