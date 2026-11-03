import { useRef, useState } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { useApi } from '../../../api/ApiContext';
import { useChapterSync } from '../../../hooks/useChapterSync';
import { IconButton } from '../../primitives/IconButton';
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
  // Quick choices are not lost: the last one is sent once the one in flight has answered.
  const wanted = useRef<'on' | 'off' | null>(null);
  const sending = useRef(false);
  // What the narrator picked while it is being sent, so the radios show it at once and a second pick is a change from it.
  const [picked, setPicked] = useState<'on' | 'off' | null>(null);
  const choose = async (next: string) => {
    wanted.current = next === 'on' ? 'on' : 'off';
    setPicked(wanted.current);
    if (sending.current) return;
    sending.current = true;
    try {
      while (wanted.current !== null) {
        const now = wanted.current;
        wanted.current = null;
        try {
          await api.chapterSyncSetEnabled(now === 'on');
        } catch (error) {
          notify(describeApiError(error), 'error');
          wanted.current = null;
        }
      }
    } finally {
      sending.current = false;
      setPicked(null);
    }
  };
  const value = picked ?? (state?.consent === 'on' || state?.consent === 'off' ? state.consent : '');
  return (
    <div className="flex items-center gap-1.5">
      <RadioGroup
        label="Sync chapters to tracks"
        value={value}
        onChange={(next) => void choose(next)}
        options={OPTIONS.map((option) => ({ ...option, disabled: !state }))}
      />
      {state?.consent === 'off' && (
        <IconButton action="undo" label="Reset Sync chapters to tracks to On" className="border-transparent" onClick={() => void choose('on')} />
      )}
    </div>
  );
}
