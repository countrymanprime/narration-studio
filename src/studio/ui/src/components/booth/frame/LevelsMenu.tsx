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
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '../../primitives/Collapsible';
import type { InputLevel } from './useLevels';
import { useDawMeters, type DawMetersState } from './useDawMeters';
import { useMonitorLevel } from './useMonitorLevel';
import { usePunchPreroll } from './usePunchPreroll';
import { useDawPreroll } from './useDawPreroll';
import type { ListeningMic } from '../listening/useListeningMic';

export type ListenProps = {
  devices: readonly TeleprompterDevice[];
  mic: Pick<ListeningMic, 'origin' | 'candidates' | 'dawInput' | 'note' | 'overridden'> & { outputDevice?: string };
  /** One of the DAW's candidates: listened on while the DAW's input still decides. */
  onPick: (device: string) => void;
  /** "Choose a different one": the narrator's microphone, kept over the DAW's input. */
  onChooseOverDaw: (device: string) => void;
  /** Back to the DAW's own input. */
  onFollowDaw: () => void;
};

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
   * With a DAW, the microphone the Booth listens to so the text follows the voice: the DAW's own input by default (`mic.origin` `daw`),
   * one of the `candidates` its input could be (`uncertain`, a one-click pick), or the narrator's own choice, with the host's `note` on
   * why. `device` is the microphone listened on.
   */
  listen?: ListenProps;
  /**
   * What the DAW says about setting the levels (its `monitor_level` and `input_level` capabilities): the two sliders the mock's menu has, and
   * about reading its own meters (`daw_meters`), shown under them. Absent until the capabilities are read, and then there are no sliders to
   * show. `onOpenSettings` leads to the Experimental switch when that is all that keeps the monitor slider off; the meters and the pre-roll
   * only read, so they need no switch.
   */
  levels?: {
    monitor: DawCapabilitySupport | undefined;
    input: DawCapabilitySupport | undefined;
    preroll?: DawCapabilitySupport | undefined;
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
/** The microphone picker over the teleprompter's devices; a chosen name the list no longer holds stays shown as not found. */
function MicSelect({ device, devices, onChange }: { device: string; devices: readonly TeleprompterDevice[]; onChange: (device: string) => void }) {
  const options = [
    ...(device === '' ? [{ value: '', label: 'Choose a microphone…' }] : []),
    ...devices.map((d) => ({ value: d.name, label: d.name })),
    ...(device !== '' && !devices.some((d) => d.name === device) ? [{ value: device, label: `${device} (not found)` }] : []),
  ];
  return <Select label="Microphone" fullWidth value={device} options={options} onChange={onChange} />;
}

const MUTED = 'text-xs [overflow-wrap:anywhere] text-[var(--text-muted)]';

/**
 * The microphone the Booth listens to while a DAW records. By default it is the DAW's own input, shown read-only ("Same as REAPER");
 * when that input could be one of several microphones, one button each picks it; "Choose a different one" keeps the narrator's own
 * microphone over the DAW's until "Use REAPER's input". With no DAW input to follow, the narrator's pick from the listed devices.
 */
function Listening({ dawName, device, listen }: { dawName: string; device: string; listen: ListenProps }) {
  const { mic, devices } = listen;
  const [choosing, setChoosing] = useState(false);
  const plays = mic.outputDevice ? <p className={MUTED}>{`${dawName} plays on ${mic.outputDevice}.`}</p> : null;
  const records = mic.dawInput ? <p className={MUTED}>{`${dawName} records from ${mic.dawInput}.`}</p> : null;
  if (devices.length === 0)
    return (
      <>
        <p role="alert" className="text-sm text-[var(--danger-text)]">
          No microphone found
        </p>
        {mic.note ? <p className={MUTED}>{mic.note}</p> : null}
      </>
    );
  if (mic.overridden || choosing)
    return (
      <>
        <MicSelect
          device={device}
          devices={devices}
          onChange={(next) => {
            setChoosing(false);
            listen.onChooseOverDaw(next);
          }}
        />
        <p className={MUTED}>{`Your choice, kept over ${dawName}'s input.`}</p>
        {records}
        <span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setChoosing(false);
              listen.onFollowDaw();
            }}
          >
            {`Use ${dawName}'s input`}
          </Button>
        </span>
      </>
    );
  const different = (
    <span>
      <Button variant="ghost" size="sm" onClick={() => setChoosing(true)}>
        Choose a different one
      </Button>
    </span>
  );
  const picks =
    mic.candidates.length > 1 ? (
      <div role="group" aria-label={`Which microphone ${dawName} records from`} className="flex flex-wrap gap-1.5">
        {mic.candidates.map((candidate) => (
          <Button
            key={candidate}
            variant={candidate === device && mic.origin === 'daw' ? 'primary' : 'secondary'}
            size="sm"
            aria-pressed={candidate === device && mic.origin === 'daw'}
            onClick={() => listen.onPick(candidate)}
          >
            <span className="[overflow-wrap:anywhere]">{candidate}</span>
          </Button>
        ))}
      </div>
    ) : null;
  if (mic.origin === 'daw')
    return (
      <>
        <div className="text-sm text-[var(--text)]">
          <b className="[overflow-wrap:anywhere]">{device}</b>
          <div className="text-[var(--text-muted)]">{`Same as ${dawName}`}</div>
        </div>
        {records}
        {picks}
        {plays}
        {different}
      </>
    );
  if (mic.origin === 'uncertain')
    return (
      <>
        <p role="status" className="text-sm [overflow-wrap:anywhere] text-[var(--warn-text)]">
          {mic.note ?? `${dawName}'s input could be any of these microphones. Pick the one it uses.`}
        </p>
        {picks}
        <p className={MUTED}>{`Listening to ${device} until you pick.`}</p>
        {plays}
        {different}
      </>
    );
  return (
    <>
      <MicSelect device={device} devices={devices} onChange={listen.onPick} />
      <p className={MUTED}>
        {mic.origin === 'first' ? 'The first microphone listed, until you choose one. ' : ''}The Booth listens to it to follow your reading.
      </p>
      {mic.note ? <p className={MUTED}>{mic.note}</p> : null}
      {plays}
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
function LevelSliders({ levels, dawName, reachable }: { levels: NonNullable<LevelsMenuProps['levels']>; dawName: string; reachable: boolean }) {
  const { monitor, input, meters } = levels;
  // Turning Experimental on helps only while the DAW answers: with it not answering, that is the reason to show, not a switch.
  const onOpenSettings = reachable ? levels.onOpenSettings : undefined;
  const state = useDawMeters(meters?.available === true);
  const reading = meters?.available === true;
  const inputMeter = reading ? meterFor(state, 'input', dawName) : null;
  const outputMeter = reading ? meterFor(state, 'output', dawName) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className={SECTION_LABEL}>Levels</span>
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
        <span className="text-xs [overflow-wrap:anywhere] text-[var(--text-muted)]">
          {dawName}&rsquo;s own input and output levels: {meters.message}
        </span>
      ) : null}
    </div>
  );
}

