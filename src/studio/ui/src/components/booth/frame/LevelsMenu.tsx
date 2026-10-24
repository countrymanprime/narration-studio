import { useEffect, useState } from 'react';
import type { DawCapabilitySupport } from '../../../api/contracts/daw';
import type { RecordingEngine, RecorderDevice } from '../../../api/contracts/recording';
import type { TeleprompterDevice } from '../../../api/contracts/teleprompter';
import { usePort } from '../../../ports/usePort';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { LevelMeter } from '../../primitives/LevelMeter';
import { Popover } from '../../primitives/Popover';
import { Select } from '../../primitives/Select';
import { NumberInput } from '../../primitives/NumberInput';
import { Slider } from '../../primitives/Slider';
import { Badge } from '../../primitives/StatusBadge';
import type { InputLevel } from './useLevels';
import { useDawMeters, type DawMetersState } from './useDawMeters';
import { useMonitorLevel } from './useMonitorLevel';
import { usePunchPreroll } from './usePunchPreroll';

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
   * (`fromDaw`), else the narrator's pick from the teleprompter's devices, with the host's `note` on why.
   */
  listen?: { devices: readonly TeleprompterDevice[]; fromDaw: boolean; note: string | null };
  /**
   * What the DAW says about setting the levels (its `monitor_level` and `input_level` capabilities): the two sliders the mock's menu has, and
   * about reading its own meters (`daw_meters`), shown under them. Absent until the capabilities are read, and then there are no sliders to
   * show. `onOpenSettings` leads to the Experimental switch when that is all that keeps one off.
   */
  levels?: {
    monitor: DawCapabilitySupport | undefined;
    input: DawCapabilitySupport | undefined;
    meters?: DawCapabilitySupport | undefined;
    onOpenSettings?: () => void;
  };
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
        <b className="[overflow-wrap:anywhere]">{device}</b>
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

/** One slider of the menu: its name, the level it shows (or a dash), and the sentence that says why it is off or what went wrong. */
function LevelRow({
  label,
  value,
  shown,
  onChange,
  disabled,
  note,
  alert = false,
}: {
  label: string;
  value: number;
  shown: string;
  onChange?: (value: number) => void;
  disabled: boolean;
  note?: string;
  alert?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Slider label={label} valueText={shown} value={value} onValueChange={onChange ?? (() => undefined)} disabled={disabled} />
      {note ? (
        <span
          role={alert ? 'alert' : undefined}
          className={`text-xs [overflow-wrap:anywhere] ${alert ? 'text-[var(--danger-text)]' : 'text-[var(--text-muted)]'}`}
        >
          {note}
        </span>
      ) : null}
    </div>
  );
}

/** The DAW's own meter for one side, under its slider: the level in dBFS on the shared meter, or why there is none. */
function DawMeter({ caption, label, db, why }: { caption: string; label: string; db: number | null; why?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="shrink-0 text-xs text-[var(--text-muted)]">
          {caption}
        </span>
        <div className="min-w-0 flex-1">
          <LevelMeter label={label} peak={db} rms={db} size="compact" />
        </div>
      </div>
      {why ? <span className="text-xs [overflow-wrap:anywhere] text-[var(--text-muted)]">{why}</span> : null}
    </div>
  );
}

/** What the DAW's meters say about one side: its level, or the sentence for a meter that is loading, off or quiet. */
function meterFor(state: DawMetersState, side: 'input' | 'output', dawName: string): { db: number | null; why?: string } {
  if (state.kind === 'loading') return { db: null, why: `Reading the levels from ${dawName}…` };
  if (state.kind === 'off' || state.kind === 'quiet') return { db: null, why: side === 'input' ? state.message : undefined };
  if (side === 'output') return { db: state.meters.output };
  if (state.meters.input === null) return { db: null, why: `No track is armed in ${dawName}: its input level shows once one is.` };
  return { db: state.meters.input, why: `Heard on “${state.meters.inputTrack}” in ${dawName}.` };
}

/** "Turn on in Settings" beside a capability that is off only because Experimental DAW actions are. */
function TurnOn({ support, onOpenSettings }: { support: DawCapabilitySupport | undefined; onOpenSettings?: () => void }) {
  if (!onOpenSettings || support?.reason !== 'experimental_off') return null;
  return (
    <span>
      <Button variant="secondary" size="sm" onClick={onOpenSettings}>
        Turn on in Settings
      </Button>
    </span>
  );
}

