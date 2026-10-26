import { useCallback, useEffect, useState } from 'react';
import type { RecordingEngine } from '../../../api/contracts/recording';
import type { TeleprompterReaperInput } from '../../../api/contracts/teleprompter';
import { describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import type { TeleprompterDevice } from '../../../types';
import { Button } from '../../primitives/Button';
import { Select } from '../../primitives/Select';
import { useSettingsStore } from '../data/SettingsStore';
import { computerValue } from '../data/values';
import { rowOf } from '../registry/rows';
import type { SettingMeta } from '../registry/types';
import { ValueControl } from '../row/ValueControl';
import { onEngineChanged } from '../data/engineSignal';
import { useProjectDaw } from '../data/useProjectDaw';
import { resolveListeningMic } from '../../booth/listening/listeningMic';

/** The settings' one width for a select or a text box (row/ValueControl.tsx), so this row's select lines up with the rest of the category. */
export const FIELD_WIDTH = 'w-80 max-w-full';

type Listing = { phase: 'loading' } | { phase: 'ready'; devices: TeleprompterDevice[]; problem?: string };

/** A note under the control: muted 13 px, one width with the row's description. */
const NOTE_CLASS = 'max-w-[60ch] text-[0.8125rem] break-words text-[var(--text-muted)]';

/** `Teleprompter.input_source`, which has no row of its own: this row's "Choose a different one" and "Use … input" write it. */
const sourceRow = (row: SettingMeta): SettingMeta => ({ ...row, id: 'daw.micSource', def: 'daw', field: { tool: 'Teleprompter', key: 'input_source' } });

/**
 * The body of "Microphone". With a DAW recording, the Booth listens on the DAW's own input, so the row shows it read-only ("Same as REAPER")
 * with "Choose a different one" to keep another over it, one button per microphone when the DAW's input fits several, and the picker only
 * when the DAW cannot say which it is (Audacity cannot report its input at all). With the built-in recorder, or a DAW whose input was
 * overridden, it is the picker (`ManualMic`).
 */
export function MicBody() {
  const recording = usePort('recording');
  const [engine, setEngine] = useState<RecordingEngine | undefined>();
  const readEngine = useCallback(() => {
    recording.recorderState().then(
      (state) => setEngine(state.hasProject ? state.engine : 'builtin'),
      () => setEngine('builtin'),
    );
  }, [recording]);
  useEffect(() => {
    readEngine();
    return onEngineChanged(readEngine);
  }, [readEngine]);
  return engine === 'daw' ? <DawMic /> : <ManualMic />;
}

/** The Microphone row while a DAW records (see `MicBody`). */
function DawMic() {
  const row = rowOf('daw.mic')!;
  const source = sourceRow(row);
  const store = useSettingsStore();
  const teleprompter = usePort('teleprompter');
  const dawName = useProjectDaw('REAPER');
  const [answer, setAnswer] = useState<TeleprompterReaperInput | null | 'failed'>(null);
  const [devices, setDevices] = useState<string[]>([]);
  const { global } = store.fieldsOf(row);
  const overridden = store.fieldsOf(source).global?.effectiveValue === 'chosen';

  const ask = useCallback(() => {
    setAnswer(null);
    teleprompter.teleprompterReaperInput('').then(setAnswer, () => setAnswer('failed'));
    teleprompter.teleprompterDevices().then(
      (result) => setDevices(result.devices.map((device) => device.name)),
      () => setDevices([]),
    );
  }, [teleprompter]);
  useEffect(ask, [ask]);

  // Settings that cannot be read leave the row its picker, off like the rest of the page (alignment audit R3SE2-19).
  if (!global) return <ManualMic />;
  const back = (
    <span>
      <Button variant="secondary" size="sm" onClick={() => void store.write(source, 'global', null)}>
        {`Use ${dawName}'s input`}
      </Button>
    </span>
  );
  if (overridden)
    return (
      <div className="flex w-full min-w-0 flex-col items-start gap-1.5">
        <ManualMic />
        <span className={NOTE_CLASS}>{`Your choice, kept over ${dawName}'s input in the Booth.`}</span>
        {back}
      </div>
    );
  if (answer === null) return <span className={NOTE_CLASS}>{`Asking ${dawName} which microphone it records from…`}</span>;
  const told = answer === 'failed' ? null : answer;
  const resolved = resolveListeningMic({ dawRecords: true, answer: told, source: 'daw', chosen: computerValue(row, global), devices });
  const different = (
    <span>
      <Button id={`set-${row.id}`} variant="ghost" size="sm" onClick={() => void store.write(source, 'global', 'chosen')}>
        Choose a different one
      </Button>
    </span>
  );
  const checkAgain = (
    <span>
      <Button variant="secondary" size="sm" onClick={ask}>
        {`Ask ${dawName} again`}
      </Button>
    </span>
  );
  const records = resolved.dawInput ? <span className={NOTE_CLASS}>{`${dawName} records from ${resolved.dawInput}.`}</span> : null;
  if (resolved.origin === 'daw' || resolved.origin === 'uncertain')
    return (
      <div className="flex w-full min-w-0 flex-col items-start gap-1.5">
        {resolved.origin === 'daw' ? (
          <span className="text-sm [overflow-wrap:anywhere] text-[var(--text)]">
            {`Same as ${dawName}: `}
            <b>{resolved.device}</b>
          </span>
        ) : (
          <span role="status" className="max-w-[60ch] text-sm [overflow-wrap:anywhere] text-[var(--warn-text)]">
            {told?.message}
          </span>
        )}
        {records}
        {resolved.candidates.length > 1 ? (
          <div role="group" aria-label={`Which microphone ${dawName} records from`} className="flex flex-wrap gap-1.5">
            {resolved.candidates.map((candidate) => {
              const picked = resolved.origin === 'daw' && candidate === resolved.device;
              return (
                <Button
                  key={candidate}
                  variant={picked ? 'primary' : 'secondary'}
                  size="sm"
                  aria-pressed={picked}
                  onClick={() => void store.write(row, 'global', candidate)}
                >
                  <span className="[overflow-wrap:anywhere]">{candidate}</span>
                </Button>
              );
            })}
          </div>
        ) : null}
        {told?.outputDevice ? <span className={NOTE_CLASS}>{`${dawName} plays on ${told.outputDevice}.`}</span> : null}
        <div className="flex flex-wrap items-center gap-2">
          {different}
          {checkAgain}
        </div>
      </div>
    );
  // The DAW cannot say which microphone it records from: the narrator's choice, with the DAW's own sentence on why.
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-1.5">
      <ManualMic />
      <span className={NOTE_CLASS}>{answer === 'failed' ? `${dawName} could not be asked which microphone it records from.` : told?.message}</span>
      {told?.reason === 'daw_cannot_report' ? null : checkAgain}
    </div>
  );
}

