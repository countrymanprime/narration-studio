import { useEffect, useState } from 'react';
import { usePort } from '../../../ports/usePort';
import { Switch } from '../../primitives/Switch';
import { useSettingsStore } from '../data/SettingsStore';
import { rowOf } from '../registry/rows';

/** What the row says while the host has not answered whether a local model is installed. */
const CHECKING = 'Checking for a local model…';
/** What it says when the host cannot be asked: the switch stays off rather than promise a model that may not be there. */
const CANNOT_TELL = 'Could not check for a local model.';

/**
 * Whether Find who speaks each line also asks a local model about the lines the rules leave unknown (issue 3743). The switch works
 * only when the host's `local-model` extraction source is available, which is the host's own statement that a model is installed;
 * otherwise it is off and the host's reason stands beside it, so the narrator sees what is missing instead of a switch that does
 * nothing. The reason is the host's sentence, drawn as text.
 */
export function SpeakerFallbackBody() {
  const row = rowOf('project.speakerFallback')!;
  const api = usePort('extraction');
  const store = useSettingsStore();
  const [missing, setMissing] = useState<string | undefined>(CHECKING);
  useEffect(() => {
    let alive = true;
    api.extractionSources().then(
      (sources) => {
        const model = sources.find((source) => source.id === 'local-model');
        if (alive) setMissing(model?.available ? undefined : model?.reason || 'No local model is installed.');
      },
      () => alive && setMissing(CANNOT_TELL),
    );
    return () => {
      alive = false;
    };
  }, [api]);
  const on = store.fieldsOf(row).global?.effectiveValue === 'true';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Switch checked={on && !missing} disabled={Boolean(missing)} onChange={(next) => void store.write(row, 'global', next ? 'true' : null)}>
        <span className="sr-only">{row.label}: </span>
        <span aria-hidden="true">{on && !missing ? 'On' : 'Off'}</span>
      </Switch>
      {missing && <span className="text-xs text-[var(--text-muted)]">{missing}</span>}
    </div>
  );
}
