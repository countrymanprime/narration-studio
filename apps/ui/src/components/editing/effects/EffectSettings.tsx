import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DawFxRangeCompare, DawFxSetting, DawResult } from '../../../api/contracts/daw';
import type { EditWordFxApi, WordFx } from '../../../api/contracts/wordFx';
import { overlay } from '../../../overlay/overlayService';
import type { FxRangeTarget } from '../../../ports/daw';
import { usePort } from '../../../ports/usePort';
import type { Command, Journal, Result } from '../../../studio/journal/createJournal';
import { Button } from '../../primitives/Button';
import { Checkbox } from '../../primitives/Checkbox';
import { NumberInput } from '../../primitives/NumberInput';
import { SectionLabel } from '../../primitives/SectionLabel';
import { Slider } from '../../primitives/Slider';
import type { CutSpan } from '../model';
import type { RangeLocator } from '../range/common/locate';
import { fxSpan } from '../range/fx/fxCommand';
import { fmtPct, impactOf } from './effectsMath';
import { useFxCap } from './useFxCap';

/** What the page lends the inspector to change an effect and hear it: the chapter, where its words are for the DAW, the history, the other effects and the page's playback. */
export interface EffectHost {
  chapterId: string;
  locator: RangeLocator;
  journal: Pick<Journal, 'act' | 'undo' | 'subscribe'>;
  /** The chapter's effects as the page last read them: turning one back on is judged against the others that are on. */
  effects: readonly WordFx[];
  /** The chapter's effects after a bypass is recorded, so the page's coverage figure leaves a bypassed effect out. */
  onEffects: (effects: WordFx[]) => void;
  /** Plays from `from` to `to` seconds of the chapter. */
  play: (from: number, to: number) => void;
  /** Stops the page's playback, so a Compare in the DAW is the one thing playing. */
  stop: () => void;
}

const HostContext = createContext<EffectHost | null>(null);
/** The page mounts this around the Effects tab. Without it the inspector keeps its settings, Bypass, Preview and Compare off. */
export const EffectHostProvider = HostContext.Provider;
export const useEffectHost = (): EffectHost | null => useContext(HostContext);

/** The words an effect is on before and after a Preview, in seconds (the mock's "Preview with 2 s before and after"). */
const PREVIEW_PAD = 2;

/** The controls the DAW cannot back: each stays, disabled, and says why. */
const Off = ({ id, dawName, children }: { id: string; dawName: string; children: ReactNode }) => (
  <div className="flex items-center gap-2">
    {children}
    <span id={id} className="text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
      Not available in {dawName}.
    </span>
  </div>
);

/** Settings, Bypass, Preview and Compare drawn off, with the DAW's own sentence under them when it gave one. */
export function OffControls({ dawName, why = '' }: { dawName: string; why?: string }) {
  return (
    <>
      <Off id="fx-off-settings" dawName={dawName}>
        <Button variant="secondary" size="sm" disabled aria-describedby="fx-off-settings">
          Settings
        </Button>
      </Off>
      <Off id="fx-off-bypass" dawName={dawName}>
        <Checkbox checked={false} disabled onChange={() => {}}>
          Bypass this effect
        </Checkbox>
      </Off>
      <Off id="fx-off-preview" dawName={dawName}>
        <Button variant="secondary" size="sm" disabled aria-describedby="fx-off-preview">
          Preview
        </Button>
        <Button variant="secondary" size="sm" disabled aria-describedby="fx-off-preview">
          Compare
        </Button>
      </Off>
      {why ? (
        <p data-why className="m-0 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
          {why}
        </p>
      ) : null}
    </>
  );
}

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const failed = (e: unknown): DawResult => ({ ok: false, changed: false, message: why(e), undoSteps: 0, refused: why(e) });
const refusal = (code: string, reason: string): Result<never> => ({ ok: false, refusal: { code, reason } });
const okOrRefusal = (res: DawResult): Result<DawResult> => (res.ok ? { ok: true, value: res } : refusal(res.code ?? 'daw_refused', res.refused ?? res.message));

