import type { RecorderLevel, RecordingApi } from '../../../api/contracts/recording';
import { updateHeldPeak, type HeldPeak } from '../../../levelMeter';
import { overlay } from '../../../overlay/overlayService';
import type { InputLevel } from './useLevels';

/** How long one start or stop of the built-in recorder's meter may go unanswered before the meter row says so and frees itself. */
export const METER_WAIT_MS = 15_000;

/**
 * What the Levels menu's built-in meter row shows. `off`: nothing asks for the meter. `none`: no microphone is chosen. `starting`: a start
 * is on its way. `live`: the meter runs and `level` moves. `take`: a take records, so the take's own level moves the row and no meter is
 * started. `refused`: the host said no, or did not answer, and `message` is why.
 */
export type RecorderMeterView = {
  status: 'off' | 'none' | 'starting' | 'live' | 'take' | 'refused';
  level: InputLevel | null;
  message: string | null;
};

type Want = { device: string; recording: boolean };
/** The device the host meters, null for none, or `unknown` after a call that failed or never answered. */
type Actual = string | null | 'unknown';

const OFF: RecorderMeterView = { status: 'off', level: null, message: null };
const UNKNOWN: Actual = 'unknown';
const text = (reason: unknown): string => (reason instanceof Error ? reason.message : String(reason));
const silence = (): HeldPeak => ({ peak: -100, at: 0 });

/**
 * The built-in recorder's pre-take meter for one host: what the Levels menu wants (`want`, `release`) and what the host is doing, kept outside
 * the menu so closing it, reopening it or leaving the Booth never loses a call on its way. One call at a time drives the host to what is
 * wanted now, so a rapid open and close pairs every start with a stop, and an answer to an older want never overwrites a newer one. Each
 * call ends within METER_WAIT_MS: one that has not answered by then is reported and the row is free again. The `recording:level`
 * subscription is held only while the menu wants the meter.
 */
class RecorderMeter {
  private wanted: Want | null = null;
  private actual: Actual = null;
  private busy = false;
  /** A target the host refused or did not answer: not asked again until what is wanted changes. */
  private gaveUp: string | null | undefined = undefined;
  private unsubscribe: (() => void) | null = null;
  private held: HeldPeak = silence();
  private view: RecorderMeterView = OFF;
  private readonly listeners = new Set<() => void>();
  private scheduled = false;

  constructor(private readonly api: Pick<RecordingApi, 'recorderMeterStart' | 'recorderMeterStop' | 'subscribeRecorderLevel'>) {}

  snapshot = (): RecorderMeterView => this.view;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The menu shows the meter for `device`; while `recording`, the take's level is shown and no meter is started. */
  want(device: string, recording: boolean): void {
    const before = this.wanted;
    if (before && before.device === device && before.recording === recording) return;
    this.wanted = { device, recording };
    this.gaveUp = undefined;
    if (before?.device !== device) this.held = silence();
    if (!this.unsubscribe) this.unsubscribe = this.api.subscribeRecorderLevel(this.heard);
    if (recording) this.show({ status: 'take', level: this.view.level, message: null });
    else if (!device.trim()) this.show({ status: 'none', level: null, message: null });
    else this.show({ status: 'starting', level: before?.device === device ? this.view.level : null, message: null });
    this.schedule();
  }

  /** The menu closed, the Booth unmounted or the window lost focus: the level stream is dropped and the meter stopped. */
  release(): void {
    if (!this.wanted) return;
    this.wanted = null;
    this.gaveUp = undefined;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.held = silence();
    this.show(OFF);
    this.schedule();
  }

  private heard = (level: RecorderLevel): void => {
    const status = this.view.status;
    if (status !== 'live' && status !== 'take' && status !== 'starting') return;
    this.held = updateHeldPeak(this.held, level.peak, Date.now());
    this.show({ status: status === 'starting' ? 'live' : status, level: { peak: this.held.peak, rms: level.rms }, message: null });
  };

  private show(view: RecorderMeterView): void {
    this.view = view;
    this.listeners.forEach((listener) => listener());
  }

  /** The device the host should meter now: none without a want, during a take, or with no microphone. */
  private target(): string | null {
    const wanted = this.wanted;
    if (!wanted || wanted.recording || !wanted.device.trim()) return null;
    return wanted.device;
  }

  // Wants that change within one task settle on the last: an effect's cleanup and its rerun ask for one call, not a stop and a start.
  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      void this.drive();
    });
  }

  private async drive(): Promise<void> {
    if (this.busy) return;
    const target = this.target();
    if (target === this.actual || target === this.gaveUp) return;
    this.busy = true;
    const answer = await this.call(target);
    this.busy = false;
    const current = this.target() === target;
    if (answer.kind === 'ok') {
      this.actual = target;
      if (current && target !== null && this.view.status !== 'live') this.show({ status: 'live', level: this.view.level, message: null });
    } else {
      this.actual = UNKNOWN;
      // An answer to a want the menu has moved on from is not shown; what is wanted now is asked next.
      if (current) {
        this.gaveUp = target;
        if (target !== null) this.show({ status: 'refused', level: null, message: answer.message });
        else overlay.toast(`The built-in recorder's meter did not stop: ${answer.message}`, { tone: 'error', topic: 'recorder-meter' });
      }
    }
    this.schedule();
  }

  /** One start (a device) or stop (null), ending within METER_WAIT_MS. A late answer marks the host's state unknown so it is driven again. */
  private async call(target: string | null): Promise<{ kind: 'ok' } | { kind: 'failed'; message: string }> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let late = false;
    const request = target === null ? this.api.recorderMeterStop() : this.api.recorderMeterStart(target);
    const answered = request.then(
      () => ({ kind: 'ok' as const }),
      (reason: unknown) => ({ kind: 'failed' as const, message: text(reason) }),
    );
    const waited = new Promise<{ kind: 'failed'; message: string }>((resolve) => {
      timer = setTimeout(() => {
        late = true;
        const seconds = Math.round(METER_WAIT_MS / 1000);
        resolve({ kind: 'failed', message: `The built-in recorder did not answer in ${seconds} s.` });
      }, METER_WAIT_MS);
    });
    void answered.then(() => {
      if (!late) return;
      // The host answered after the row gave up on it: what it now runs is not known, so the next want is driven from scratch.
      this.actual = UNKNOWN;
      this.gaveUp = undefined;
      this.schedule();
    });
    const result = await Promise.race([answered, waited]);
    clearTimeout(timer);
    return result;
  }
}

const meters = new WeakMap<object, RecorderMeter>();

/** The one meter for this host, shared by every mount of the Levels menu. */
export function recorderMeterFor(api: Pick<RecordingApi, 'recorderMeterStart' | 'recorderMeterStop' | 'subscribeRecorderLevel'>): RecorderMeter {
  let meter = meters.get(api);
  if (!meter) {
    meter = new RecorderMeter(api);
    meters.set(api, meter);
  }
  return meter;
}
