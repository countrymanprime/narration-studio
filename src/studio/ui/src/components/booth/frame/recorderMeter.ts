import type { RecorderLevel, RecorderState, RecordingApi } from '../../../api/contracts/recording';
import { updateHeldPeak, type HeldPeak } from '../../../levelMeter';
import { overlay } from '../../../overlay/overlayService';
import type { InputLevel } from './useLevels';

/** How long one call to the built-in recorder's meter may go unanswered before the Levels menu says so and frees itself. */
export const METER_WAIT_MS = 15_000;

/**
 * What the Levels menu's input meter shows with the built-in recorder. `off`: nothing asks for it. `none`: no listed microphone is
 * chosen. `starting`: the host is being asked (and a reading has not come yet). `live`: the meter runs and `level` moves. `take`: a take
 * records, so the take's own level moves the meter and no meter is started. `paused`: the window is in the background. `refused`: the
 * host said no, or did not answer, and `message` is why.
 */
export type RecorderMeterView = {
  status: 'off' | 'none' | 'starting' | 'live' | 'take' | 'paused' | 'refused';
  level: InputLevel | null;
  message: string | null;
};

type Want = { device: string; recording: boolean };
/** The device the host meters, null for none, or `unknown` after a call that failed or never answered. */
type Actual = string | null | 'unknown';
type RecorderPort = Pick<RecordingApi, 'recorderMeterStart' | 'recorderMeterStop' | 'recorderState' | 'subscribeRecorderLevel' | 'subscribeRecorderState'>;
type Answer<T> = { kind: 'ok'; value: T } | { kind: 'failed'; message: string };

const OFF: RecorderMeterView = { status: 'off', level: null, message: null };
const PAUSED: RecorderMeterView = { status: 'paused', level: null, message: null };
const UNKNOWN: Actual = 'unknown';
const text = (reason: unknown): string => (reason instanceof Error ? reason.message : String(reason));
const silence = (): HeldPeak => ({ peak: -100, at: 0 });
const recording = (state: RecorderState): boolean => state.phase === 'recording' || state.phase === 'stopping';

/** `request`'s answer, or a failure once METER_WAIT_MS passes without one; `late` runs if the answer comes after that. */
async function bounded<T>(request: Promise<T>, late: () => void): Promise<Answer<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const answered = request.then(
    (value): Answer<T> => ({ kind: 'ok', value }),
    (reason: unknown): Answer<T> => ({ kind: 'failed', message: text(reason) }),
  );
  const waited = new Promise<Answer<T>>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve({ kind: 'failed', message: `The built-in recorder did not answer in ${Math.round(METER_WAIT_MS / 1000)} s.` });
    }, METER_WAIT_MS);
  });
  void answered.then(() => timedOut && late());
  const result = await Promise.race([answered, waited]);
  clearTimeout(timer);
  return result;
}

/**
 * The built-in recorder's pre-take meter for one host: what the Levels menu wants (`want`, `release`, `pause`, `retry`) and what the host is
 * doing, kept outside the menu so closing it, reopening it or leaving the Booth never loses a call on its way. One call at a time drives
 * the host to what is wanted now, so a rapid open and close pairs every start with a stop, and an answer to an older want never overwrites
 * a newer one. Each call ends within METER_WAIT_MS. While the menu wants the meter it follows `recording:level` and `recording:state`;
 * the host's own word that a take records (a take the Booth did not start, after a reload) keeps a meter from being started against it.
 * Leaving the page (`pagehide`) stops a running meter.
 */
class RecorderMeter {
  private wanted: Want | null = null;
  private actual: Actual = null;
  private busy = false;
  /** A target the host refused or did not answer: not asked again until what is wanted changes or the narrator checks again. */
  private gaveUp: string | null | undefined = undefined;
  /** What the host says it is doing, read when the menu opens and followed while it is open; null until the first answer. */
  private hostTake: boolean | null = null;
  private unsubscribe: (() => void) | null = null;
  private held: HeldPeak = silence();
  private view: RecorderMeterView = OFF;
  private readonly listeners = new Set<() => void>();
  private scheduled = false;

