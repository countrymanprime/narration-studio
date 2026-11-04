// @vitest-environment jsdom
// The Script page's whole-book search keeps one answer per term (#2775), so the jump menu's rows and Find read the same one. An ask
// that was given up on (its signal aborted: the menu stopped waiting, or the term changed) before the host answered is not kept, so
// asking again really asks the host again.
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import type { ManuscriptSearchResult } from '../../../../api/contracts/manuscript';
import { createMockApi } from '../../../../api/mockApi';
import { StudioProvider } from '../../../../studio/StudioProvider';
import { useManuscriptSearch } from './useScriptData';

const ANSWER: ManuscriptSearchResult = { hits: [], total: 0, truncated: false };

function setup() {
  const api = createMockApi();
  const search = vi.spyOn(api, 'manuscriptSearch');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider api={api}>
      <StudioProvider>{children}</StudioProvider>
    </ApiProvider>
  );
  const { result } = renderHook(() => useManuscriptSearch(), { wrapper });
  return { search, ask: (term: string, signal?: AbortSignal) => result.current(term, signal) };
}

describe('useManuscriptSearch', () => {
  it('asks the host once per term and serves the answer again', async () => {
    const { search, ask } = setup();
    search.mockResolvedValue(ANSWER);
    await ask('mouse');
    await ask(' mouse ');
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('a manuscriptSearch that has not answered is not served again to a retry once its ask was aborted', async () => {
    const { search, ask } = setup();
    search.mockReturnValueOnce(new Promise<ManuscriptSearchResult>(() => {})).mockResolvedValue(ANSWER);
    const gaveUp = new AbortController();
    void ask('mouse', gaveUp.signal);
    gaveUp.abort();
    await expect(ask('mouse')).resolves.toEqual(ANSWER);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('an answer that arrived is kept after its ask is aborted', async () => {
    const { search, ask } = setup();
    search.mockResolvedValue(ANSWER);
    const done = new AbortController();
    await ask('mouse', done.signal);
    done.abort();
    await ask('mouse');
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('a failed search is not kept', async () => {
    const { search, ask } = setup();
    search.mockRejectedValueOnce(new Error('the host is busy')).mockResolvedValue(ANSWER);
    await expect(ask('mouse')).rejects.toThrow('busy');
    await expect(ask('mouse')).resolves.toEqual(ANSWER);
    expect(search).toHaveBeenCalledTimes(2);
  });
});
