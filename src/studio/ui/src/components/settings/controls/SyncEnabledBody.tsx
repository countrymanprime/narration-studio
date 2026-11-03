import { useState } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { useApi } from '../../../api/ApiContext';
import { useChapterSync } from '../../../hooks/useChapterSync';
import { RadioGroup } from '../../primitives/RadioGroup';
import { useSettingsHost } from '../row/SettingsHost';

const OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
];

/**
 * The body of "Sync chapters to tracks": Chapter sync's consent, the same `chapterSyncSetEnabled` the Engine panel's Turn on and Turn off and
 * the question the app asks make. The state is the host's own (`chaptersync:state`), so each place shows the others' change at once. Before the
 * narrator has chosen, neither is picked.
 */
export function SyncEnabledBody() {
  const api = useApi();
  const { notify } = useSettingsHost();
  const state = useChapterSync(api);
  const [pending, setPending] = useState(false);
  const choose = async (next: string) => {
    if (pending) return;
    setPending(true);
    try {
      await api.chapterSyncSetEnabled(next === 'on');
    } catch (error) {
      notify(describeApiError(error), 'error');
    } finally {
      setPending(false);
    }
  };
  const value = state?.consent === 'on' || state?.consent === 'off' ? state.consent : '';
  return (
    <RadioGroup
      label="Sync chapters to tracks"
      value={value}
      onChange={(next) => void choose(next)}
      options={OPTIONS.map((option) => ({ ...option, disabled: !state || pending }))}
    />
  );
}