/** The first and last alignment tokens of an effect's script words, or null when it has none. */
function targetOf(fx: WordFx, chapterId: string, locator: RangeLocator): FxRangeTarget | null {
  const tokens = fx.keys.map((k) => locator.token(k)).filter((t): t is number => t !== undefined);
  return tokens.length ? { chapterId, firstToken: Math.min(...tokens), lastToken: Math.max(...tokens), chainName: fx.chainId } : null;
}

type Daw = ReturnType<typeof usePort<'daw'>>;
type Log = Pick<EditWordFxApi, 'editingWordFxBypass'>;

/** Records an effect's bypass and hands the page the effects after it; a refusal is the host's sentence. */
async function recordBypass(log: Log, onEffects: EffectHost['onEffects'], fx: WordFx, bypass: boolean): Promise<string | null> {
  try {
    onEffects((await log.editingWordFxBypass(fx.chapterId, fx.id, bypass)).effects);
    return null;
  } catch (e) {
    return why(e);
  }
}

/** One setting changed as one history entry: the DAW sets it (one undo step of its own), and Undo sets it back. */
function setCommand(daw: Daw, target: FxRangeTarget, fx: WordFx, setting: DawFxSetting, value: number, previous: number): Command<DawResult> {
  const change = (to: number) => daw.setFxRangeParam({ ...target, fx: setting.fx, index: setting.index, value: to }).catch(failed);
  return {
    label: `Set ${setting.name} of ${fx.chainName} to ${value}`,
    touches: [`editing/${target.chapterId}/wordfx`],
    daw: true,
    async run() {
      const res = okOrRefusal(await change(value));
      return res.ok && !res.value.changed ? refusal('nothing_changed', res.value.message) : res;
    },
    undo: async () => okOrRefusal(await change(previous)),
  };
}

/**
 * Bypass or turning back on as one history entry: the DAW switches the chain, then the effect's record keeps it so the coverage figure
 * counts only the effects that are on. Undo does both the other way.
 */
function bypassCommand(daw: Daw, log: Log, onEffects: EffectHost['onEffects'], target: FxRangeTarget, fx: WordFx, bypass: boolean): Command<DawResult> {
  // A run that changes nothing in the DAW records nothing; an Undo puts the record back whatever the DAW answered.
  const to = async (b: boolean, mustChange: boolean): Promise<Result<DawResult>> => {
    const res = okOrRefusal(await daw.bypassFxRange(target, b).catch(failed));
    if (!res.ok) return res;
    if (mustChange && !res.value.changed) return refusal('nothing_changed', res.value.message);
    const notKept = await recordBypass(log, onEffects, fx, b);
    return notKept ? refusal('record_failed', `${notKept} The DAW ${b ? 'bypassed' : 'turned on'} the effect: undo it there (Edit > Undo).`) : res;
  };
  return {
    label: `${bypass ? 'Bypassed' : 'Turned on'} ${fx.chainName}`,
    touches: [`editing/${target.chapterId}/wordfx`],
    daw: true,
    run: () => to(bypass, true),
    undo: () => to(!bypass, false),
  };
}

/**
 * Compare as one history entry: the DAW plays the words with the effect on, then bypassed, and puts it back, adding no undo step of its own.
 * Undo stops a Compare still playing and leaves the effect as it was before (`was`), in the DAW and the record.
 */
function compareCommand(daw: Daw, log: Log, onEffects: EffectHost['onEffects'], target: FxRangeTarget, fx: WordFx, was: boolean): Command<DawFxRangeCompare> {
  return {
    label: `Compared ${fx.chainName} with and without`,
    touches: [`editing/${target.chapterId}/wordfx`],
    daw: true,
    async run() {
      const answer = await daw.compareFxRange(target).catch((e: unknown) => ({ result: failed(e), pass: 0 }));
      const res = okOrRefusal(answer.result);
      return res.ok ? { ok: true, value: answer } : res;
    },
    async undo() {
      await daw.stopFxCompare().catch(failed);
      const res = okOrRefusal(await daw.bypassFxRange(target, was).catch(failed));
      if (!res.ok) return res;
      const notKept = fx.bypassed === was ? null : await recordBypass(log, onEffects, fx, was);
      return notKept ? refusal('record_failed', notKept) : res;
    },
  };
}