/** The monitor level while the DAW can set it: read when the menu opens, sent when the drag rests, refused in the DAW's own sentence. */
function MonitorLevelRow() {
  const { state, set } = useMonitorLevel();
  if (state.kind === 'loading') return <LevelRow label="Monitor level (output)" value={0} shown="…" disabled note="Reading the level from the DAW…" />;
  if (state.kind === 'ready')
    return (
      <LevelRow label="Monitor level (output)" value={state.level} shown={String(state.level)} onChange={set} disabled={false} note={state.problem} alert />
    );
  return (
    <LevelRow
      label="Monitor level (output)"
      value={state.level ?? 0}
      shown={state.level === null ? '—' : String(state.level)}
      disabled
      note={state.message}
      alert
    />
  );
}

/**
 * The mock's two sliders under the microphone: Input level and Monitor level (output), each off with the reason when the DAW cannot set it,
 * and under each the DAW's own meter for that side (`daw_meters`) when the DAW can read them: the armed track's input and the output.
 */
function LevelSliders({ levels, dawName }: { levels: NonNullable<LevelsMenuProps['levels']>; dawName: string }) {
  const { monitor, input, meters, onOpenSettings } = levels;
  const state = useDawMeters(meters?.available === true);
  const reading = meters?.available === true;
  const inputMeter = reading ? meterFor(state, 'input', dawName) : null;
  const outputMeter = reading ? meterFor(state, 'output', dawName) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <LevelRow label="Input level" value={0} shown="—" disabled note={input?.message ?? 'The input level cannot be set from here.'} />
        {inputMeter ? <DawMeter caption={`${dawName} input`} label={`${dawName} input level`} db={inputMeter.db} why={inputMeter.why} /> : null}
      </div>
      <div className="flex flex-col gap-1">
        {monitor?.available ? (
          <MonitorLevelRow />
        ) : (
          <LevelRow label="Monitor level (output)" value={0} shown="—" disabled note={monitor?.message ?? 'The monitor level cannot be set from here.'} />
        )}
        <TurnOn support={monitor} onOpenSettings={onOpenSettings} />
        {outputMeter ? <DawMeter caption={`${dawName} output`} label={`${dawName} output level`} db={outputMeter.db} why={outputMeter.why} /> : null}
      </div>
      {meters && !meters.available ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs [overflow-wrap:anywhere] text-[var(--text-muted)]">
            {dawName}&rsquo;s own input and output levels: {meters.message}
          </span>
          {monitor?.reason === 'experimental_off' ? null : <TurnOn support={meters} onOpenSettings={onOpenSettings} />}
        </div>
      ) : null}
    </div>
  );
}

/** How far before a word "Punch from here" starts: a computer-wide number, set here because only punching reads it. Offered with a DAW, the only recorder that punches. */
function PunchPrerollRow() {
  const { preroll, error, set } = usePunchPreroll();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">Punch</span>
      {preroll ? (
        <NumberInput label="Punch pre-roll (seconds)" value={preroll.value} min={preroll.min} max={preroll.max} step={preroll.step} onValueChange={set} />
      ) : null}
      <span className="text-xs text-[var(--text-muted)]">Seconds before the word that “Punch from here” starts, for every project. Also in Settings.</span>
      {error ? (
        <span role="alert" className="text-xs [overflow-wrap:anywhere] text-[var(--danger-text)]">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function LevelsMenu({ engine, dawName, reachable, offReason, device, onDevice, listen, levels, level, error, open, onOpenChange }: LevelsMenuProps) {
  const off = engine === 'daw' && !reachable;
  return (
    <Popover
      label="Levels"
      side="top"
      open={open}
      onOpenChange={onOpenChange}
      trigger={<IconButton action="levels" label="Levels" id="blevels" aria-haspopup="dialog" />}
    >
      <div className="flex w-max max-w-[min(26rem,calc(100vw-4rem))] min-w-72 flex-col gap-3">
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
        {levels ? <LevelSliders levels={levels} dawName={dawName} /> : null}
        {engine === 'daw' ? <PunchPrerollRow /> : null}
      </div>
    </Popover>
  );
}

/** The meter and the room tone chip at the right of the footer (the mock's `.lvl-inline`, `margin-left: auto`). */
export function LevelsInline({
  level,
  roomTone,
  roomToneOk,
  roomToneHint,
}: {
  level: InputLevel | null;
  roomTone: string;
  roomToneOk: boolean;
  roomToneHint?: string;
}) {
  return (
    <div role="group" aria-label="Input" className="ml-auto flex min-w-0 items-center gap-3">
      <div className="w-28">
        <LevelMeter label="Input level" peak={level?.peak ?? null} rms={level?.rms ?? null} size="compact" />
      </div>
      <span className="whitespace-nowrap" title={roomToneHint}>
        <Badge
          label={roomTone}
          look="outline"
          colors={{ fill: 'var(--surface)', text: roomToneOk ? 'var(--ok-text)' : 'var(--text-muted)', line: 'var(--btn-line)' }}
        />
      </span>
    </div>
  );
}
