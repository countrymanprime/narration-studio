// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { ManuscriptChapter, MeasureFileResult, MeasureJob, NarrationApi as Api } from '../../types';
import { MIXED } from '../pickups/list/pickupFixtures';
import { openPickups } from '../pickups/list/pickupRows';
import { openPickupsBeyondNotes, proofProgress } from '../proof/proof.selectors';
import { announcePickupListChanged } from '../pickups/pickupListChanged';
import { useNavCounts } from './useNavCounts';

const wrap = (api: Api) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <ApiProvider api={api}>{children}</ApiProvider>;
  };

describe('useNavCounts (rail badges, N-B61)', () => {
  it('reads the notes still open (not cleared, not just unreviewed), the open lines of the pickup list and the chapters failing a delivery check, and no Story Bible count', async () => {
    const base = createMockApi({}, {});
    const api: Api = {
      ...base,
      findingsSummary: async () => ({ ...(await base.findingsSummary()), unreviewed: 3, total: 20, decided: 17, cleared: 6 }),
      pickupsList: async () => ({ pickups: MIXED, leftOut: [] }),
    };
    const { result } = renderHook(() => useNavCounts('/'), { wrapper: wrap(api) });
    // The Proof page's whole-book head is `proofProgress(summary, openPickupsBeyondNotes(pickups))`; the rail says the same number (audit cluster 2).
    const proofPageOpen = proofProgress({ total: 20, decided: 17, cleared: 6 }, openPickupsBeyondNotes(MIXED)).open;
    expect(proofPageOpen).toBeGreaterThan(14);
    await waitFor(() => expect(result.current).toEqual({ proof: proofPageOpen, pickups: openPickups(MIXED).length, master: 0 }));
  });

  it('leaves a count out when its call fails, rather than drawing a made-up number', async () => {
    const base = createMockApi({}, {});
    const api: Api = {
      ...base,
      findingsSummary: async () => ({ ...(await base.findingsSummary()), unreviewed: 2, total: 5, decided: 3, cleared: 3 }),
      pickupsList: async () => {
        throw new Error('no reaper');
      },
    };
    const { result } = renderHook(() => useNavCounts('/'), { wrapper: wrap(api) });
    await waitFor(() => expect(result.current.proof).toBe(2));
    expect(result.current.pickups).toBeUndefined();
  });

  it('draws no Proof badge when the summary call fails', async () => {
    const base = createMockApi({}, {});
    const api: Api = {
      ...base,
      findingsSummary: async () => {
        throw new Error('no project');
      },
    };
    const { result } = renderHook(() => useNavCounts('/'), { wrapper: wrap(api) });
    await waitFor(() => expect(result.current.pickups).toBeDefined());
    expect(result.current.proof).toBeUndefined();
  });

  it('reads both counts again when Proof announces a saved decision, without a page move', async () => {
    const api = createMockApi({}, {});
    const { findings } = await api.findingsList({});
    // A note whose fix is a pickup, not an edit: the mock host lists only those (mockHost/pickupsFromProof.test.ts).
    const edit = new Set(['duplicate_read', 'take_comparison', 'pacing', 'audio_quality', 'silence_cleanup', 'level_consistency', 'delivery_qc']);
    const note = findings.find((finding) => finding.manuscript?.chapter_id && !edit.has(finding.category) && finding.evidence?.kind !== 'EXTRA');
    if (!note) throw new Error('the fixtures have no pickup note');
    const { result } = renderHook(() => useNavCounts('/proof'), { wrapper: wrap(api) });
    await waitFor(() => expect(result.current.pickups).toBeDefined());
    const before = result.current;

    await api.findingsReview({ id: note.id, evidenceVersion: note.evidence_version ?? '', status: 'accepted', note: '' });
    expect(result.current).toEqual(before);
    act(() => announcePickupListChanged());
    await waitFor(() => expect(result.current.pickups).toBe((before.pickups ?? 0) + 1));
  });
});

const chapter = (id: string, index: number, title: string) => ({ id, index, title }) as ManuscriptChapter;
const file = (name: string, status: 'met' | 'not_met'): MeasureFileResult =>
  ({
    name,
    path: `C:\\book\\${name}`,
    status: 'measured',
    report: null,
    fingerprint: null,
    findings: [],
    rules: [{ ruleId: 'r', status }],
  }) as unknown as MeasureFileResult;

describe('useNavCounts: Master & QC', () => {
  const base = createMockApi({}, {});
  const withMeasurement = (files: MeasureFileResult[], chapters: ManuscriptChapter[]): Api => ({
    ...base,
    measureState: async () => ({ phase: 'success', files }) as unknown as MeasureJob,
    manuscriptChapters: async () => chapters,
  });

  it('counts the chapters whose measured file fails a check; a passing, an unmeasured and a file-less chapter add nothing', async () => {
    const api = withMeasurement(
      [file('One.wav', 'not_met'), file('Two.wav', 'met'), file('Three.wav', 'not_met')],
      [chapter('c1', 0, 'One'), chapter('c2', 1, 'Two'), chapter('c3', 2, 'Three'), chapter('c4', 3, 'Four')],
    );
    const { result } = renderHook(() => useNavCounts('/'), { wrapper: wrap(api) });
    await waitFor(() => expect(result.current.master).toBe(2));
  });

  it('counts nothing failing as 0, which draws no badge', async () => {
    const { result } = renderHook(() => useNavCounts('/'), { wrapper: wrap(withMeasurement([file('One.wav', 'met')], [chapter('c1', 0, 'One')])) });
    await waitFor(() => expect(result.current.master).toBe(0));
  });

  it('leaves the count out when the measurement cannot be read, rather than drawing a made-up number', async () => {
    const broken: Api = {
      ...base,
      measureState: async () => {
        throw new Error('no measurement');
      },
    };
    const { result } = renderHook(() => useNavCounts('/'), { wrapper: wrap(broken) });
    await waitFor(() => expect(result.current.pickups).toBeDefined());
    expect(result.current.master).toBeUndefined();
  });

  it('reads nothing with no manuscript', async () => {
    const { result } = renderHook(() => useNavCounts('/', false), { wrapper: wrap(withMeasurement([file('One.wav', 'not_met')], [chapter('c1', 0, 'One')])) });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toEqual({});
  });
});
