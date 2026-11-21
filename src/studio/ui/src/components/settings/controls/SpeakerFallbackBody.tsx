import { Switch } from '../../primitives/Switch';
import { useSettingsStore } from '../data/SettingsStore';
import { useLocalModelMissing } from '../data/useLocalModel';
import { rowOf } from '../registry/rows';

/**
 * Whether Find who speaks each line also asks a local model about the lines the rules leave unknown (issue 3743). The switch works
 * only when the host's `local-model` extraction source is available, which is the host's own statement that a model is installed;
 * otherwise it is off with the host's reason as its description and beside it (`Switch disabledReason`), so a keyboard, a pointer
 * and a screen reader all learn what is missing instead of meeting a switch that does nothing. The reason is the host's sentence,
 * drawn as text.
 */
export function SpeakerFallbackBody() {
  const row = rowOf('project.speakerFallback')!;
  const store = useSettingsStore();
  const missing = useLocalModelMissing();
  const on = store.fieldsOf(row).global?.effectiveValue === 'true';
  return (
    <Switch checked={on && !missing} disabledReason={missing} onChange={(next) => void store.write(row, 'global', next ? 'true' : null)}>
      <span className="sr-only">{row.label}: </span>
      <span aria-hidden="true">{on && !missing ? 'On' : 'Off'}</span>
    </Switch>
  );
}