/**
 * The microphone picker over `Teleprompter.input_device`: the input devices the Booth can listen to. The empty choice is automatic: the
 * DAW's own input while one records, else the first microphone listed. A name the list does not hold (an unplugged interface) stays shown and chosen, so nothing is lost silently. When the
 * list cannot be read, or is empty, the name is a text box instead, so the setting is never out of reach.
 */
function ManualMic() {
  const row = rowOf('daw.mic')!;
  const store = useSettingsStore();
  const teleprompter = usePort('teleprompter');
  const [listing, setListing] = useState<Listing>({ phase: 'loading' });
  const { global } = store.fieldsOf(row);
  const value = computerValue(row, global);

  const load = useCallback(() => {
    setListing({ phase: 'loading' });
    teleprompter.teleprompterDevices().then(
      (result) => setListing({ phase: 'ready', devices: result.devices, problem: result.error ?? undefined }),
      (failure: unknown) => setListing({ phase: 'ready', devices: [], problem: describeApiError(failure) }),
    );
  }, [teleprompter]);
  useEffect(load, [load]);

  const controlId = `set-${row.id}`;
  const choose = (next: string) => void store.write(row, 'global', next === row.def ? null : next);
  // Settings that cannot be read leave the row its control, off like the rest of the page, not an empty row (alignment audit R3SE2-19).
  if (!global)
    return (
      <Select
        label="Microphone"
        id={controlId}
        className={FIELD_WIDTH}
        value=""
        disabled
        onChange={() => undefined}
        options={[{ value: '', label: 'Automatic' }]}
      />
    );

  // While the list is read the picker is already there with the current choice (a deep link focuses it at once).
  const devices = listing.phase === 'ready' ? listing.devices : [];
  const problem = listing.phase === 'ready' ? listing.problem : undefined;
  if (listing.phase === 'ready' && devices.length === 0) {
    return (
      <div className="flex w-full min-w-0 flex-col items-start gap-1.5">
        <ValueControl row={row} field={global} id={controlId} value={value} onChange={choose} />
        <span className="max-w-[60ch] text-[0.8125rem] text-[var(--text-muted)]">
          {problem ? `The microphones could not be listed: ${problem} ` : 'No microphone was found. '}
          Type the device name the Booth should use, or leave it empty to listen automatically.
        </span>
        <Button variant="secondary" size="sm" onClick={load}>
          Refresh the list
        </Button>
      </div>
    );
  }
  const known = value === '' || devices.some((device) => device.name === value);
  // The select takes the settings' one field width and the button goes on its own line under it, as in Voice sample output, so the two rows
  // line up at every width (alignment audit R3SE1-4, XSE2-8, R4SE2-4).
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-2">
      <Select
        label="Microphone"
        id={controlId}
        className={FIELD_WIDTH}
        value={value}
        onChange={choose}
        options={[
          { value: '', label: 'Automatic' },
          ...devices.map((device) => ({ value: device.name, label: device.name })),
          ...(known ? [] : [{ value, label: `${value} (not found)` }]),
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={load}>
          Refresh the list
        </Button>
        {listing.phase === 'loading' && <span className="text-[0.8125rem] text-[var(--text-muted)]">Looking for microphones…</span>}
      </div>
      {problem && <span className="max-w-[60ch] text-[0.8125rem] text-[var(--text-muted)]">{problem}</span>}
    </div>
  );
}