type Read = { kind: 'reading' } | { kind: 'off'; why: string } | { kind: 'ready'; settings: DawFxSetting[]; bypassed: boolean; truncated: boolean };

/** A continuous setting is a slider, committed when the pointer or key is let go; a stepped one is a number field. */
function SettingField({ setting, disabled, onCommit }: { setting: DawFxSetting; disabled: boolean; onCommit: (value: number) => void }) {
  const id = `fxp-${setting.fx}-${setting.index}`;
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? setting.value;
  const commit = () => {
    if (draft !== null && draft !== setting.value) onCommit(draft);
    setDraft(null);
  };
  if (setting.step > 0) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span aria-hidden className="text-sm text-[var(--text-muted)]">
          {setting.name}
        </span>
        <NumberInput
          label={setting.name}
          data-setting={id}
          className="w-24!"
          size="sm"
          value={setting.value}
          min={setting.min}
          max={setting.max}
          step={setting.step}
          disabled={disabled}
          onValueChange={onCommit}
        />
      </div>
    );
  }
  return (
    // The slider reports every step of a drag; the DAW hears the one value it was let go on.
    <div onPointerUp={commit} onKeyUp={commit} onBlur={commit}>
      <Slider
        id={id}
        label={setting.name}
        valueText={draft === null ? setting.formatted : String(Math.round(shown * 1000) / 1000)}
        value={shown}
        min={setting.min}
        max={setting.max}
        step={(setting.max - setting.min) / 100}
        disabled={disabled}
        onValueChange={setDraft}
      />
    </div>
  );
}

/**
 * An effect's settings from the DAW: a number or slider for each setting it lists, Bypass, and Preview and Compare of the effect's words. Each
 * change is one DAW call and one history entry. A DAW that cannot read or change the effect keeps the controls off with its own sentence; turning
 * a bypassed effect back on over the coverage cap asks first.
 */
