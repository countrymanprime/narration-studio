import { useCallback, useEffect, useId, useState } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import type { TeleprompterDevice } from '../../../types';
import { Button } from '../../primitives/Button';
import { Select } from '../../primitives/Select';
import { useSettingsStore } from '../data/SettingsStore';
import { computerValue } from '../data/values';
import { rowOf } from '../registry/rows';
import { ValueControl } from '../row/ValueControl';

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
  const uid = useId();
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

  const choose = (next: string) => void store.write(row, 'global', next === row.def ? null : next);
  if (!global) return null;

  if (listing.phase === 'loading') return <p className="text-[0.8125rem] text-[var(--text-muted)]">Looking for microphones…</p>;
  const { devices, problem } = listing;
  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <ValueControl row={row} field={global} id={`${uid}-text`} value={value} onChange={choose} />
        <span className="max-w-[52ch] text-[0.8125rem] text-[var(--text-muted)]">
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
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        label="Microphone"
        className="max-w-full"
        value={value}
        onChange={choose}
        options={[
          { value: '', label: 'System default' },
          ...devices.map((device) => ({ value: device.name, label: device.name })),
          ...(known ? [] : [{ value, label: `${value} (not found)` }]),
        ]}
      />
      <Button variant="secondary" size="sm" onClick={load}>
        Refresh the list
      </Button>
      {problem && <span className="text-[0.8125rem] text-[var(--text-muted)]">{problem}</span>}
    </div>
  );
}
