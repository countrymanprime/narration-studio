import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { DawCapabilities, DawResult } from '../api/contracts/daw';
import type { PickupMarker, PickupsState } from '../api/contracts/pickups';
import { dawCapabilitiesSchema, dawProjectStateSchema, dawResultSchema } from '../api/schemas/daw';
import { findingMarkerSchema } from '../api/schemas/findings';
import { pickupsStateSchema } from '../api/schemas/pickups';
import { readAloudRecordingSchema } from '../api/schemas/teleprompter';
import { workspaceUseTakeResultSchema } from '../api/schemas/workspace';
import { parseWire } from '../api/wire/parseWire';
import type { InferOutput, StandardSchemaV1 } from '../api/wire/standardSchema';
import {
  BUILTIN_NOTHING_TO_MUTE,
  DAW_ANSWERS,
  DAW_PROJECT,
  DAW_PROJECT_STATES,
  DAW_SETUPS,
  pickupMarkersReadAnswer,
  pickupsImportedAnswer,
  RANGE_CUT_STEPS,
  rangeCutAnswer,
  rolledAnswer,
  rolledReplacingAnswer,
  takesHiddenAnswer,
} from '../fixtures/daw';
import { createHostDawClient, createMockDawClient, type DawClient, type DawHostApi, type DawPickupItem, NOTHING_TO_CHANGE } from './daw';
import { type ContractCase, describeProviderContract, type Goldens } from './providerContract';

// One suite over both adapters: the mock on the REAPER setup, and the host adapter fed by the goldens the Go host wrote. The
// stand-in host below answers a known chapter, take and finding with the "ok" golden and anything else with the refusal golden,
// which is what the real host does for an id it no longer has.

const GOLDEN_DIR = fileURLToPath(new URL('../../../../tests/fixtures/contracts/', import.meta.url));
const GOLDEN_FILES = [
  'daw-capabilities-reaper.json',
  'daw-result-ok.json',
  'daw-result-refused-stale.json',
  'daw-result-multi-step.json',
  'daw-hide-takes-done.json',
  'daw-hide-takes-nothing.json',
  'daw-hide-takes-refused.json',
  'daw-roll-done.json',
  'daw-roll-refused-confirm.json',
  'daw-roll-refused-stale.json',
  'daw-delete-range-done.json',
  'daw-delete-range-gap.json',
  'daw-delete-range-refused-stale.json',
  'daw-delete-range-refused-capability.json',
  'daw-project-state-saved.json',
  'read-aloud-recordings.json',
  'workspace-use-take-done.json',
  'workspace-use-take-refused.json',
  'findings-add-marker.json',
  'findings-add-marker-existing.json',
  'findings-add-marker-stale.json',
  'pickups-idle.json',
  'pickups-import-success.json',
  'pickups-markers-listed.json',
] as const;
const goldens: Goldens = Object.fromEntries(GOLDEN_FILES.map((file) => [file, JSON.parse(readFileSync(`${GOLDEN_DIR}${file}`, 'utf8'))]));

const read = <S extends StandardSchemaV1>(file: string, schema: S): InferOutput<S> =>
  parseWire(schema, goldens[file], { boundary: 'daw contract', payload: file });
/** One case of read-aloud-recordings.json, e.g. `ready.start`. */
const recording = (key: string): InferOutput<typeof readAloudRecordingSchema> =>
  parseWire(readAloudRecordingSchema, (goldens['read-aloud-recordings.json'] as Record<string, unknown>)[key], { boundary: 'daw contract', payload: key });

/** The host's pickups bindings as internal/pickups.Service answers them: each starts a run, emits it, and finishes it as
 * `pickups:state` once the DAW answers, with the service's sentences. Markers within 0.15 s are one pickup, as in the Lua. */
