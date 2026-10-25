import { useCallback, useEffect, useState } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import type { TeleprompterDevice } from '../../../types';
import { Button } from '../../primitives/Button';
import { Select } from '../../primitives/Select';
import { useSettingsStore } from '../data/SettingsStore';
import { computerValue } from '../data/values';
import { rowOf } from '../registry/rows';
import { ValueControl } from '../row/ValueControl';

/** The settings' one width for a select or a text box (row/ValueControl.tsx), so this row's select lines up with the rest of the category. */
export const FIELD_WIDTH = 'w-80 max-w-full';

type Listing = { phase: 'loading' } | { phase: 'ready'; devices: TeleprompterDevice[]; problem?: string };

/**
 * The body of "Microphone": the input devices the Booth can listen to, as a picker over `Teleprompter.input_device`. The empty choice is the
 * system's own input. A name the list does not hold (an unplugged interface) stays shown and chosen, so nothing is lost silently. When the
 * list cannot be read, or is empty, the name is a text box instead, so the setting is never out of reach.
 */
export function MicBody() {
  const row = rowOf('daw.mic')!;
  const store = useSettingsStore();
  const teleprompter = usePort('teleprompter');
  const [listing, setListing] = useState<Listing>({ phase: 'loading' });
  const { global } = store.fieldsOf(row);
  const value = computerValue(row, global);

  const load = useCallback(() => {
    setListing({ phase: 'loading' });
    teleprompter.teleprompterDevices().then(
      (result) => setListing({ phase: 'ready', devices: result.devices, problem: result.error ?? undefined }),
      (failure: unknown) => setListing({ phase: 'ready', devices: [], problem: describeApiError(failure) }),
    );
  }, [teleprompter]);
  useEffect(load, [load]);

  const controlId = `set-${row.id}`;
  const choose = (next: string) => void store.write(row, 'global', next === row.def ? null : next);
  if (!global) return null;

  // While the list is read the picker is already there with the current choice (a deep link focuses it at once).
  const devices = listing.phase === 'ready' ? listing.devices : [];
  const problem = listing.phase === 'ready' ? listing.problem : undefined;
  if (listing.phase === 'ready' && devices.length === 0) {
    return (
      <div className="flex w-full min-w-0 flex-col items-start gap-1.5">
        <ValueControl row={row} field={global} id={controlId} value={value} onChange={choose} />
        <span className="max-w-[60ch] text-[0.8125rem] text-[var(--text-muted)]">
          {problem ? `The microphones could not be listed: ${problem} ` : 'No microphone was found. '}
          Type the device name the Booth should use, or leave it empty for the system input.
        </span>
        <Button variant="secondary" size="sm" onClick={load}>
          Refresh the list
        </Button>
      </div>
    );
  }
  const known = value === '' || devices.some((device) => device.name === value);
  // The select takes the settings' one field width and the button goes on its own line under it, as in Voice sample output, so the two rows
  // line up at every width (alignment audit R3SE1-4, XSE2-8, R4SE2-4).
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-2">
      <Select
        label="Microphone"
        id={controlId}
        className={FIELD_WIDTH}
        value={value}
        onChange={choose}
        options={[
          { value: '', label: 'System default' },
          ...devices.map((device) => ({ value: device.name, label: device.name })),
          ...(known ? [] : [{ value, label: `${value} (not found)` }]),
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={load}>
          Refresh the list
        </Button>
        {listing.phase === 'loading' && <span className="text-[0.8125rem] text-[var(--text-muted)]">Looking for microphones…</span>}
      </div>
      {problem && <span className="max-w-[60ch] text-[0.8125rem] text-[var(--text-muted)]">{problem}</span>}
    </div>
  );
}
