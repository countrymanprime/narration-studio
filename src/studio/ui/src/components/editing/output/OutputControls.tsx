import type { ReactNode } from 'react';
import { RATES, rateLabel, type OutputPrefs } from '../../engine/outputPrefs';
import type { MonitorLevelState } from '../../booth/frame/useMonitorLevel';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { Popover } from '../../primitives/Popover';
import { Select } from '../../primitives/Select';
import { Slider } from '../../primitives/Slider';
import { ToggleGroup } from '../../primitives/ToggleGroup';
import type { DeviceListing } from './useOutputDevices';

/** The DAW's monitor level, offered only with a DAW whose `monitor_level` capability is on. It sets the DAW's own output, not this player's. */
export type DawMonitor = { name: string; level: MonitorLevelState; onLevel: (level: number) => void };

export type OutputControlsProps = {
  prefs: OutputPrefs;
  onChange: (patch: Partial<OutputPrefs>) => void;
  devices: DeviceListing;
  /** Why the chosen output could not be used (the sound plays on the system default meanwhile), or null. */
  deviceProblem: string | null;
  /** Reads the outputs again now. */
  onCheckDevices: () => void;
  /** Opens the popover at first; a story draws its states this way. */
  defaultOpen?: boolean;
  /** Rows a later change adds at the foot of the popover (the story draws the ones that need a new host call here). */
  children?: ReactNode;
};

const HEADING = 'text-xs font-semibold text-[var(--text-muted)] uppercase';

function Note({ children, alert = false }: { children: ReactNode; alert?: boolean }) {
  return (
    <p
      role={alert ? 'alert' : undefined}
      className={`m-0 text-xs [overflow-wrap:anywhere] ${alert ? 'text-[var(--danger-text)]' : 'text-[var(--text-muted)]'}`}
    >
      {children}
    </p>
  );
}

/** The output device: the system default, this computer's named outputs, and a saved output that is not connected, kept chosen and said so. */
function DeviceRow({
  prefs,
  devices,
  deviceProblem,
  onChange,
  onCheckDevices,
}: Pick<OutputControlsProps, 'prefs' | 'devices' | 'deviceProblem' | 'onChange' | 'onCheckDevices'>) {
  const listed = devices.phase === 'ready' && devices.status === 'ok' ? devices.outputs : [];
  const missing = prefs.device !== '' && devices.phase === 'ready' && !listed.some((o) => o.label === prefs.device);
  const options = [
    { value: '', label: 'System default' },
    ...listed.map((o) => ({ value: o.label, label: o.label })),
    ...(missing ? [{ value: prefs.device, label: `${prefs.device} (not connected)` }] : []),
  ];
  const off = devices.phase === 'loading' || (devices.phase === 'ready' && devices.status === 'unavailable');
  return (
    <div className="flex flex-col gap-1.5">
      <span className={HEADING}>Output</span>
      <Select label="Output device" fullWidth value={prefs.device} options={options} disabled={off} onChange={(device) => onChange({ device })} />
      {devices.phase === 'loading' ? <Note>Listing outputs…</Note> : null}
      {devices.phase === 'ready' && devices.status === 'unavailable' ? (
        <Note alert>This computer would not list its outputs, so the choice is off. Sound plays on the system default.</Note>
      ) : null}
      {deviceProblem ? <Note alert>{deviceProblem}</Note> : null}
      {missing || (devices.phase === 'ready' && devices.status === 'unavailable') ? (
        <Button variant="secondary" size="sm" className="self-start" onClick={onCheckDevices}>
          Check again
        </Button>
      ) : null}
    </div>
  );
}

/** The DAW's monitor level: loading, the level (the DAW may round it), or the DAW's own sentence for why it is off. */
export function MonitorRow({ daw }: { daw: DawMonitor }) {
  const { level } = daw;
  const label = `${daw.name} monitor level`;
  const [value, shown, disabled, note] =
    level.kind === 'loading'
      ? [0, '…', true, `Reading the level from ${daw.name}…`]
      : level.kind === 'ready'
        ? [level.level, String(level.level), false, level.problem]
        : [level.level ?? 0, level.level === null ? '—' : String(level.level), true, level.message];
  return (
    <div className="flex flex-col gap-1">
      <Slider label={label} valueText={shown} value={value} onValueChange={daw.onLevel} disabled={disabled} />
      <Note alert={Boolean(note) && level.kind !== 'loading'}>{note ?? `Sets ${daw.name}'s own output when it plays. It does not change this player.`}</Note>
    </div>
  );
}

/**
 * The Editing page's output controls, a group at the left of the transport bar: silence, and the Output popover with the speed (the pitch is
 * kept), the volume and the output device. A speed other than 1× is written beside the buttons, so it is never a hidden setting. What it changes
 * is the sound this page plays (the chapter and a take); `children` are the rows below the device: with a DAW, `DawMonitorRow`. No modal
 * (docs/design/editing-output-audio.md).
 */
export function OutputControls({ prefs, onChange, devices, deviceProblem, onCheckDevices, defaultOpen, children }: OutputControlsProps) {
  return (
    <div role="group" aria-label="Output" className="flex items-center gap-1.5">
      <IconButton
        action="silenceOutput"
        label="Silence output"
        aria-pressed={prefs.muted}
        className="cursor-pointer"
        onClick={() => onChange({ muted: !prefs.muted })}
      />
      <Popover
        label="Output"
        side="top"
        align="start"
        fitToWindow
        defaultOpen={defaultOpen}
        trigger={<IconButton action="outputAudio" aria-haspopup="dialog" className="cursor-pointer" />}
      >
        <div className="flex w-72 max-w-[min(24rem,calc(100vw-4rem))] flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className={HEADING}>Speed</span>
            <ToggleGroup
              label="Speed"
              look="segmented"
              value={String(prefs.rate)}
              onChange={(rate) => onChange({ rate: Number(rate) })}
              options={RATES.map((rate) => ({ value: String(rate), label: rateLabel(rate) }))}
            />
            <Note>The pitch of the voice is kept.</Note>
          </div>
          <Slider label="Volume" valueText={`${prefs.volume}%`} value={prefs.volume} onValueChange={(volume) => onChange({ volume })} />
          <DeviceRow prefs={prefs} devices={devices} deviceProblem={deviceProblem} onChange={onChange} onCheckDevices={onCheckDevices} />
          {children}
        </div>
      </Popover>
      {prefs.rate === 1 ? null : <span className="font-mono text-[13px] whitespace-nowrap text-[var(--text-muted)]">{rateLabel(prefs.rate)}</span>}
    </div>
  );
}
