import { useDawCapabilities } from '../../../hooks/useDawCapabilities';
import { RadioGroup, type RadioOption } from '../../primitives/RadioGroup';
import { useSettingsStore } from '../data/SettingsStore';
import { rowOf } from '../registry/rows';

type Storage = 'project' | 'daw' | 'both';

/** The words under a DAW choice the project's DAW cannot honour; the capability's own sentence when it has one. */
const CANNOT = 'This recording tool cannot keep a voice sample.';

/**
 * Where a new voice sample is kept (docs/prds/character-voice-samples.prd.md, Where a sample is kept): copied into the project folder (the
 * default), as a region in the DAW's project, or both. A choice the project's DAW cannot honour is listed and off, with the capability's
 * sentence under it, so the narrator sees why and what stays available. A region is kept as a REAPER region the app reads back from the
 * saved project, so moving or deleting it in REAPER moves or ends the sample.
 */
export function SampleStorageBody() {
  const row = rowOf('daw.sampleStorage')!;
  const store = useSettingsStore();
  const { caps } = useDawCapabilities();
  const { project } = store.fieldsOf(row);
  const value: Storage = project?.effectiveValue === 'daw' || project?.effectiveValue === 'both' ? project.effectiveValue : 'project';
  const support = caps?.capabilities.voice_sample_region;
  // The choice is declared by the tool, not by whether the tool answers right now: an engine that is closed still can, and a mark says so.
  const declared = support !== undefined && support.level !== 'not_yet_available' && support.level !== 'unsupported';
  const why = support === undefined ? undefined : declared ? undefined : support.message || CANNOT;
  const options: RadioOption<Storage>[] = [
    { value: 'project', label: 'In the project folder', description: 'A copy of the audio, played anywhere.' },
    {
      value: 'daw',
      label: 'In the DAW',
      description: why ?? 'A region in the DAW’s project; moving or deleting it there moves or ends the sample.',
      disabled: !declared,
    },
    { value: 'both', label: 'Both', description: why ?? 'A copy of the audio and a region.', disabled: !declared },
  ];
  return <RadioGroup label="Where voice samples are kept" value={value} onChange={(next) => void store.write(row, 'project', next === 'project' ? null : next)} options={options} />;
}
