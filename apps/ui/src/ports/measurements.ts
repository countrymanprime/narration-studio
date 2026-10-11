import type { Measured } from '../api/schemas/base';
import { CHAPTER_LENGTHS, PICKUP_BOOTH, ROOM_TONE_DB, TAKE_LOG, type TakeLogEntry } from '../fixtures/measurements';
import type { NarrationApi } from '../types';

// The measurements port (ADR 0015, ADR 0770): every sourced number a screen shows is asked here and answers a value or a
// reason, never a guess. A source the host does not have answers `{ ok: false, reason }` and the screen prints "not measured
// yet"; this file never invents a figure. A later source adds its value here and no screen changes.

export interface MeasurementsPort {
  /** The room tone the microphone reports, in dB. */
  roomTone(mic: string): Promise<Measured<number>>;
  /** The recorded takes: when each was made and how much audio it added. */
  takeLog(): Promise<Measured<TakeLogEntry[]>>;
  /** Time in the Booth to redo these pickups, in seconds. */
  pickupSessionSeconds(ids: string[]): Promise<Measured<number>>;
  /** The finished length of the chapters that have been measured, in seconds, by chapter id. */
  chapterLengths(): Promise<Measured<Record<string, number>>>;
}

/** The `NarrationApi` methods the host adapter calls: no new binding, only today's. */
export type MeasurementsHostApi = Pick<NarrationApi, 'productionOverview' | 'recorderState'>;

const NOTHING = 'Nothing has been measured yet.';
const NO_LENGTHS = 'No chapter has a measured length yet.';

const none = <T>(reason: string): Measured<T> => ({ ok: false, reason });

const pad = (n: number): string => String(n).padStart(2, '0');

/** Unix ms as a local ISO date-time to the minute, like the mock's `at`. */
function localDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Reads today's bindings. Room tone and Booth time have no host source, so they answer a reason that names what is missing. */
export function createHostMeasurements(api: MeasurementsHostApi): MeasurementsPort {
  return {
    roomTone: (mic) => Promise.resolve(none(`The recorder does not report a room-tone reading for ${mic} yet.`)),
    pickupSessionSeconds: () => Promise.resolve(none('No pickup has been redone in the Booth yet.')),
    async chapterLengths() {
      const overview = await api.productionOverview();
      const lengths: Record<string, number> = {};
      for (const chapter of overview.chapters) {
        if (chapter.recordedSeconds !== null) lengths[chapter.id] = chapter.recordedSeconds;
      }
      return Object.keys(lengths).length ? { ok: true, value: lengths } : none(NO_LENGTHS);
    },
    async takeLog() {
      const state = await api.recorderState();
      if (state.engine === 'daw') {
        return none('The take log covers the built-in recorder only; the take files of a REAPER session carry no timestamp the app reads.');
      }
      if (!state.takes.length) return none('The built-in recorder has no takes yet.');
      // An unfinished take plays up to the last second written, and `seconds` already counts that.
      return { ok: true, value: state.takes.map((take) => ({ at: localDateTime(take.recordedAt), seconds: take.seconds })) };
    },
  };
}

export type MockMeasurementsOptions = {
  /** The mock's `measurements === 'none'`: every method answers that nothing has been measured. */
  none?: boolean;
  roomTone?: Readonly<Record<string, number>>;
  log?: readonly TakeLogEntry[];
  booth?: typeof PICKUP_BOOTH;
  lengths?: Readonly<Record<string, number>>;
};

/** The mock: answers from the sample data in `fixtures/measurements.ts`, or from `options`. */
export function createMockMeasurements(options: MockMeasurementsOptions = {}): MeasurementsPort {
  const { none: off = false, roomTone = ROOM_TONE_DB, log = TAKE_LOG, booth = PICKUP_BOOTH, lengths = CHAPTER_LENGTHS } = options;
  return {
    roomTone(mic) {
      const db = roomTone[mic];
      return Promise.resolve(off || db === undefined ? none(NOTHING) : { ok: true, value: db });
    },
    chapterLengths: () => Promise.resolve(off || !Object.keys(lengths).length ? none(NO_LENGTHS) : { ok: true, value: { ...lengths } }),
    takeLog: () => Promise.resolve(off || !log.length ? none(NOTHING) : { ok: true, value: log.map((entry) => ({ ...entry })) }),
    pickupSessionSeconds(ids) {
      const known = Object.values(booth.seconds);
      if (off || !known.length) return Promise.resolve(none(NOTHING));
      if (!ids.length) return Promise.resolve({ ok: true, value: 0 });
      // A pickup nobody has redone yet takes what the measured ones took on average.
      const mean = known.reduce((sum, s) => sum + s, 0) / known.length;
      return Promise.resolve({ ok: true, value: booth.setupSeconds + ids.reduce((sum, id) => sum + (booth.seconds[id] ?? mean), 0) });
    },
  };
}
