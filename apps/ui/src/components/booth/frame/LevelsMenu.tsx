import { useEffect, useState } from 'react';
import type { RecordingEngine, RecorderDevice } from '../../../api/contracts/recording';
import type { TeleprompterDevice } from '../../../api/contracts/teleprompter';
import { usePort } from '../../../ports/usePort';
import { IconButton } from '../../primitives/IconButton';
import { LevelMeter } from '../../primitives/LevelMeter';
import { Popover } from '../../primitives/Popover';
import { Select } from '../../primitives/Select';
import { Badge } from '../../primitives/StatusBadge';
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
  /**
   * With a DAW, the microphone the Booth listens to so the text follows the voice: the DAW's own input when it named one
   * (`fromDaw`, ADR 0250), else the narrator's pick from the teleprompter's devices, with the host's `note` on why.
   */
  listen?: { devices: readonly TeleprompterDevice[]; fromDaw: boolean; note: string | null };
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
/** The microphone the Booth listens to while a DAW records: named when the DAW chose it, else picked from the listed devices. */
function Listening({
  dawName,
  device,
  onDevice,
  listen,
}: {
  dawName: string;
  device: string;
  onDevice: (device: string) => void;
  listen: NonNullable<LevelsMenuProps['listen']>;
}) {
  if (listen.fromDaw)
    return (
      <div className="text-sm text-[var(--text)]">
        <b>{device}</b>
        <div className="text-[var(--text-muted)]">Chosen in {dawName}</div>
      </div>
    );
  const note = listen.note ? <p className="text-xs text-[var(--text-muted)]">{listen.note}</p> : null;
  if (listen.devices.length === 0)
    return (
      <>
        <p role="alert" className="text-sm text-[var(--danger-text)]">
          No microphone found
        </p>
        {note}
      </>
    );
  const options = [
    ...(device === '' ? [{ value: '', label: 'Choose a microphone…' }] : []),
    ...listen.devices.map((d) => ({ value: d.name, label: d.name })),
    ...(device !== '' && !listen.devices.some((d) => d.name === device) ? [{ value: device, label: `${device} (not found)` }] : []),
  ];
  return (
    <>
      <Select label="Microphone" fullWidth value={device} options={options} onChange={onDevice} />
      <p className="text-xs text-[var(--text-muted)]">The Booth listens to it to follow your reading.</p>
      {note}
    </>
  );
}

export function LevelsMenu({ engine, dawName, reachable, offReason, device, onDevice, listen, level, error, open, onOpenChange }: LevelsMenuProps) {
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
            <>
              {off ? <div className="text-sm text-[var(--text)]">{offReason ?? `${dawName} is not running`}</div> : null}
              {listen ? (
                <Listening dawName={dawName} device={device} onDevice={onDevice} listen={listen} />
              ) : off ? null : (
                <div className="text-sm text-[var(--text)]">Chosen in {dawName}</div>
              )}
            </>
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
      <span className="whitespace-nowrap">
        <Badge
          label={roomTone}
          look="outline"
          colors={{ fill: 'var(--surface)', text: roomToneOk ? 'var(--ok-text)' : 'var(--text-muted)', line: 'var(--btn-line)' }}
        />
      </span>
    </div>
  );
}