  constructor(private readonly api: RecorderPort) {
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.leaving);
  }

  snapshot = (): RecorderMeterView => this.view;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The menu shows the meter for `device`; while `recording`, the take's level is shown and no meter is started. */
  want(device: string, recordingNow: boolean): void {
    const before = this.wanted;
    if (before && before.device === device && before.recording === recordingNow) return;
    this.wanted = { device, recording: recordingNow };
    this.gaveUp = undefined;
    if (before?.device !== device) this.held = silence();
    if (!this.unsubscribe) this.follow();
    this.showWanted(before?.device === device ? this.view.level : null);
    this.schedule();
  }

  /** The menu closed or the Booth unmounted: the streams are dropped and the meter stopped. */
  release(): void {
    this.drop(OFF);
  }

  /** The window went to the background: as `release`, but the menu says the meter is paused. */
  pause(): void {
    this.drop(PAUSED);
  }

  /** Check again: ask the host once more for a meter it refused or did not answer. */
  retry(): void {
    if (!this.wanted) return;
    this.gaveUp = undefined;
    this.showWanted(null);
    this.schedule();
  }

  private drop(view: RecorderMeterView): void {
    if (!this.wanted) {
      if (this.view.status !== view.status) this.show(view);
      return;
    }
    this.wanted = null;
    this.gaveUp = undefined;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.hostTake = null;
    this.held = silence();
    this.show(view);
    this.schedule();
  }

  /** Follows the level and the host's own state while the menu is open, and reads the state once, so a take already recording is known. */
  private follow(): void {
    const level = this.api.subscribeRecorderLevel(this.heard);
    const state = this.api.subscribeRecorderState((next) => this.hostSays(recording(next)));
    this.unsubscribe = () => {
      level();
      state();
    };
    this.hostTake = null;
    const asked = this.unsubscribe;
    void bounded(this.api.recorderState(), () => undefined).then((answer) => {
      // An answer for a menu that has closed since, or one an event already overtook, is not used.
      if (this.unsubscribe !== asked || this.hostTake !== null) return;
      // An unreadable state is not a take: the start goes ahead, and the host refuses it in its own words if a take does record.
      this.hostSays(answer.kind === 'ok' && recording(answer.value));
    });
  }

  private hostSays(take: boolean): void {
    if (!this.wanted || this.hostTake === take) return;
    this.hostTake = take;
    this.showWanted(this.view.level);
    this.schedule();
  }

  private showWanted(level: InputLevel | null): void {
    const wanted = this.wanted;
    if (!wanted) return;
    if (wanted.recording || this.hostTake === true) this.show({ status: 'take', level, message: null });
    else if (!wanted.device.trim()) this.show({ status: 'none', level: null, message: null });
    else this.show({ status: this.actual === wanted.device ? 'live' : 'starting', level, message: null });
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
    if (!wanted || wanted.recording || this.hostTake === true || !wanted.device.trim()) return null;
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
    // Nothing is started until the host has said whether a take records.
    if (this.wanted && this.hostTake === null) return;
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
  private call(target: string | null): Promise<Answer<RecorderState>> {
    const request = target === null ? this.api.recorderMeterStop() : this.api.recorderMeterStart(target);
    return bounded(request, () => {
      // The host answered after the menu gave up on it: what it now runs is not known, so the next want is driven from scratch.
      this.actual = UNKNOWN;
      this.gaveUp = undefined;
      this.schedule();
    });
  }

  // The page is going (a reload, the window closing): a meter that may be running is stopped now, as no later task will run.
  private leaving = (): void => {
    const running = this.actual !== null;
    this.drop(OFF);
    if (!running) return;
    // Marked stopped first, so the drive the drop scheduled does not send a second stop.
    this.actual = null;
    void this.call(null);
  };
}

const meters = new WeakMap<object, RecorderMeter>();

/** The one meter for this host, shared by every mount of the Levels menu. */
export function recorderMeterFor(api: RecorderPort): RecorderMeter {
  let meter = meters.get(api);
  if (!meter) {
    meter = new RecorderMeter(api);
    meters.set(api, meter);
  }
  return meter;
}