function pickupsHost(capabilities: DawCapabilities = DAW_SETUPS.reaper) {
  let state: PickupsState = read('pickups-idle.json', pickupsStateSchema);
  let markers: PickupMarker[] = [];
  let run = 0;
  const calls: string[] = [];
  const listeners = new Set<(next: PickupsState) => void>();
  const emit = () => listeners.forEach((listener) => listener(structuredClone(state)));
  const near = (start: number, wanted?: PickupMarker['state']) =>
    markers.find((marker) => Math.abs(marker.start - start) <= 0.15 && (wanted === undefined || marker.state === wanted));
  const begin = (call: string, phase: PickupsState['phase'], finish: () => Partial<PickupsState>) => {
    calls.push(call);
    run += 1;
    state = { ...read('pickups-idle.json', pickupsStateSchema), runId: String(run), phase, message: '…' };
    emit();
    setTimeout(() => {
      state = { ...state, phase: 'success', ...finish() };
      emit();
    }, 0);
    return Promise.resolve({ status: 'started' as const });
  };
  const rename = (from: PickupMarker['state'], to: PickupMarker['state'], position: number, notFound: string, renamed: string) => () => {
    const marker = near(position, from);
    if (!marker) return { phase: 'error' as const, message: notFound };
    marker.state = to;
    return { message: renamed };
  };
  const api: Pick<
    DawHostApi,
    'dawCapabilities' | 'pickupsImport' | 'pickupsResolve' | 'pickupsReopen' | 'pickupsListMarkers' | 'pickupsState' | 'subscribePickups'
  > = {
    dawCapabilities: () => Promise.resolve(capabilities),
    pickupsImport: (csvText) => {
      const rows = csvText
        .trim()
        .split('\n')
        .slice(1)
        .map((line) => line.split(','));
      return begin('import', 'importing', () => {
        const fresh = rows.filter(([start]) => !near(Number(start)));
        markers = [...markers, ...fresh.map(([start, note, tag]) => ({ start: Number(start), state: 'open' as const, tag: tag ?? '', note: note ?? '' }))];
        const existing = rows.length - fresh.length;
        return { importReport: { added: fresh.length, existing, invalid: 0 }, message: pickupsImportedAnswer(fresh.length, existing) };
      }).then(() => ({ status: 'started' as const, rowErrors: [] }));
    },
    pickupsResolve: (position) => begin('resolve', 'resolving', rename('open', 'done', position, DAW_ANSWERS.noOpenPickup, DAW_ANSWERS.pickupResolved)),
    pickupsReopen: (position) => begin('reopen', 'reopening', rename('done', 'open', position, DAW_ANSWERS.noResolvedPickup, DAW_ANSWERS.pickupReopened)),
    pickupsListMarkers: () =>
      begin('list', 'listing', () => {
        const listed = [...markers].sort((a, b) => a.start - b.start).map((marker) => ({ ...marker }));
        const open = listed.filter((marker) => marker.state === 'open').length;
        return { markers: listed, message: pickupMarkersReadAnswer(open, listed.length - open) };
      }),
    pickupsState: () => Promise.resolve(structuredClone(state)),
    subscribePickups: (onUpdate) => {
      listeners.add(onUpdate);
      onUpdate(structuredClone(state));
      return () => listeners.delete(onUpdate);
    },
  };
  return { api, calls };
}

function hostApi(): DawHostApi {
  const known = DAW_PROJECT;
  return {
    ...pickupsHost(read('daw-capabilities-reaper.json', dawCapabilitiesSchema)).api,
    dawCapabilities: () => Promise.resolve(read('daw-capabilities-reaper.json', dawCapabilitiesSchema)),
    dawProjectState: () => Promise.resolve(read('daw-project-state-saved.json', dawProjectStateSchema)),
    readAloudRecordStart: (chapterId) => Promise.resolve(recording(known.chapterIds.includes(chapterId) ? 'ready.start' : 'track_missing.start')),
    readAloudRecordStop: () => Promise.resolve(recording('ready.stop')),
    workspaceUseTake: (chapterId, _first, _last, candidateId) =>
      Promise.resolve(
        read(
          known.chapterIds.includes(chapterId) && known.candidateIds.includes(candidateId) ? 'workspace-use-take-done.json' : 'workspace-use-take-refused.json',
          workspaceUseTakeResultSchema,
        ),
      ),
    findingsAddMarker: (id) =>
      known.findingIds.includes(id) ? Promise.resolve(read('findings-add-marker.json', findingMarkerSchema)) : Promise.reject(new Error(`no finding ${id}`)),
    // WorkspaceHideTakes: a kept take the host offers mutes its item's others (or finds none), and any other id is the stale refusal.
    workspaceHideTakes: (chapterId, _first, _last, keepCandidateId) => {
      if (!known.chapterIds.includes(chapterId) || !known.candidateIds.includes(keepCandidateId)) return Promise.resolve(staleRefusal(DAW_ANSWERS.staleHide));
      return Promise.resolve(read(known.otherTakes?.[keepCandidateId] === 0 ? 'daw-hide-takes-nothing.json' : 'daw-hide-takes-done.json', dawResultSchema));
    },
    // DawRoll on REAPER (punch not destructive, so confirmed is ignored): the time is checked first, a chapter with no track is the
    // stale refusal, and a roll from 40 s is the done golden. Any other time has no golden.
    dawRoll: (chapterId, at) => {
      if (!Number.isFinite(at) || at < 0) return Promise.resolve(refusal(DAW_ANSWERS.rollBadTime));
      if (!known.chapterIds.includes(chapterId)) return Promise.resolve(read('daw-roll-refused-stale.json', dawResultSchema));
      if (at !== 40) return Promise.reject(new Error(`no golden for a roll from ${at} s`));
      return Promise.resolve(read('daw-roll-done.json', dawResultSchema));
    },
    // DawDeleteRange on REAPER: the mode and fade are checked first, an unknown chapter or a range read backwards is the stale golden,
    // and a one-word cut with a 12 ms fade is the done (close) or gap golden. Anything else has no golden.
    dawDeleteRange: (chapterId, firstToken, lastToken, mode, fadeMs) => {
      if (mode !== 'close' && mode !== 'gap') return Promise.resolve(refusal(DAW_ANSWERS.cutBadMode));
      if (!Number.isInteger(fadeMs) || fadeMs < 0 || fadeMs > 500) return Promise.resolve(refusal(DAW_ANSWERS.cutBadFade));
      if (!known.chapterIds.includes(chapterId) || firstToken < 0 || lastToken < firstToken) {
        return Promise.resolve(read('daw-delete-range-refused-stale.json', dawResultSchema));
      }
      if (firstToken !== lastToken || fadeMs !== 12) return Promise.reject(new Error(`no golden for a cut of ${firstToken}..${lastToken} with ${fadeMs} ms`));
      return Promise.resolve(read(mode === 'close' ? 'daw-delete-range-done.json' : 'daw-delete-range-gap.json', dawResultSchema));
    },
  };
}