// The popover's sections (Input, Microphone, Levels, Punch) share one label style and one rhythm: 16 px between sections, 6 px from a
// label to its controls; a control's own label (Input level, Monitor level) is the sentence-case label under it (alignment audit XBO-21).
const SECTION_LABEL = 'text-xs font-semibold text-[var(--text-muted)] uppercase';

/** How far before a word "Punch from here" starts: a computer-wide number, set here because only punching reads it. Offered with a DAW that has no pre-roll of its own. */
function AppPrerollRow() {
  const { preroll, error, set } = usePunchPreroll();
  return (
    <>
      {preroll ? (
        <NumberInput label="Punch pre-roll (seconds)" value={preroll.value} min={preroll.min} max={preroll.max} step={preroll.step} onValueChange={set} />
      ) : null}
      <span className="text-xs text-[var(--text-muted)]">Seconds before the word that “Punch from here” starts, for every project. Also in Settings.</span>
      {error ? (
        <span role="alert" className="text-xs [overflow-wrap:anywhere] text-[var(--danger-text)]">
          {error}
        </span>
      ) : null}
    </>
  );
}

const oneDecimal = (seconds: number): string => seconds.toFixed(1);
const measuresText = (measures: number): string => (measures === 1 ? '1 measure' : `${measures} measures`);

/**
 * The DAW's own pre-roll (#2251 item 11): the one the Booth punches with, so the app shows it rather than a number of its own that could disagree. It
 * is read, never set: one short line with its state and length, and an "i" that opens, inside the menu, what it does and where to change it in the
 * DAW. The note is a disclosure, not a popup: a popup portalled out of the menu would sit outside its dialog.
 */
