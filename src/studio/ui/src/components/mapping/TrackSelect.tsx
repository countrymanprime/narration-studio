import { Select } from '../primitives/Select';
import type { TrackChoice } from './trackChoices';

/**
 * The dropdown of REAPER tracks to link a chapter to, shared by the Tracks list, the recording check and the not-linked dialog. When the matcher has a
 * best match it heads the list under "Best match", and a track another chapter holds says so in its label. `value` '' shows the placeholder.
 */
export function TrackSelect({
  label,
  choices,
  value,
  onChange,
  fullWidth = false,
}: {
  label: string;
  choices: readonly TrackChoice[];
  value: string;
  onChange: (guid: string) => void;
  fullWidth?: boolean;
}) {
  const grouped = choices.some((c) => c.best);
  return (
    <Select
      label={label}
      value={value}
      onChange={onChange}
      fullWidth={fullWidth}
      placeholder="Choose a track"
      options={choices.map((c) => ({
        value: c.guid,
        label: c.heldBy ? `${c.name} (linked to ${c.heldBy})` : c.name,
        ...(grouped ? { group: c.best ? 'Best match' : 'Other tracks' } : {}),
      }))}
    />
  );
}