/** A refusal with no code: the host's own sentence in `refused` and `message`. */
const refusal = (sentence: string): DawResult => ({ ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence });

/** The stale refusal (ADR 0861): the host's own sentence in `refused` and `message`, and the one code. */
const staleRefusal = (sentence: string): DawResult => ({ ...refusal(sentence), code: 'stale' });

/** What every `DawResult` holds: a refusal changed nothing, repeats its sentence in `message`, and adds no undo point. */
function expectWellFormed(result: unknown): void {
  const parsed = dawResultSchema.parse(result);
  if (parsed.refused === undefined) return;
  expect(parsed.ok).toBe(false);
  expect(parsed.changed).toBe(false);
  expect(parsed.undoSteps).toBe(0);
  expect(parsed.message).toBe(parsed.refused);
}

const PICKUPS: readonly DawPickupItem[] = [
  { ref: 'pickup-1', start: 1.5, tag: 'narrator', note: 'Mispronounced' },
  { ref: 'pickup-2', start: 9.25, tag: '', note: 'Second pickup' },
];

const cases: ReadonlyArray<ContractCase<DawClient>> = [
  {
    name: 'client-methods-answer-a-daw-result',
    check: async (daw) => {
      for (const result of [
        await daw.recordStart('chapter-1'),
        await daw.recordStop(),
        await daw.useTake('chapter-1', 0, 4, 'take-1'),
        await daw.hideTakes('chapter-1', 0, 4, 'take-1'),
        await daw.roll('chapter-1', 40),
        await daw.deleteRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, mode: 'close', fadeMs: 12 }),
        await daw.addMarker('finding-1'),
      ]) {
        expectWellFormed(result);
        expect(result.ok).toBe(true);
      }
    },
  },
  {
    name: 'capabilities-are-the-wire-shape',
    check: async (daw) => {
      expect(dawCapabilitiesSchema.parse(await daw.capabilities()).capabilities).toHaveProperty('record');
    },
  },
  {
    name: 'host-adapter-maps-the-existing-results: the DawResult goldens and every mapped result hold the same invariants',
    check: async (daw, { golden }) => {
      for (const file of ['daw-result-ok.json', 'daw-result-refused-stale.json', 'daw-result-multi-step.json']) expectWellFormed(golden(file, dawResultSchema));
      expect(golden('daw-result-multi-step.json', dawResultSchema).steps).toHaveLength(3);
      expectWellFormed(await daw.recordStart('no-such-chapter'));
      expectWellFormed(await daw.useTake('chapter-1', 0, 4, 'stale-take'));
    },
  },
  {
    name: 'project-state-is-the-wire-shape',
    check: async (daw) => {
      expect(dawProjectStateSchema.parse(await daw.projectState()).playState).toBe('stopped');
    },
  },
  { name: 'project-state-is-answered-alike', observe: (daw) => daw.projectState() },
  { name: 'unknown-chapter-is-refused-alike', observe: (daw) => daw.recordStart('no-such-chapter') },
  { name: 'known-chapter-is-accepted-alike', observe: (daw) => daw.recordStart('chapter-1') },
  { name: 'stale-take-is-refused-alike', observe: (daw) => daw.useTake('chapter-1', 0, 4, 'stale-take') },
  {
    name: 'mock-refuses-stale-the-same-way: an old take or a missing track changes nothing and answers code stale',
    check: async (daw) => {
      for (const result of [
        await daw.useTake('chapter-1', 0, 4, 'stale-take'),
        await daw.useTake('chapter-9', 0, 4, 'take-1'),
        await daw.recordStart('no-such-chapter'),
      ]) {
        expectWellFormed(result);
        expect(result).toMatchObject({ ok: false, changed: false, undoSteps: 0, code: 'stale' });
      }
    },
  },
  { name: 'current-take-is-accepted-alike', observe: (daw) => daw.useTake('chapter-1', 0, 4, 'take-1') },
  { name: 'dawclient-hide-takes: hiding the others of a kept take is answered alike', observe: (daw) => daw.hideTakes('chapter-1', 0, 4, 'take-1') },
  { name: 'dawclient-hide-takes: a take with no others to hide is answered alike', observe: (daw) => daw.hideTakes('chapter-1', 0, 4, 'take-solo') },
  { name: 'dawclient-hide-takes: a stale kept take is refused alike', observe: (daw) => daw.hideTakes('chapter-1', 0, 4, 'stale-take') },
  { name: 'dawclient-hide-takes: an unknown chapter is refused alike', observe: (daw) => daw.hideTakes('chapter-9', 0, 4, 'take-1') },
  { name: 'dawclient-roll: a roll that keeps the earlier audio is answered alike', observe: (daw) => daw.roll('chapter-1', 40) },
  { name: 'dawclient-roll: confirmed is ignored where punch is not destructive', observe: (daw) => daw.roll('chapter-1', 40, { confirmed: true }) },
  { name: 'dawclient-roll: a chapter with no track is refused stale alike', observe: (daw) => daw.roll('chapter-9', 40) },
  { name: 'dawclient-roll: a negative time is refused alike', observe: (daw) => daw.roll('chapter-1', -1) },
  { name: 'dawclient-roll: a time that is not a number is refused alike', observe: (daw) => daw.roll('chapter-1', Number.NaN) },
  {
    name: 'dawclient-delete-range: a close cut is answered alike',
    observe: (daw) => daw.deleteRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, mode: 'close', fadeMs: 12 }),
  },
  {
    name: 'dawclient-delete-range: a gap cut is answered alike',
    observe: (daw) => daw.deleteRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, mode: 'gap', fadeMs: 12 }),
  },
  {
    name: 'dawclient-delete-range: an unknown chapter is refused stale alike',
    observe: (daw) => daw.deleteRange({ chapterId: 'chapter-9', firstToken: 3, lastToken: 3, mode: 'close', fadeMs: 12 }),
  },
  {
    name: 'dawclient-delete-range: a range read backwards is refused stale alike',
    observe: (daw) => daw.deleteRange({ chapterId: 'chapter-1', firstToken: 4, lastToken: 3, mode: 'close', fadeMs: 12 }),
  },
  {
    name: 'dawclient-delete-range: a fade over 500 ms is refused alike',
    observe: (daw) => daw.deleteRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, mode: 'gap', fadeMs: 501 }),
  },
  { name: 'stop-is-answered-alike', observe: (daw) => daw.recordStop() },
  { name: 'unknown-finding-is-rejected-alike', observe: (daw) => daw.addMarker('no-such-finding') },
  { name: 'known-finding-is-accepted-alike', observe: (daw) => daw.addMarker('finding-1') },
  {
    name: 'dawclient-pickup-methods: add, mark done, read back and open again, each a well-formed result',
    check: async (daw) => {
      const added = await daw.addPickupMarkers(PICKUPS);
      expectWellFormed(added);
      expect(added).toEqual({ ok: true, changed: true, message: 'Imported 2 pickups.', undoSteps: 1 });
      expect(await daw.setPickupMarkerDone('pickup-1', true)).toEqual({ ok: true, changed: true, message: DAW_ANSWERS.pickupResolved, undoSteps: 1 });
      const read = await daw.readPickupMarkers();
      expectWellFormed(read);
      expect(read.markers).toEqual([
        { ref: 'pickup-1', start: 1.5, state: 'done', tag: 'narrator', note: 'Mispronounced' },
        { ref: 'pickup-2', start: 9.25, state: 'open', tag: '', note: 'Second pickup' },
      ]);
      expect(await daw.setPickupMarkerDone('pickup-1', false)).toEqual({ ok: true, changed: true, message: DAW_ANSWERS.pickupReopened, undoSteps: 1 });
    },
  },
  {
    name: 'adding-pickups-twice-adds-nothing-alike',
    observe: async (daw) => [await daw.addPickupMarkers(PICKUPS), await daw.addPickupMarkers(PICKUPS)],
  },
  {
    name: 'an-unknown-pickup-ref-is-nothing-to-change-alike',
    observe: async (daw) => [await daw.setPickupMarkerDone('never-marked', true), await daw.setPickupMarkerDone('never-marked', false)],
  },
  {
    name: 'a-pickup-already-in-that-state-is-nothing-to-change-alike',
    observe: async (daw) => {
      await daw.addPickupMarkers(PICKUPS);
      return [
        await daw.setPickupMarkerDone('pickup-2', false),
        await daw.setPickupMarkerDone('pickup-2', true),
        await daw.setPickupMarkerDone('pickup-2', true),
      ];
    },
  },
  {
    name: 'pickup-markers-are-read-alike',
    observe: async (daw) => {
      const empty = await daw.readPickupMarkers();
      await daw.addPickupMarkers(PICKUPS);
      await daw.setPickupMarkerDone('pickup-2', true);
      return [empty, await daw.readPickupMarkers()];
    },
  },
];