function DawPrerollRow({ dawName }: { dawName: string }) {
  const state = useDawPreroll();
  const [about, setAbout] = useState(false);
  if (state.kind === 'loading') return <span className="text-xs text-[var(--text-muted)]">Reading the pre-roll from {dawName}…</span>;
  if (state.kind !== 'ready')
    return (
      <span role="alert" className="text-xs [overflow-wrap:anywhere] text-[var(--danger-text)]">
        {state.message}
      </span>
    );
  const { preroll } = state;
  const length = measuresText(preroll.measures);
  return (
    <Collapsible open={about} onOpenChange={setAbout} className="flex flex-col gap-1">
      <span className="flex items-center gap-2 text-sm text-[var(--text)]">
        {`Pre-roll ${preroll.onRecord ? 'on' : 'off'} · ${length} (${oneDecimal(preroll.measures * preroll.measureSeconds)} s)`}
        <CollapsibleTrigger label={`About ${dawName}’s pre-roll`}>
          <span aria-hidden="true" className="font-serif text-sm leading-none font-bold italic">
            i
          </span>
        </CollapsibleTrigger>
      </span>
      <CollapsiblePanel className="text-xs text-[var(--text-muted)]">
        {`${dawName}’s own pre-roll, the lead-in a punch uses. One measure is ${oneDecimal(preroll.measureSeconds)} s at the edit cursor. `}
        {`On, ${dawName} plays from the bar line ${length} or more before the word, then records from the word. Off, a punch records from the word with no lead-in. `}
        {`Change it in ${dawName}, for every project: “Pre-roll: Toggle pre-roll on record” turns it on or off.`}
      </CollapsiblePanel>
    </Collapsible>
  );
}

/** The punch pre-roll, offered with a DAW, the only recorder that punches: the DAW's own when it has one (read only), else the app's. */
function PunchPrerollRow({ dawName, support }: { dawName: string; support: DawCapabilitySupport | undefined }) {
  // A DAW that declares a pre-roll of its own punches with it, so the app's seconds would only disagree with it: its refusal is shown instead.
  const own = support && support.level !== 'unsupported' && support.level !== 'not_yet_available';
  return (
    <div className="flex flex-col gap-1.5">
      <span className={SECTION_LABEL}>Punch</span>
      {own && support.available ? <DawPrerollRow dawName={dawName} /> : null}
      {own && !support.available ? <span className="text-xs [overflow-wrap:anywhere] text-[var(--text-muted)]">{support.message}</span> : null}
      {own ? null : <AppPrerollRow />}
    </div>
  );
}

export function LevelsMenu({ engine, dawName, reachable, offReason, device, onDevice, listen, levels, level, error, open, onOpenChange }: LevelsMenuProps) {
  const off = engine === 'daw' && !reachable;
  return (
    <Popover
      label="Levels"
      side="top"
      // A control in the menu can leave the Booth (Turn on in Settings): a footswitch Enter right after opening must not press it.
      focusPopup
      open={open}
      onOpenChange={onOpenChange}
      trigger={<IconButton action="levels" label="Levels" id="blevels" aria-haspopup="dialog" />}
    >
      <div className="flex w-max max-w-[min(26rem,calc(100vw-4rem))] min-w-72 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className={SECTION_LABEL}>Input</span>
          <LevelMeter label="Input level" peak={off ? null : (level?.peak ?? null)} rms={off ? null : (level?.rms ?? null)} size="regular" />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={SECTION_LABEL}>Microphone</span>
          {engine === 'builtin' ? (
            <Devices device={device} onDevice={onDevice} />
          ) : (
            <>
              {off ? <div className="text-sm text-[var(--text)]">{offReason ?? `${dawName} is not running`}</div> : null}
              {listen ? (
                <Listening dawName={dawName} device={device} listen={listen} />
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
        {levels ? <LevelSliders levels={levels} dawName={dawName} reachable={reachable} /> : null}
        {engine === 'daw' ? <PunchPrerollRow dawName={dawName} support={levels?.preroll} /> : null}
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
    <div role="group" aria-label="Input" className="flex min-w-0 items-center gap-3">
      <div className="w-28">
        <LevelMeter label="Input level" peak={level?.peak ?? null} rms={level?.rms ?? null} size="compact" />
      </div>
      {/* A flex box, not an inline span: the chip is centred on the meter's line, not set on a text baseline 2 px off it (XBO-28). */}
      <span className="inline-flex whitespace-nowrap" title={roomToneHint}>
        <Badge
          label={roomTone}
          look="outline"
          colors={{ fill: 'var(--surface)', text: roomToneOk ? 'var(--ok-text)' : 'var(--text-muted)', line: 'var(--btn-line)' }}
        />
      </span>
    </div>
  );
}
