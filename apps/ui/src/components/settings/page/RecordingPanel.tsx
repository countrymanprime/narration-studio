import { useEffect, useState } from 'react';
import type { DawKind } from '../../../api/contracts/daw';
import type { RecordingEngine } from '../../../api/contracts/recording';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { Panel } from '../../primitives/Panel';
import { RadioGroup, type RadioOption } from '../../primitives/RadioGroup';

export type RecordingPanelViewProps = {
  /** The launch's DAW as the capability report names it; absent while the report is read. */
  daw?: DawKind;
  /** The engine the project records with; absent while it is read. */
  engine?: RecordingEngine;
  busy?: boolean;
  /** A failed read or a refused choice, in the host's words. */
  error?: string;
  onChoose: (engine: RecordingEngine) => void;
};

// The mock's wording (`pages/Settings.tsx`, Recording): the DAW row is named from the report, never a literal.
function optionsFor(daw: DawKind | undefined, disabled: boolean): RadioOption<RecordingEngine>[] {
  const options: RadioOption<RecordingEngine>[] = [];
  if (daw === 'REAPER' || daw === 'Audacity') options.push({ value: 'daw', label: `${daw}. Recordings live in the DAW.`, disabled });
  options.push({ value: 'builtin', label: 'Built-in recorder. Recordings live in the app.', disabled });
  return options;
}

/** The mock's "Recording" panel: the launch's DAW or the built-in recorder. The DAW stays chosen while it is not running. Takes props only. */
export function RecordingPanelView({ daw, engine, busy = false, error, onChoose }: RecordingPanelViewProps) {
  const ready = engine !== undefined && daw !== undefined;
  return (
    <Panel title="Recording">
      <div className="flex flex-col gap-2">
        {ready ? (
          <RadioGroup label="Recording" value={engine} onChange={onChoose} options={optionsFor(daw, busy)} />
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
 * Settings > Recording: the project's recording engine, read with `recorderState` and saved with `recorderChooseEngine`. The host
 * refuses with its own sentence (no project, a take running, built-in not supported here); the choice stays where it was.
 */
export function RecordingPanel() {
  const api = usePort('recording');
  const daw = usePort('daw');
  const [kind, setKind] = useState<DawKind>();
  const [engine, setEngine] = useState<RecordingEngine>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    daw.capabilities().then(
      (report) => live && setKind(report.daw),
      (failure: unknown) => {
        if (!live) return;
        setKind('none');
        setError(`The DAW could not be read: ${apiErrorMessage(failure)}`);
      },
    );
    api.recorderState().then(
      (state) => live && setEngine(state.engine),
      (failure: unknown) => live && setError(`How this project records could not be read: ${apiErrorMessage(failure)}`),
    );
    return () => {
      live = false;
    };
  }, [api, daw]);

  const choose = async (next: RecordingEngine) => {
    setBusy(true);
    try {
      setEngine((await api.recorderChooseEngine(next)).engine);
      setError(undefined);
    } catch (failure) {
      setError(apiErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return <RecordingPanelView daw={kind} engine={engine} busy={busy} error={error} onChoose={(next) => void choose(next)} />;
}
