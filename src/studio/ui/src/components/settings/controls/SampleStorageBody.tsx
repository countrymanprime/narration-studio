import { useDawCapabilities } from '../../../hooks/useDawCapabilities';
import { voiceSampleRegionSupport } from '../../editing/voicesample/regionSupport';
import { RadioGroup, type RadioOption } from '../../primitives/RadioGroup';
import { useSettingsStore } from '../data/SettingsStore';
import { rowOf } from '../registry/rows';

type Storage = 'project' | 'daw' | 'both';

/** Why a DAW choice is off, drawn under it: the tool declares it cannot keep a region, and the host's own sentence is built from the capability's name. */
const CANNOT = 'Not available with this recording tool yet.';

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
  const support = voiceSampleRegionSupport(caps);
  // The choice is declared by the tool, not by whether the tool answers right now: an engine that is closed still can, and a mark says so.
  const declared = support !== undefined && support.level !== 'not_yet_available' && support.level !== 'unsupported';
  // The reason is drawn under each off choice and describes it; what each choice does is the row's "?".
  const why = support === undefined || declared ? undefined : CANNOT;
  const options: RadioOption<Storage>[] = [
    { value: 'project', label: 'In the project folder' },
    { value: 'daw', label: 'In the DAW', disabled: !declared, reason: why },
    { value: 'both', label: 'Both', disabled: !declared, reason: why },
  ];
  return (
    <RadioGroup
      label="Where voice samples are kept"
      value={value}
      onChange={(next) => void store.write(row, 'project', next === 'project' ? null : next)}
      options={options}
    />
  );
}