export function EffectSettings({ fx, cuts, total, dawName, host }: { fx: WordFx; cuts: readonly CutSpan[]; total: number; dawName: string; host: EffectHost }) {
  const daw = usePort('daw');
  const log = usePort('editWordFx');
  const fxCap = useFxCap();
  const { chapterId, locator, journal, onEffects } = host;
  const target = useMemo(() => targetOf(fx, chapterId, locator), [fx, chapterId, locator]);
  const [read, setRead] = useState<Read>({ kind: 'reading' });
  const [tick, setTick] = useState(0);
  const [asking, setAsking] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'with' | 'without'>('idle');
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => journal.subscribe(reload), [journal, reload]);
  useEffect(() => {
    if (!target) {
      setRead({ kind: 'off', why: 'These words are not in the script, so the DAW cannot be asked about them.' });
      return;
    }
    let live = true;
    daw.fxRangeParams(target).then(
      (answer) => {
        if (!live) return;
        // The narrator can bypass the chain in the DAW itself: the record follows what the DAW reports, outside the history.
        if (answer.result.ok && answer.bypassed !== fx.bypassed) void recordBypass(log, onEffects, fx, answer.bypassed);
        setRead(
          answer.result.ok
            ? { kind: 'ready', settings: answer.settings, bypassed: answer.bypassed, truncated: answer.truncated }
            : { kind: 'off', why: answer.result.refused ?? answer.result.message },
        );
      },
      (e) => live && setRead({ kind: 'off', why: why(e) }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read again when the target or the history changes, not when the record follows the DAW
  }, [daw, target, tick]);
  useEffect(() => setAsking(false), [fx.id]);

  /** Runs a command through the history and says what happened; the controls read the DAW again after it. */
  const act = useCallback(
    async (command: Command<DawResult>) => {
      const result = await journal.act(command);
      reload();
      if (!result.ok) return overlay.toast(result.refusal.reason, { tone: 'error' });
      overlay.toastUndo(result.value.value.message, () => journal.undo(result.value.id));
    },
    [journal, reload],
  );

  const span = fxSpan(fx, cuts);
  const bypassed = read.kind === 'ready' && read.bypassed;

  /** Turning on adds this effect's words back to what the others cover. */
  const overCap = useCallback(() => {
    const others = host.effects.filter((f) => f.id !== fx.id);
    return impactOf(others, cuts, total, span, fxCap.cap).over;
  }, [host.effects, fx.id, cuts, total, span, fxCap.cap]);

  const setBypass = (bypass: boolean, confirmed = false) => {
    if (!target) return;
    if (!bypass && !confirmed && overCap()) return setAsking(true);
    setAsking(false);
    void act(bypassCommand(daw, log, onEffects, target, fx, bypass));
  };

  // Compare: the DAW plays the words with the effect, then without, then puts it back. Each pass lasts `pass` seconds, which says which is playing.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);
  const compare = async () => {
    if (!target || read.kind !== 'ready') return;
    host.stop();
    const result = await journal.act(compareCommand(daw, log, onEffects, target, fx, read.bypassed));
    if (!result.ok) return overlay.toast(result.refusal.reason, { tone: 'error' });
    const ms = result.value.value.pass * 1000;
    clearTimers();
    setPhase('with');
    timers.current = [setTimeout(() => setPhase('without'), ms), setTimeout(() => (setPhase('idle'), reload()), 2 * ms)];
  };
  const stopComparing = async () => {
    clearTimers();
    setPhase('idle');
    const res = await daw.stopFxCompare().catch(failed);
    if (!res.ok) overlay.toast(res.refused ?? res.message, { tone: 'error' });
    reload();
  };

  const preview = () => host.play(Math.max(0, span.start - PREVIEW_PAD), span.end + PREVIEW_PAD);

  if (read.kind === 'off') return <OffControls dawName={dawName} why={read.why} />;
  const ready = read.kind === 'ready';
  const settings = ready ? read.settings : [];
  const several = new Set(settings.map((s) => s.fx)).size > 1;
  return (
    <>
      <SectionLabel>Settings</SectionLabel>
      {!ready ? <p className="m-0 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">Reading the settings from {dawName}.</p> : null}
      <div className="flex flex-col gap-2">
        {settings.map((s) => (
          <div key={`${s.fx}-${s.index}`} className="flex flex-col gap-1">
            {several && s.index === settings.find((x) => x.fx === s.fx)?.index ? (
              <span className="text-[length:var(--font-size-sm)] text-[var(--text-muted)]">{s.fxName}</span>
            ) : null}
            <SettingField
              setting={s}
              disabled={bypassed || phase !== 'idle'}
              onCommit={(value) => target && void act(setCommand(daw, target, fx, s, value, s.value))}
            />
          </div>
        ))}
        {ready && !settings.length ? <p className="m-0 text-[var(--text-muted)]">This effect lists no settings.</p> : null}
        {ready && read.truncated ? <p className="m-0 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">Only the first settings are shown.</p> : null}
      </div>
      <Checkbox checked={bypassed} disabled={!ready || phase !== 'idle'} onChange={(on) => setBypass(on)}>
        Bypass this effect
      </Checkbox>
      {asking ? (
        <div role="alert" className="flex flex-col gap-2 rounded-[var(--radius-button)] bg-[var(--warning-soft)] p-2 text-[length:var(--font-size-sm)]">
          <span>Turning this on takes coverage over the {fmtPct(fxCap.cap)} cap.</span>
          <span className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => setBypass(false, true)}>
              Turn on anyway
            </Button>
          </span>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={!ready || phase !== 'idle'} onClick={preview}>
          Preview
        </Button>
        {phase === 'idle' ? (
          <Button variant="secondary" size="sm" disabled={!ready} onClick={() => void compare()}>
            Compare
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => void stopComparing()}>
            Stop comparing
          </Button>
        )}
        {phase !== 'idle' ? (
          <span role="status" className="text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
            {phase === 'without' ? 'Without the effect' : 'With the effect'}
          </span>
        ) : null}
      </div>
    </>
  );
}
