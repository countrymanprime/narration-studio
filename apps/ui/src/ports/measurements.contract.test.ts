import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { measuredSchema } from '../api/schemas/base';
import { productionOverviewSchema } from '../api/schemas/production';
import { recorderStateSchema } from '../api/schemas/recording';
import { parseWire } from '../api/wire/parseWire';
import { createHostMeasurements, createMockMeasurements, type MeasurementsHostApi, type MeasurementsPort } from './measurements';
import { describeProviderContract, type Goldens } from './providerContract';

const GOLDEN_DIR = fileURLToPath(new URL('../../../../tests/fixtures/contracts/', import.meta.url));
const GOLDEN_FILES = ['production-overview.json', 'production-overview-empty.json', 'recorder-state-takes.json', 'recorder-state-no-project.json'] as const;
const goldens: Goldens = Object.fromEntries(GOLDEN_FILES.map((file) => [file, JSON.parse(readFileSync(`${GOLDEN_DIR}${file}`, 'utf8'))]));

const overview = (file: string) => parseWire(productionOverviewSchema, goldens[file], { boundary: 'measurements contract', payload: file });
const recorder = (file: string) => parseWire(recorderStateSchema, goldens[file], { boundary: 'measurements contract', payload: file });

const hostApi = (over: Partial<Record<'overview' | 'recorder', string>> = {}): MeasurementsHostApi => ({
  productionOverview: () => Promise.resolve(overview(over.overview ?? 'production-overview.json')),
  recorderState: () => Promise.resolve(recorder(over.recorder ?? 'recorder-state-takes.json')),
});

// Zod stays under src/api/ (ADR 0069), so the numeric value schema is borrowed from the recorder state (a plain number) and the other two
// answers (a list, a record) are checked by the same strict `Measured` rule written out.
const numberAnswer = measuredSchema(recorderStateSchema.shape.startedAt.unwrap());
const isMeasured = (answer: unknown): boolean => {
  if (typeof answer !== 'object' || answer === null) return false;
  const a = answer as Record<string, unknown>;
  const keys = Object.keys(a).sort().join();
  return a.ok === true ? keys === 'ok,value' : a.ok === false && keys === 'ok,reason' && typeof a.reason === 'string' && a.reason.length > 0;
};

/** Every method of the port, checked as a value-or-reason; returns whether each answer is well formed. */
async function parsedAnswers(port: MeasurementsPort): Promise<boolean[]> {
  return [
    numberAnswer.safeParse(await port.roomTone('USB microphone')).success,
    numberAnswer.safeParse(await port.roomTone('no-such-mic')).success,
    isMeasured(await port.takeLog()),
    numberAnswer.safeParse(await port.pickupSessionSeconds(['c3a', 'p9'])).success,
    numberAnswer.safeParse(await port.pickupSessionSeconds([])).success,
    isMeasured(await port.chapterLengths()),
  ];
}

const cases = [
  {
    name: 'port-answers-value-or-reason: every answer parses as a Measured and a refusal has a reason',
    check: async (port: MeasurementsPort) => {
      expect(await parsedAnswers(port)).toEqual([true, true, true, true, true, true]);
    },
  },
  {
    name: 'unknown-microphone-is-answered-alike',
    observe: async (port: MeasurementsPort) => numberAnswer.safeParse(await port.roomTone('no-such-mic')).success,
  },
  {
    name: 'empty-id-list-is-answered-alike',
    observe: async (port: MeasurementsPort) => numberAnswer.safeParse(await port.pickupSessionSeconds([])).success,
  },
  {
    name: 'unknown-chapter-is-left-out-alike',
    observe: async (port: MeasurementsPort) => {
      const lengths = await port.chapterLengths();
      return lengths.ok ? 'no-such-chapter' in lengths.value : false;
    },
  },
];

describeProviderContract<MeasurementsPort>('measurements', { mock: () => createMockMeasurements(), host: () => createHostMeasurements(hostApi()) }, cases, {
  goldens,
});

