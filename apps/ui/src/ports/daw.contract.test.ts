import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { DawResult } from '../api/contracts/daw';
import { dawCapabilitiesSchema, dawProjectStateSchema, dawResultSchema } from '../api/schemas/daw';
import { findingMarkerSchema } from '../api/schemas/findings';
import { readAloudRecordingSchema } from '../api/schemas/teleprompter';
import { workspaceUseTakeResultSchema } from '../api/schemas/workspace';
import { parseWire } from '../api/wire/parseWire';
import type { InferOutput, StandardSchemaV1 } from '../api/wire/standardSchema';
import { DAW_ANSWERS, DAW_PROJECT, DAW_PROJECT_STATES, DAW_SETUPS } from '../fixtures/daw';
import { createHostDawClient, createMockDawClient, type DawClient, type DawHostApi } from './daw';
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
  'daw-project-state-saved.json',
  'read-aloud-recordings.json',
  'workspace-use-take-done.json',
  'workspace-use-take-refused.json',
  'findings-add-marker.json',
  'findings-add-marker-existing.json',
  'findings-add-marker-stale.json',
] as const;
const goldens: Goldens = Object.fromEntries(GOLDEN_FILES.map((file) => [file, JSON.parse(readFileSync(`${GOLDEN_DIR}${file}`, 'utf8'))]));

const read = <S extends StandardSchemaV1>(file: string, schema: S): InferOutput<S> =>
  parseWire(schema, goldens[file], { boundary: 'daw contract', payload: file });
/** One case of read-aloud-recordings.json, e.g. `ready.start`. */
const recording = (key: string): InferOutput<typeof readAloudRecordingSchema> =>
  parseWire(readAloudRecordingSchema, (goldens['read-aloud-recordings.json'] as Record<string, unknown>)[key], { boundary: 'daw contract', payload: key });

function hostApi(): DawHostApi {
  const known = DAW_PROJECT;
  return {
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
  };
}

/** The stale refusal (ADR 0861): the host's own sentence in `refused` and `message`, and the one code. */
const staleRefusal = (sentence: string): DawResult => ({ ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence, code: 'stale' });

/** What every `DawResult` holds: a refusal changed nothing, repeats its sentence in `message`, and adds no undo point. */
function expectWellFormed(result: unknown): void {
  const parsed = dawResultSchema.parse(result);
  if (parsed.refused === undefined) return;
  expect(parsed.ok).toBe(false);
  expect(parsed.changed).toBe(false);
  expect(parsed.undoSteps).toBe(0);
  expect(parsed.message).toBe(parsed.refused);
}

const cases: ReadonlyArray<ContractCase<DawClient>> = [
  {
    name: 'client-methods-answer-a-daw-result',
    check: async (daw) => {
      for (const result of [
        await daw.recordStart('chapter-1'),
        await daw.recordStop(),
        await daw.useTake('chapter-1', 0, 4, 'take-1'),
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
  { name: 'stop-is-answered-alike', observe: (daw) => daw.recordStop() },
  { name: 'unknown-finding-is-rejected-alike', observe: (daw) => daw.addMarker('no-such-finding') },
  { name: 'known-finding-is-accepted-alike', observe: (daw) => daw.addMarker('finding-1') },
];

describeProviderContract<DawClient>('daw', { mock: () => createMockDawClient(DAW_SETUPS.reaper), host: () => createHostDawClient(hostApi()) }, cases, {
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
