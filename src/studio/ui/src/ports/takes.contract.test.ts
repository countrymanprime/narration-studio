import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createMockApi } from '../api/mockApi';
import { WIRE_CHAPTERS, WIRE_TRACKS_PROJECT } from '../api/mockFixtures';
import { takeEvidenceResultSchema, takeFigureSchema } from '../api/schemas/takeEvidence';
import { parseWire } from '../api/wire/parseWire';
import { describeProviderContract, type Goldens } from './providerContract';
import { createHostTakes, createMockTakes, type TakesHostApi, type TakesPort } from './takes';

const GOLDEN_DIR = fileURLToPath(new URL('../../../../tests/fixtures/contracts/', import.meta.url));
const FILES = ['workspace-take-evidence-full.json', 'workspace-take-evidence-partial.json', 'workspace-take-evidence-none.json'];
const goldens: Goldens = Object.fromEntries(FILES.map((file) => [file, JSON.parse(readFileSync(`${GOLDEN_DIR}${file}`, 'utf8'))]));

// The mock chapter with a recording, linked to a track so it has takes (as wireContracts.test.ts sets it up).
const chapter = WIRE_CHAPTERS[0];
const linkedMockApi = () =>
  createMockApi(
    {},
    {
      chapterTrackMappings: [
        {
          trackGuid: WIRE_TRACKS_PROJECT.tracks[0].guid,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          confirmedAt: '2026-10-11T09:00:00Z',
          origin: 'manual',
          match: null,
        },
      ],
    },
  );

const REFUSAL = "tokens 0 to 99999 are not in this chapter's alignment; reload the workspace";

// The host adapter over the goldens: the full answer for any passage the host would accept, the host's refusal for a range
// past the alignment.
const hostApi = (calls: string[] = []): TakesHostApi => ({
  workspaceTakeEvidence: (chapterId, firstToken, lastToken) => {
    calls.push(`${chapterId}:${firstToken}-${lastToken}`);
    if (lastToken > 9999) return Promise.reject(new Error(REFUSAL));
    const file = 'workspace-take-evidence-full.json';
    return Promise.resolve({ ...parseWire(takeEvidenceResultSchema, goldens[file], { boundary: 'takes contract', payload: file }), chapterId });
  },
});

const cases = [
  {
    name: 'figures-are-values-or-reasons: every figure is one or the other, clarity is never measured, placement is aligned',
    check: async (port: TakesPort) => {
      const answer = await port.evidence(chapter.id, 0, 1);
      expect(answer.takes.length).toBeGreaterThan(0);
      for (const take of answer.takes) {
        for (const figure of [take.matched, ...Object.values(take.measure)]) expect(takeFigureSchema.safeParse(figure).success).toBe(true);
        expect(take.measure.clarity).toEqual({ ok: false, reason: 'Not measured' });
        expect(take.via).toBe('aligned');
      }
      expect(new Set(answer.takes.map((take) => take.id)).size).toBe(answer.takes.length);
    },
  },
  {
    name: 'refuses-a-bad-passage',
    observe: (port: TakesPort) => port.evidence(chapter.id, 0, 99999),
  },
];

describeProviderContract<TakesPort>('takes', { mock: () => createMockTakes(linkedMockApi()), host: () => createHostTakes(hostApi()) }, cases, { goldens });

describe('the host adapter', () => {
  it('read-only: makes the one read call and passes its answer through', async () => {
    const calls: string[] = [];
    const answer = await createHostTakes(hostApi(calls)).evidence('c-1', 2, 3);
    expect(calls).toEqual(['c-1:2-3']);
    expect(answer.chapterId).toBe('c-1');
  });
});

describe('the mock', () => {
  it('one-entry-per-offered-take: the ids and order of workspaceTakes, and the same refusal', async () => {
    const api = linkedMockApi();
    const takes = await api.workspaceTakes(chapter.id, 0, 1);
    const evidence = await createMockTakes(api).evidence(chapter.id, 0, 1);
    expect(evidence.takes.map((take) => take.id)).toEqual(takes.candidates.map((candidate) => candidate.id));
    await expect(createMockTakes(api).evidence(chapter.id, 0, 99999)).rejects.toThrow(REFUSAL);
  });

  it('matched-share: only the aligned take has a share; the others say why', async () => {
    const evidence = await createMockTakes(linkedMockApi()).evidence(chapter.id, 0, 1);
    expect(evidence.takes.filter((take) => take.matched.ok)).toHaveLength(1);
  });
});