// The REAPER golden is the host with no heartbeat, so its pickups capability is unavailable; the pickup cases run over the
// declaration of a REAPER that answers (DAW_SETUPS.reaper), as the mock does.
const reachableHost = (): DawClient => createHostDawClient({ ...hostApi(), ...pickupsHost().api });

describeProviderContract<DawClient>('daw', { mock: () => createMockDawClient(DAW_SETUPS.reaper), host: reachableHost }, cases, {
  goldens,
});

describe('the host adapter maps each existing golden', () => {
  const daw = createHostDawClient(hostApi());

  it('host-adapter-maps-every-stale-path: a stale take, a stale finding and a missing track answer code stale with the host sentence', async () => {
    const staleTake = read('workspace-use-take-refused.json', workspaceUseTakeResultSchema);
    expect(staleTake.reason).toBe('stale');
    expect(await daw.useTake('chapter-1', 0, 4, 'stale-take')).toEqual(staleRefusal(staleTake.message));
    const missing = recording('track_missing.start');
    expect(await daw.recordStart('no-such-chapter')).toEqual(staleRefusal(missing.message ?? ''));
    const staleFinding = read('findings-add-marker-stale.json', findingMarkerSchema);
    if (staleFinding.outcome !== 'refused') throw new Error('findings-add-marker-stale.json is not a refusal');
    expect(staleFinding.reason).toBe('stale');
    const marker = createHostDawClient({ ...hostApi(), findingsAddMarker: () => Promise.resolve(staleFinding) });
    expect(await marker.addMarker('finding-1')).toEqual(staleRefusal(staleFinding.message));
  });

  it('host-adapter-maps-every-stale-path: any other refusal keeps its sentence and carries no code', async () => {
    const sentence = 'Stop the recording in REAPER first.';
    const take = createHostDawClient({
      ...hostApi(),
      workspaceUseTake: () => Promise.resolve({ outcome: 'refused', reason: 'recording', message: sentence, changed: false }),
    });
    expect(await take.useTake('chapter-1', 0, 4, 'take-1')).toEqual({ ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence });
    const off = recording('experimental_off.start');
    const record = createHostDawClient({ ...hostApi(), readAloudRecordStart: () => Promise.resolve(off) });
    expect(await record.recordStart('chapter-1')).not.toHaveProperty('code');
    const standalone = createHostDawClient({
      ...hostApi(),
      findingsAddMarker: () => Promise.resolve({ outcome: 'refused', reason: 'standalone', message: 'Open a REAPER project first.' }),
    });
    expect(await standalone.addMarker('finding-1')).not.toHaveProperty('code');
  });

  it('host-adapter-maps-the-existing-results: an accepted take, marker and recording answer ok with their undo points', async () => {
    const taken = read('workspace-use-take-done.json', workspaceUseTakeResultSchema);
    expect(await daw.useTake('chapter-1', 0, 4, 'take-1')).toEqual({ ok: true, changed: true, message: taken.message, undoSteps: 1 });
    expect(await daw.addMarker('finding-1')).toEqual({ ok: true, changed: true, message: '', undoSteps: 1 });
    expect(await daw.recordStart('chapter-1')).toEqual({ ok: true, changed: true, message: '', undoSteps: 0 });
  });

  it("dawclient-hide-takes: the host adapter answers the binding's DawResult as it is, the stale code and the capability refusal included", async () => {
    expect(await daw.hideTakes('chapter-1', 0, 4, 'take-1')).toEqual(read('daw-hide-takes-done.json', dawResultSchema));
    expect(await daw.hideTakes('chapter-1', 0, 4, 'take-solo')).toEqual(read('daw-hide-takes-nothing.json', dawResultSchema));
    expect(await daw.hideTakes('chapter-1', 0, 4, 'stale-take')).toEqual(staleRefusal(DAW_ANSWERS.staleHide));
    const refusedGolden = read('daw-hide-takes-refused.json', dawResultSchema);
    const calls: string[][] = [];
    const off = createHostDawClient({
      ...hostApi(),
      workspaceHideTakes: (...args) => {
        calls.push(args.map(String));
        return Promise.resolve(refusedGolden);
      },
    });
    const answer = await off.hideTakes('chapter-1', 2, 7, 'take-2');
    expectWellFormed(answer);
    expect(answer).toEqual(refusedGolden);
    expect(calls).toEqual([['chapter-1', '2', '7', 'take-2']]);
  });

  it("dawclient-roll: the host adapter answers the binding's DawResult as it is, and sends confirmed as the page gave it", async () => {
    expect(await daw.roll('chapter-1', 40)).toEqual(read('daw-roll-done.json', dawResultSchema));
    expect(await daw.roll('chapter-9', 40)).toEqual(read('daw-roll-refused-stale.json', dawResultSchema));
    const confirm = read('daw-roll-refused-confirm.json', dawResultSchema);
    expect(confirm).toEqual(refusal(DAW_ANSWERS.rollConfirm));
    const calls: unknown[][] = [];
    const destructive = createHostDawClient({
      ...hostApi(),
      dawRoll: (...args) => {
        calls.push(args);
        return Promise.resolve(confirm);
      },
    });
    const answer = await destructive.roll('chapter-1', 12.5);
    expectWellFormed(answer);
    expect(answer).toEqual(confirm);
    await destructive.roll('chapter-1', 12.5, { confirmed: true });
    expect(calls).toEqual([
      ['chapter-1', 12.5, false],
      ['chapter-1', 12.5, true],
    ]);
  });

  it('dawclient-delete-range: the host adapter sends the request as the binding takes it and answers its DawResult as it is', async () => {
    expect(await daw.deleteRange({ chapterId: 'chapter-1', firstToken: 3, lastToken: 3, mode: 'close', fadeMs: 12 })).toEqual(
      read('daw-delete-range-done.json', dawResultSchema),
    );
    const capability = read('daw-delete-range-refused-capability.json', dawResultSchema);
    expectWellFormed(capability);
    const calls: unknown[][] = [];
    const off = createHostDawClient({
      ...hostApi(),
      dawDeleteRange: (...args) => {
        calls.push(args);
        return Promise.resolve(capability);
      },
    });
    expect(await off.deleteRange({ chapterId: 'chapter-1', firstToken: 2, lastToken: 7, mode: 'gap', fadeMs: 25 })).toEqual(capability);
    expect(calls).toEqual([['chapter-1', 2, 7, 'gap', 25]]);
  });

  it('host-adapter-maps-the-existing-results: a refusal without a sentence is an error, not a sentence the client words', async () => {
    const silent = createHostDawClient({ ...hostApi(), readAloudRecordStart: () => Promise.resolve({ outcome: 'refused', reason: 'timeout' }) });
    await expect(silent.recordStart('chapter-1')).rejects.toThrow('no sentence');
  });
});

