import { useEffect, useState } from 'react';
import type { RecordingEngine, RecorderDevice } from '../../../api/contracts/recording';
import { usePort } from '../../../ports/usePort';
import { IconButton } from '../../primitives/IconButton';
import { LevelMeter } from '../../primitives/LevelMeter';
import { Popover } from '../../primitives/Popover';
import { Select } from '../../primitives/Select';
import type { InputLevel } from './useLevels';

export type LevelsMenuProps = {
  /** Which engine records: with a DAW the microphone is chosen in the DAW, with the built-in recorder here. */
  engine: RecordingEngine;
  /** The DAW's name from its capabilities ("REAPER"), used in "Chosen in REAPER". */
  dawName: string;
  /** Whether the DAW is answering; with it off the levels are disabled and `offReason` is the sentence to show. */
  reachable: boolean;
  offReason?: string;
  device: string;
  onDevice: (device: string) => void;
  level: InputLevel | null;
  error: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function Devices({ device, onDevice }: { device: string; onDevice: (device: string) => void }) {
  const recording = usePort('recording');
  const [devices, setDevices] = useState<RecorderDevice[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void recording.recorderDevices().then((result) => {
      if (cancelled) return;
      setDevices(result.devices);
      setProblem(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [recording]);
  if (devices === null) return <p className="text-sm text-[var(--text-muted)]">Listing microphones…</p>;
  if (devices.length === 0)
    return (
      <p role="alert" className="text-sm text-[var(--danger-text)]">
        {problem || 'No microphone found'}
      </p>
    );
  const options = [
    ...(device === '' ? [{ value: '', label: 'Choose a microphone…' }] : []),
    ...devices.map((d) => ({ value: d.name, label: d.name })),
    ...(device !== '' && !devices.some((d) => d.name === device) ? [{ value: device, label: `${device} (not found)` }] : []),
  ];
  return <Select label="Microphone" fullWidth value={device} options={options} onChange={onDevice} />;
}

/**
 * Recording levels and the microphone, together, in one menu at the foot of the Booth beside Record (the mock's `LevelsMenu`):
 * an icon button with a tooltip. The room tone is not repeated here; it stays in the footer.
 */
export function LevelsMenu({ engine, dawName, reachable, offReason, device, onDevice, level, error, open, onOpenChange }: LevelsMenuProps) {
  const off = engine === 'daw' && !reachable;
  return (
    <Popover
      label="Levels"
      side="top"
      open={open}
      onOpenChange={onOpenChange}
      trigger={<IconButton action="levels" label="Levels" id="blevels" aria-haspopup="dialog" />}
    >
      <div className="flex min-w-72 flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">Input</span>
          <LevelMeter label="Input level" peak={off ? null : (level?.peak ?? null)} rms={off ? null : (level?.rms ?? null)} size="regular" />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">Microphone</span>
          {engine === 'builtin' ? (
            <Devices device={device} onDevice={onDevice} />
          ) : (
            <div className="text-sm text-[var(--text)]">{off ? <span>{offReason ?? `${dawName} is not running`}</span> : <span>Chosen in {dawName}</span>}</div>
          )}
          {error ? (
            <span role="alert" className="text-xs text-[var(--danger-text)]">
              {error}
            </span>
          ) : null}
        </div>
      </div>
    </Popover>
  );
}

/** The meter and the room tone chip at the right of the footer (the mock's `.lvl-inline`, `margin-left: auto`). */
export function LevelsInline({ level, roomTone, roomToneOk }: { level: InputLevel | null; roomTone: string; roomToneOk: boolean }) {
  return (
    <div role="group" aria-label="Input" className="ml-auto flex min-w-0 items-center gap-3">
      <div className="w-28">
        <LevelMeter label="Input level" peak={level?.peak ?? null} rms={level?.rms ?? null} size="compact" />
      </div>
      <span
        className={`rounded-full border border-[var(--btn-line)] bg-[var(--surface)] px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${roomToneOk ? 'text-[var(--ok-text)]' : 'text-[var(--text-muted)]'}`}
      >
        {roomTone}
      </span>
    </div>
  );
}
