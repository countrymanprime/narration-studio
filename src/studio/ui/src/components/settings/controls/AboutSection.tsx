import { Panel } from '../../primitives/Panel';
import { AboutPanel } from '../AboutPanel';
import { UpdatesPanel } from '../UpdatesPanel';
import { useSettingsStore } from '../data/SettingsStore';
import { computerValue } from '../data/values';
import { rowOf } from '../registry/rows';
import { useSettingsHost } from '../row/SettingsHost';

const CHANNEL = rowOf('app.channel')!;

/**
 * The version, and the update check, under App & updates: what is running, whether a newer release exists on the channel set below, and the
 * download and install steps. The update panel is keyed on the channel, so it asks the host again when the channel row changes.
 */
export function AboutSection() {
  const { data } = useSettingsHost();
  const store = useSettingsStore();
  const channel = computerValue(CHANNEL, store.fieldsOf(CHANNEL).global);
  return (
    <Panel label="This version" className="flex flex-col gap-3">
      <AboutPanel version={data.version} />
      <UpdatesPanel key={channel} />
    </Panel>
  );
}
