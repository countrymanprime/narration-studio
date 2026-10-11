// @vitest-environment jsdom
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { createMockApi } from '../api/mockApi';
import { dawShortName, StudioProvider, useJournal } from './StudioProvider';

afterEach(cleanup);

const wrapper = (daw: 'REAPER' | 'Audacity' | 'none') =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider api={createMockApi({}, { daw: { daw } })}>
        <StudioProvider>{children}</StudioProvider>
      </ApiProvider>
    );
  };

describe('dawShortName', () => {
  it('names the DAW the way the header chip does', () => {
    expect(dawShortName('REAPER')).toBe('REAPER');
    expect(dawShortName('Audacity')).toBe('Audacity');
    expect(dawShortName('none')).toBe('Built-in');
  });
});

describe('StudioProvider', () => {
  it('gives every consumer the same journal', () => {
    const { result } = renderHook(() => [useJournal(), useJournal()], { wrapper: wrapper('REAPER') });
    expect(result.current[0]).toBe(result.current[1]);
  });

  it('starts empty and keeps what a page records', async () => {
    const { result } = renderHook(() => useJournal(), { wrapper: wrapper('REAPER') });
    expect(await result.current.entries()).toEqual([]);
    await result.current.act({
      label: 'Added a bookmark',
      touches: ['bookmarks'],
      run: async () => ({ ok: true, value: 1 }),
      undo: async () => ({ ok: true, value: 1 }),
    });
    expect((await result.current.entries()).map((row) => row.label)).toEqual(['Added a bookmark']);
  });

  it("words a DAW refusal with the DAW's name from the capabilities", async () => {
    const { result } = renderHook(() => useJournal(), { wrapper: wrapper('Audacity') });
    // The name arrives with the first capabilities answer.
    await waitFor(async () => {
      await result.current.act({
        label: 'Moved a marker',
        touches: ['markers'],
        daw: true,
        run: async () => ({ ok: true, value: 1 }),
        undo: async () => ({ ok: true, value: 1 }),
      });
      const [row] = await result.current.entries();
      expect(row?.refusal).toContain('Audacity');
    });
  });

  it('throws outside a provider, so a missing mount is found at once', () => {
    expect(() => renderHook(() => useJournal())).toThrow(/StudioProvider/);
  });

  it('renders its children', () => {
    render(
      <ApiProvider api={createMockApi({}, {})}>
        <StudioProvider>
          <p>inside</p>
        </StudioProvider>
      </ApiProvider>,
    );
    expect(screen.getByText('inside')).toBeTruthy();
  });
});