describe('the mock', () => {
  it('mock-reads-its-sample-data: answers the four sample sets', async () => {
    const mock = createMockMeasurements();
    expect(await mock.roomTone('USB microphone')).toEqual({ ok: true, value: -58.6 });
    const log = await mock.takeLog();
    expect(log.ok && log.value).toHaveLength(9);
    expect(await mock.chapterLengths()).toEqual({ ok: true, value: { '1': 685, '2': 670, '4': 868 } });
    expect(await mock.pickupSessionSeconds(['c3a'])).toEqual({ ok: true, value: 235 });
  });

  it('mock-reads-its-sample-data: none answers "Nothing has been measured yet." from every method', async () => {
    const mock = createMockMeasurements({ none: true });
    const sentence = { ok: false, reason: 'Nothing has been measured yet.' };
    expect(await mock.roomTone('USB microphone')).toEqual(sentence);
    expect(await mock.takeLog()).toEqual(sentence);
    expect(await mock.pickupSessionSeconds(['c3a'])).toEqual(sentence);
    expect(await mock.chapterLengths()).toEqual({ ok: false, reason: 'No chapter has a measured length yet.' });
  });

  it('pickup-session-seconds-uses-the-mean-for-an-unmeasured-pickup', async () => {
    const booth = { setupSeconds: 100, seconds: { a: 10, b: 30 } };
    const mock = createMockMeasurements({ booth });
    expect(await mock.pickupSessionSeconds(['a', 'b'])).toEqual({ ok: true, value: 140 });
    // 'x' was never redone: it counts the mean of the measured ones (20).
    expect(await mock.pickupSessionSeconds(['a', 'x'])).toEqual({ ok: true, value: 130 });
    expect(await mock.pickupSessionSeconds([])).toEqual({ ok: true, value: 0 });
    expect((await createMockMeasurements({ booth: { setupSeconds: 100, seconds: {} } }).pickupSessionSeconds(['a'])).ok).toBe(false);
  });
});

describe('the host adapter', () => {
  it('host-chapter-lengths-come-from-recorded-seconds: maps measured chapters by id and leaves out a null one', async () => {
    const chapters = overview('production-overview.json').chapters;
    const expected = Object.fromEntries(chapters.flatMap((c) => (c.recordedSeconds === null ? [] : [[c.id, c.recordedSeconds]])));
    expect(Object.keys(expected).length).toBeGreaterThan(0);
    expect(chapters.some((c) => c.recordedSeconds === null)).toBe(true);
    expect(await createHostMeasurements(hostApi()).chapterLengths()).toEqual({ ok: true, value: expected });
  });

  it('host-chapter-lengths-come-from-recorded-seconds: with none measured it answers the reason', async () => {
    const api = hostApi();
    const noneMeasured = {
      ...overview('production-overview.json'),
      chapters: overview('production-overview.json').chapters.map((c) => ({ ...c, recordedSeconds: null })),
    };
    const host = createHostMeasurements({ ...api, productionOverview: () => Promise.resolve(noneMeasured) });
    expect(await host.chapterLengths()).toEqual({ ok: false, reason: 'No chapter has a measured length yet.' });
  });

  it('host-take-log-comes-from-the-recorder-takes: maps each take to a local date-time and the seconds written', async () => {
    const takes = recorder('recorder-state-takes.json').takes;
    const log = await createHostMeasurements(hostApi()).takeLog();
    expect(log.ok).toBe(true);
    if (!log.ok) return;
    expect(log.value).toHaveLength(takes.length);
    expect(log.value.map((e) => e.seconds)).toEqual([0.5, 1]);
    for (const [i, entry] of log.value.entries()) {
      expect(entry.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      expect(new Date(entry.at).getTime()).toBe(Math.floor(takes[i].recordedAt / 60000) * 60000);
    }
  });

  it('host-take-log-comes-from-the-recorder-takes: no takes answers a reason, and a REAPER session says why', async () => {
    const empty = await createHostMeasurements(hostApi({ recorder: 'recorder-state-no-project.json' })).takeLog();
    expect(empty.ok).toBe(false);
    const withTakes = { ...recorder('recorder-state-takes.json'), engine: 'daw' as const };
    const reaper = await createHostMeasurements({ ...hostApi(), recorderState: () => Promise.resolve(withTakes) }).takeLog();
    expect(reaper).toEqual({ ok: false, reason: expect.stringMatching(/REAPER.*no timestamp/) });
    const builtinEmpty = await createHostMeasurements({
      ...hostApi(),
      recorderState: () => Promise.resolve({ ...withTakes, engine: 'builtin' as const, takes: [] }),
    }).takeLog();
    expect(builtinEmpty.ok).toBe(false);
  });

  it('host-says-no-source-for-room-tone-and-booth-time: both answer a reason that names what is missing', async () => {
    const host = createHostMeasurements(hostApi());
    expect(await host.roomTone('USB microphone')).toEqual({ ok: false, reason: 'The recorder does not report a room-tone reading for USB microphone yet.' });
    expect(await host.pickupSessionSeconds(['c3a'])).toEqual({ ok: false, reason: 'No pickup has been redone in the Booth yet.' });
  });
});