describe('the mock setups', () => {
  it('refusal-carries-the-capabilitys-sentence: with REAPER off a recording call is refused with the capability message and changes nothing', async () => {
    const off = DAW_SETUPS['reaper-off'];
    const sentence = off.capabilities.record.message;
    expect(sentence).toBeTruthy();
    const mock = createMockDawClient(off);
    for (const result of [await mock.recordStart('chapter-1'), await mock.recordStop()]) {
      expect(result).toEqual({ ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence });
    }
  });

  it('mock-refuses-stale-the-same-way: the stale take answer is DAW_ANSWERS.staleTake with code stale', async () => {
    expect(await createMockDawClient(DAW_SETUPS.reaper).useTake('chapter-1', 0, 4, 'stale-take')).toEqual(staleRefusal(DAW_ANSWERS.staleTake));
    expect(await createMockDawClient(DAW_SETUPS.reaper).recordStart('no-such-chapter')).toEqual(staleRefusal(DAW_ANSWERS.noTrack));
  });

  it("dawclient-hide-takes: the mock refuses with the setup's takes sentence, finds nothing to hide, or mutes in one undo step naming the DAW", async () => {
    for (const id of ['reaper-off', 'audacity'] as const) {
      const sentence = DAW_SETUPS[id].capabilities.takes.message;
      expect(sentence, id).toBeTruthy();
      expect(await createMockDawClient(DAW_SETUPS[id]).hideTakes('chapter-1', 0, 4, 'take-1'), id).toEqual({
        ok: false,
        changed: false,
        message: sentence,
        undoSteps: 0,
        refused: sentence,
      });
    }
    const reaper = createMockDawClient(DAW_SETUPS.reaper);
    expect(await reaper.hideTakes('chapter-1', 0, 4, 'take-1')).toEqual({ ok: true, changed: true, message: takesHiddenAnswer(1, 'REAPER'), undoSteps: 1 });
    expect(await reaper.hideTakes('chapter-1', 0, 4, 'take-solo')).toEqual({ ok: true, changed: false, message: takesHiddenAnswer(0, 'REAPER'), undoSteps: 0 });
    expect(await reaper.hideTakes('chapter-1', 0, 4, 'stale-take')).toEqual(staleRefusal(DAW_ANSWERS.staleHide));
    const backups = createMockDawClient(DAW_SETUPS['audacity-backups'], { ...DAW_PROJECT, otherTakes: { 'take-1': 2 } });
    expect((await backups.hideTakes('chapter-1', 0, 4, 'take-1')).message).toBe('Muted 2 other takes in Audacity. They are still in the project.');
    expect(await createMockDawClient(DAW_SETUPS.builtin).hideTakes('chapter-1', 0, 4, 'take-1')).toEqual({
      ok: true,
      changed: false,
      message: BUILTIN_NOTHING_TO_MUTE,
      undoSteps: 0,
    });
  });

  it("dawclient-roll: the mock refuses with the setup's punch sentence, asks first where punch is destructive, and keeps the earlier audio on REAPER", async () => {
    for (const id of ['reaper-off', 'audacity', 'builtin'] as const) {
      const sentence = DAW_SETUPS[id].capabilities.punch.message;
      expect(sentence, id).toBeTruthy();
      expect(await createMockDawClient(DAW_SETUPS[id]).roll('chapter-1', 40, { confirmed: true }), id).toEqual(refusal(sentence ?? ''));
    }
    const reaper = createMockDawClient(DAW_SETUPS.reaper);
    expect(await reaper.roll('chapter-1', 62.25)).toEqual({ ok: true, changed: true, message: rolledAnswer(62.25), undoSteps: 0 });
    expect(rolledAnswer(40)).toBe(read('daw-roll-done.json', dawResultSchema).message);
    expect(await reaper.roll('chapter-9', 40)).toEqual(staleRefusal(DAW_ANSWERS.rollStale));
    expect(await reaper.roll('chapter-1', Number.POSITIVE_INFINITY)).toEqual(refusal(DAW_ANSWERS.rollBadTime));

    // Audacity without backups, once punch is built: available, and a roll there replaces the audio.
    const audacity = DAW_SETUPS.audacity;
    const destructive: DawCapabilities = {
      ...audacity,
      capabilities: { ...audacity.capabilities, punch: { level: 'experimental', available: true, destructive: true } },
    };
    const mock = createMockDawClient(destructive);
    expect(await mock.roll('chapter-1', 40)).toEqual(refusal(DAW_ANSWERS.rollConfirm));
    expect(await mock.roll('chapter-1', 40, { confirmed: false })).toEqual(refusal(DAW_ANSWERS.rollConfirm));
    expect(await mock.roll('chapter-1', 40, { confirmed: true })).toEqual({ ok: true, changed: true, message: rolledReplacingAnswer(40), undoSteps: 1 });
  });

  it("dawclient-delete-range: the mock refuses with the setup's cut_range sentence and answers undo steps by the capability's mode", async () => {
    const request = { chapterId: 'chapter-1', firstToken: 2, lastToken: 4, mode: 'close', fadeMs: 0 } as const;
    for (const id of ['reaper-off', 'audacity', 'builtin'] as const) {
      const sentence = DAW_SETUPS[id].capabilities.cut_range.message;
      expect(sentence, id).toBeTruthy();
      expect(await createMockDawClient(DAW_SETUPS[id]).deleteRange(request), id).toEqual(refusal(sentence ?? ''));
    }
    const reaper = createMockDawClient(DAW_SETUPS.reaper);
    expect(await reaper.deleteRange(request)).toEqual({ ok: true, changed: true, message: rangeCutAnswer(3, 'REAPER'), undoSteps: 1 });
    expect(rangeCutAnswer(1, 'REAPER')).toBe(read('daw-delete-range-done.json', dawResultSchema).message);
    expect(await reaper.deleteRange({ ...request, chapterId: 'chapter-9' })).toEqual(staleRefusal(DAW_ANSWERS.rangeStale));
    expect(await reaper.deleteRange({ ...request, fadeMs: 2.5 })).toEqual(refusal(DAW_ANSWERS.cutBadFade));

    // A DAW that makes the cut in several edits lists them, one undo step each; one where the app keeps the edit adds none.
    const withMode = (mode: 'steps' | 'app'): DawCapabilities => ({
      ...DAW_SETUPS.reaper,
      capabilities: { ...DAW_SETUPS.reaper.capabilities, cut_range: { level: 'experimental', available: true, mode } },
    });
    expect(await createMockDawClient(withMode('steps')).deleteRange(request)).toEqual({
      ok: true,
      changed: true,
      message: rangeCutAnswer(3, 'REAPER'),
      undoSteps: RANGE_CUT_STEPS.length,
      steps: [...RANGE_CUT_STEPS],
    });
    expect((await createMockDawClient(withMode('app')).deleteRange(request)).undoSteps).toBe(0);
  });

  it('refusal-carries-the-capabilitys-sentence: take and marker calls use their own capability sentence', async () => {
    const mock = createMockDawClient(DAW_SETUPS.audacity);
    expect((await mock.useTake('chapter-1', 0, 4, 'take-1')).refused).toBe(DAW_SETUPS.audacity.capabilities.takes.message);
    expect((await createMockDawClient(DAW_SETUPS.builtin).addMarker('finding-1')).refused).toBe(DAW_SETUPS.builtin.capabilities.markers.message);
  });

  it('dawclient-reads-it: each setup answers its saved time, unsaved flag and transport, and the schema accepts it', async () => {
    for (const [id, setup] of Object.entries(DAW_SETUPS)) {
      const state = await createMockDawClient(setup).projectState();
      expect(dawProjectStateSchema.parse(state), id).toEqual(DAW_PROJECT_STATES[id as keyof typeof DAW_SETUPS]);
    }
    expect((await createMockDawClient(DAW_SETUPS.reaper).projectState()).savedAt).toBe('2026-09-26T08:40');
    const builtin = await createMockDawClient(DAW_SETUPS.builtin).projectState();
    expect(builtin.savedAt).toBeNull();
    expect(builtin.unsavedChanges).toBe(false);
  });

  it('dawclient-reads-it: a setup given its own project state answers it', async () => {
    const live = { savedAt: '2026-09-26T08:40', unsavedChanges: true, playState: 'recording', playPosition: 40.25 } as const;
    expect(await createMockDawClient(DAW_SETUPS.reaper, DAW_PROJECT, live).projectState()).toEqual(live);
  });

  it('behaviour differs only through the capability fields: Audacity with backups can use a take, without them it cannot', async () => {
    expect((await createMockDawClient(DAW_SETUPS.audacity).useTake('chapter-1', 0, 4, 'take-1')).ok).toBe(false);
    expect((await createMockDawClient(DAW_SETUPS['audacity-backups']).useTake('chapter-1', 0, 4, 'take-1')).ok).toBe(true);
  });
});

