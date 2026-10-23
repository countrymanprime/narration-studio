// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJournal } from '../../studio/journal/createJournal';
import { useJournalEntries } from './useJournalEntries';

afterEach(cleanup);
const make = () => createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'this' });
const add = (j: ReturnType<typeof make>, label: string) =>
  j.act({ label, touches: [label], run: async () => ({ ok: true, value: 1 }), undo: async () => ({ ok: true, value: 1 }) });

describe('useJournalEntries', () => {
  it('rereads-on-change: follows subscribe, and unmount unsubscribes', async () => {
    const journal = make();
    const unsubscribe = vi.fn();
    const real = journal.subscribe;
    const subscribe = vi.spyOn(journal, 'subscribe').mockImplementation((listener) => {
      const off = real(listener);
      return () => {
        unsubscribe();
        off();
      };
    });
    const { result, unmount } = renderHook(() => useJournalEntries(journal));
    await waitFor(() => expect(result.current).toEqual([]));
    await add(journal, 'Added a bookmark');
    await waitFor(() => expect(result.current?.map((r) => r.label)).toEqual(['Added a bookmark']));
    unmount();
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('drops an answer that lands after unmount', async () => {
    let release: (rows: never[]) => void = () => undefined;
    const journal = { entries: () => new Promise<never[]>((r) => (release = r)), subscribe: () => () => undefined };
    const { result, unmount } = renderHook(() => useJournalEntries(journal));
    unmount();
    await act(async () => release([]));
    expect(result.current).toBeNull();
  });
});
