// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { NarrationApi as Api } from '../../types';
import { MIXED } from '../pickups/list/pickupFixtures';
import { openPickups } from '../pickups/list/pickupRows';
import { useNavCounts } from './useNavCounts';

const wrap = (api: Api) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <ApiProvider api={api}>{children}</ApiProvider>;
  };

describe('useNavCounts (rail badges, N-B61)', () => {
  it('reads the notes still open (not cleared, not just unreviewed) and the open lines of the pickup list, and no Story Bible count', async () => {
    const base = createMockApi({}, {});
    const api: Api = {
      ...base,
      findingsSummary: async () => ({ ...(await base.findingsSummary()), unreviewed: 3, total: 20, decided: 17, cleared: 6 }),
      pickupsList: async () => ({ pickups: MIXED, leftOut: [] }),
    };
    const { result } = renderHook(() => useNavCounts('/'), { wrapper: wrap(api) });
    await waitFor(() => expect(result.current).toEqual({ proof: 14, pickups: openPickups(MIXED).length }));
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
});