describe('the port never names a DAW', () => {
  it('client-never-names-a-daw: ports/daw.ts has no DAW name and no branch on the kind', () => {
    const source = readFileSync(fileURLToPath(new URL('./daw.ts', import.meta.url)), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*') && !line.trimStart().startsWith('/**'))
      .join('\n');
    expect(source).not.toMatch(/reaper|audacity|built-?in|standalone/i);
    expect(source).not.toMatch(/\.daw\b|\bkind\b|capabilit(y|ies)\.daw/);
  });
});

describe("pickup markers are the DAW's truth", () => {
  const away = DAW_SETUPS['reaper-off'];
  const awaySentence = away.capabilities.pickups.message;

  it('away-writes-are-the-pages-to-queue: a DAW that does not answer refuses each call with the pickups capability sentence and sends nothing', async () => {
    expect(awaySentence).toBeTruthy();
    const host = pickupsHost(away);
    const refusal = { ok: false, changed: false, message: awaySentence, undoSteps: 0, refused: awaySentence };
    for (const daw of [createHostDawClient({ ...hostApi(), ...host.api }), createMockDawClient(away)]) {
      expect(await daw.addPickupMarkers(PICKUPS)).toEqual(refusal);
      expect(await daw.setPickupMarkerDone('pickup-1', true)).toEqual(refusal);
      expect(await daw.readPickupMarkers()).toEqual({ ...refusal, markers: [] });
    }
    expect(host.calls).toEqual([]);
  });

  it("away-writes-are-the-pages-to-queue: the host's own capabilities golden refuses with the resolver's sentence for its reason", async () => {
    const golden = read('daw-capabilities-reaper.json', dawCapabilitiesSchema);
    const support = golden.capabilities.pickups;
    expect(support).toMatchObject({ available: false, reason: 'standalone' });
    const daw = createHostDawClient(hostApi());
    expect(await daw.addPickupMarkers(PICKUPS)).toMatchObject({ ok: false, changed: false, refused: support?.message });
  });

  it('away-writes-are-the-pages-to-queue: the refusal is the sentence the resolver sent, not one the client words', async () => {
    const sentence = 'A sentence only the resolver knows.';
    const capabilities: DawCapabilities = {
      ...away,
      capabilities: { ...away.capabilities, pickups: { level: 'supported', available: false, reason: 'not_running', message: sentence } },
    };
    const host = pickupsHost(capabilities);
    const daw = createHostDawClient({ ...hostApi(), ...host.api });
    expect((await daw.setPickupMarkerDone('pickup-1', false)).refused).toBe(sentence);
    expect((await createMockDawClient(capabilities).addPickupMarkers(PICKUPS)).refused).toBe(sentence);
    expect(host.calls).toEqual([]);
  });

  it('the DAW refusing a rename is its own sentence, and the client does not try again', async () => {
    const host = pickupsHost();
    const daw = createHostDawClient({ ...hostApi(), ...host.api });
    await daw.addPickupMarkers(PICKUPS);
    // Another client marked pickup-1 done behind this one's back: this client still thinks it open, so it sends and the DAW refuses.
    const other = createHostDawClient({ ...hostApi(), ...host.api });
    await other.addPickupMarkers(PICKUPS.slice(0, 1));
    expect(await other.setPickupMarkerDone('pickup-1', true)).toMatchObject({ ok: true, changed: true });
    expect(await daw.setPickupMarkerDone('pickup-1', true)).toEqual({
      ok: false,
      changed: false,
      message: DAW_ANSWERS.noOpenPickup,
      undoSteps: 0,
      refused: DAW_ANSWERS.noOpenPickup,
    });
    expect(host.calls.filter((call) => call === 'resolve')).toHaveLength(2);
  });

  it('a later session learns each pickup time by adding again: nothing is added and the ids map to the markers', async () => {
    const host = pickupsHost();
    await createHostDawClient({ ...hostApi(), ...host.api }).addPickupMarkers(PICKUPS);
    const later = createHostDawClient({ ...hostApi(), ...host.api });
    expect(await later.setPickupMarkerDone('pickup-2', true)).toEqual({ ok: true, changed: false, message: NOTHING_TO_CHANGE, undoSteps: 0 });
    expect(await later.addPickupMarkers(PICKUPS)).toEqual({ ok: true, changed: false, message: pickupsImportedAnswer(0, 2), undoSteps: 0 });
    expect(await later.setPickupMarkerDone('pickup-2', true)).toMatchObject({ ok: true, changed: true, undoSteps: 1 });
    const read = await later.readPickupMarkers();
    expect(read.markers.map((marker) => [marker.ref, marker.state])).toEqual([
      ['pickup-1', 'open'],
      ['pickup-2', 'done'],
    ]);
  });

  it('the host adapter sends each pickup as one CSV row: commas and quotes quoted, a line break made a space', async () => {
    const host = pickupsHost();
    const sent: string[] = [];
    const daw = createHostDawClient({
      ...hostApi(),
      ...host.api,
      pickupsImport: (csvText) => {
        sent.push(csvText);
        return host.api.pickupsImport('start,note,tag\n1,x,\n');
      },
    });
    await daw.addPickupMarkers([{ ref: 'p', start: 2.5, tag: 'a,b', note: 'Say "hello"\nagain' }]);
    expect(sent).toEqual(['start,note,tag\n2.5,"Say ""hello"" again","a,b"\n']);
  });

  it('a marker this session never marked is read without an id', async () => {
    const host = pickupsHost();
    await createHostDawClient({ ...hostApi(), ...host.api }).addPickupMarkers(PICKUPS.slice(1));
    const read = await createHostDawClient({ ...hostApi(), ...host.api }).readPickupMarkers();
    expect(read.markers).toEqual([{ start: 9.25, state: 'open', tag: '', note: 'Second pickup' }]);
  });

  it("the host's own sentences: the import and the read answers match the goldens internal/pickups wrote", () => {
    expect(pickupsImportedAnswer(2, 0)).toBe(read('pickups-import-success.json', pickupsStateSchema).message);
    expect(pickupMarkersReadAnswer(1, 1)).toBe(read('pickups-markers-listed.json', pickupsStateSchema).message);
  });
});
