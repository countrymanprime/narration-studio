import { SyncActivityLog } from '../../engine/SyncActivityLog';
import { useSettingsHost } from '../row/SettingsHost';

/** The body of "Sync activity": the chapter sync log, moved here from the audio engine panel. */
export function SyncActivityBody() {
  const { notify } = useSettingsHost();
  return <SyncActivityLog notify={notify} />;
}
