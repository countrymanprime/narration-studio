import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecordingEngine } from '../../../api/contracts/recording';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { HelpButton } from '../../primitives/HelpButton';
import { Select } from '../../primitives/Select';
import { useOutputDevices } from '../../editing/output/useOutputDevices';
import { CheckedStamp, useCheckedAt } from '../../primitives/CheckedStamp';
import { missingOutputSentence, outputChoices } from '../../voicesamples/audioOutputs';
import { setSampleOutput } from '../../voicesamples/samplePlayerStore';
import { playTestSound } from '../../voicesamples/testSound';
import { overlay } from '../../../overlay/overlayService';
import { onEngineChanged } from '../data/engineSignal';
import { useSettingsStore } from '../data/SettingsStore';
import { useProjectDaw } from '../data/useProjectDaw';
import { rowOf } from '../registry/rows';
import { FIELD_WIDTH } from './MicBody';

/** How often the list is read again while the saved output is missing, so a speaker plugged back in is found without the narrator pressing anything. */
const RECHECK_MS = 5000;

/** The words behind the control's "?": what it changes and what it does not. */
const NOTE = 'Where voice samples play. Takes and read-aloud keep using the microphone and output you chose elsewhere.';
/** The "?" beside Test sound. */
const HELP_LABEL = 'About where samples play';
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
  const { project } = store.fieldsOf(row);
  const value = project?.effectiveValue ?? '';
  // The one reader of this computer's outputs (also the Editing popover's): its refusals are toasts, again on every Check again (#4044).
  const [checkedAt, markChecked, reads] = useCheckedAt();
  const {
    listing,
    refresh: check,
    watch: load,
  } = useOutputDevices({
    saved: engine === 'builtin' ? value : '',
    missingSentence: (name) => missingOutputSentence(name, 'Voice samples play'),
  });

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

  // The stamp is the answer to a press that finds the same list: the time of the last finished read (rule 9).
  const readAt = listing.phase === 'ready' ? listing.checkedAt : 0;
  useEffect(() => {
    if (readAt) markChecked();
  }, [readAt, markChecked]);
  const { options, missing } = outputChoices(listing.phase === 'ready' ? listing : undefined, engine === 'builtin' ? value : '');
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
  const [sounding, setSounding] = useState(false);
  const test = () => {
    setSounding(true);
    // A tone that never ends (a stalled output) must not leave the button busy for good: the tone is half a second long.
    window.setTimeout(() => setSounding(false), 3000);
    void playTestSound(engine === 'builtin' ? value : '', () => setSounding(false)).then((problem) => problem && overlay.toast(problem));
  };
  // The tone is the result, and it is half a second of sound: the button shows it is sounding for as long as it lasts, so a press never looks dead.
  const testButton = (
    <Button variant="secondary" pending={sounding} onClick={test}>
      Test sound
    </Button>
  );

  // With a DAW the row is the Test sound button and, under it, the muted note of where samples play, like every other note in the card (R3SE2-16).
  if (engine === 'daw' && hasProject) {
    return (
      <div className="flex w-full min-w-0 flex-col items-start gap-2">
        <div className="flex items-center gap-2">
          {testButton}
          <HelpButton label={HELP_LABEL}>{dawSentence(daw)}</HelpButton>
        </div>
      </div>
    );
  }

  const unavailable = listing.phase === 'ready' && listing.status === 'unavailable' ? listing.message : undefined;
  // The select at the settings' field width, its buttons on one row under it (the Microphone row's arrangement), then the notes.
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-2">
      <Select
        label="Voice sample output"
        id={`set-${row.id}`}
        className={FIELD_WIDTH}
        value={value}
        onChange={choose}
        disabled={engine === undefined || !hasProject}
        options={options}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={check}>
          {unavailable || missing ? 'Check again' : 'Refresh the list'}
        </Button>
        {testButton}
        <HelpButton label={HELP_LABEL}>{NOTE}</HelpButton>
        <CheckedStamp at={checkedAt} reads={reads} />
        {listing.phase === 'loading' && <span className="text-[0.8125rem] text-[var(--text-muted)]">Looking for outputs…</span>}
      </div>
      {!hasProject && <span className="text-[0.8125rem] text-[var(--text-muted)]">Open a project to choose where its voice samples play.</span>}
    </div>
  );
}
