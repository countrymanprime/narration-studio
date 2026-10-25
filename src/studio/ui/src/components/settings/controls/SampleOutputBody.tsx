import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecordingEngine } from '../../../api/contracts/recording';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { Select } from '../../primitives/Select';
import { listAudioOutputs, type OutputListing } from '../../voicesamples/audioOutputs';
import { setSampleOutput } from '../../voicesamples/samplePlayerStore';
import { playTestSound } from '../../voicesamples/testSound';
import { overlay } from '../../../overlay/overlayService';
import { onEngineChanged } from '../data/engineSignal';
import { useSettingsStore } from '../data/SettingsStore';
import { useProjectDaw } from '../data/useProjectDaw';
import { rowOf } from '../registry/rows';

type Listing = { phase: 'loading' } | ({ phase: 'ready'; checkedAt: number } & OutputListing);

/** How often the list is read again while the saved output is missing, so a speaker plugged back in is found without the narrator pressing anything. */
const RECHECK_MS = 5000;

/** The words under the control: what it changes and what it does not. */
const NOTE = 'Where voice samples play. Takes and read-aloud keep using the microphone and output you chose elsewhere.';
/** What the row says with a DAW: samples play in the app, and the DAW's own audio device is left alone. */
export const dawSentence = (daw: string): string => `Voice samples play on this computer's default output. ${daw}'s own audio device is not used or changed.`;
export const DAW_SENTENCE = dawSentence('REAPER');

/**
 * The body of "Voice sample output" (the approved mock's section 4, docs/research/mockups/voice-samples/): where this project's voice samples play,
 * a choice of this computer's outputs for the built-in recorder, saved with the project. With a DAW connected the DAW keeps its own audio device and
 * a sample still plays in the app's own audio, so the row only says where, with a test sound. A saved output that is not connected stays shown and
 * chosen with a notice, and the list is read again when the window gets focus and while the notice is up; samples play on the default meanwhile.
 */
export function SampleOutputBody() {
  const row = rowOf('daw.sampleOutput')!;
  const store = useSettingsStore();
  const daw = useProjectDaw('REAPER');
  const recording = usePort('recording');
  const [engine, setEngine] = useState<RecordingEngine | undefined>();
  const [hasProject, setHasProject] = useState(true);
  const [listing, setListing] = useState<Listing>({ phase: 'loading' });
  const { project } = store.fieldsOf(row);
  const value = project?.effectiveValue ?? '';

  // The engine is read when the row opens and again whenever "Record with" is changed on this page.
  const readEngine = useCallback(() => {
    recording.recorderState().then(
      (state) => {
        setEngine(state.engine);
        setHasProject(state.hasProject);
      },
      () => setEngine('builtin'),
    );
  }, [recording]);
  useEffect(() => {
    readEngine();
    return onEngineChanged(readEngine);
  }, [readEngine]);
  // The player follows what this row shows: the project's output with the built-in recorder, the system default with a DAW.
  useEffect(() => {
    if (engine !== undefined) setSampleOutput(engine === 'builtin' ? value : '');
  }, [engine, value]);

  const load = useCallback(() => {
    listAudioOutputs().then((result) => setListing({ phase: 'ready', checkedAt: Date.now(), ...result }));
  }, []);
  useEffect(load, [load]);
  // The list is read again when the window gets focus and whenever the computer says an output came or went, so an unplugged speaker is noticed
  // without the narrator leaving the window.
  useEffect(() => {
    window.addEventListener('focus', load);
    const devices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    devices?.addEventListener?.('devicechange', load);
    return () => {
      window.removeEventListener('focus', load);
      devices?.removeEventListener?.('devicechange', load);
    };
  }, [load]);

  const outputs = listing.phase === 'ready' && listing.status === 'ok' ? listing.outputs : [];
  const missing = engine === 'builtin' && listing.phase === 'ready' && listing.status === 'ok' && value !== '' && !outputs.some((o) => o.label === value);
  const recheck = useRef(load);
  recheck.current = load;
  useEffect(() => {
    if (!missing) return;
    const timer = window.setInterval(() => recheck.current(), RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [missing]);

  const choose = (next: string) => {
    setSampleOutput(next);
    void store.write(row, 'project', next === '' ? null : next);
  };
  const test = () => {
    void playTestSound(engine === 'builtin' ? value : '').then((problem) => problem && overlay.toast(problem));
  };
  const testButton = (
    <Button variant="secondary" onClick={test}>
      Test sound
    </Button>
  );

  if (engine === 'daw' && hasProject) {
    return (
      <div className="flex max-w-full min-w-0 flex-col items-start gap-2">
        <p className="m-0 max-w-full text-sm break-words sm:max-w-[52ch]">{dawSentence(daw)}</p>
        <div className="flex items-center gap-2">
          {testButton}
          <span className="text-[0.8125rem] text-[var(--text-muted)]">Plays on the default output</span>
        </div>
      </div>
    );
  }

  const unavailable = listing.phase === 'ready' && listing.status === 'unavailable' ? listing.message : undefined;
  return (
    <div className="flex max-w-full min-w-0 flex-col items-start gap-2">
      {unavailable && (
        <p
          role="alert"
          className="m-0 max-w-full rounded-[var(--radius-card)] bg-[var(--danger-soft)] px-3 py-2 text-sm break-words text-[var(--danger-text)] sm:max-w-[52ch]"
        >
          {unavailable}
        </p>
      )}
      {missing && (
        <p
          role="alert"
          className="m-0 max-w-full rounded-[var(--radius-card)] bg-[var(--warn-soft)] px-3 py-2 text-sm break-words text-[var(--warn-text)] sm:max-w-[52ch]"
        >
          {value} is not connected. Voice samples play on the system default until it is back.
        </p>
      )}
      <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
        <Select
          label="Voice sample output"
          id={`set-${row.id}`}
          className="max-w-full min-w-0"
          value={unavailable ? '' : value}
          onChange={choose}
          disabled={unavailable !== undefined || engine === undefined || !hasProject}
          options={[
            { value: '', label: 'System default' },
            ...outputs.map((o) => ({ value: o.label, label: o.label })),
            ...(missing ? [{ value, label: `${value}, not connected` }] : []),
          ]}
        />
        <Button variant="secondary" onClick={load}>
          {unavailable || missing ? 'Check again' : 'Refresh the list'}
        </Button>
        {testButton}
        {listing.phase === 'loading' && <span className="text-[0.8125rem] text-[var(--text-muted)]">Looking for outputs…</span>}
      </div>
      {!hasProject && <span className="text-[0.8125rem] text-[var(--text-muted)]">Open a project to choose where its voice samples play.</span>}
      <span className="max-w-full text-[0.8125rem] break-words text-[var(--text-muted)] sm:max-w-[52ch]">{NOTE}</span>
      {missing && listing.phase === 'ready' && (
        <span className="max-w-full text-[0.8125rem] break-words text-[var(--text-muted)] sm:max-w-[52ch]">
          Last checked {new Date(listing.checkedAt).toLocaleTimeString()}. The list is read again when you open Settings, when the window gets focus, and while
          this notice is up.
        </span>
      )}
    </div>
  );
}
