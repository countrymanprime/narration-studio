// @vitest-environment jsdom
// A rejected Keep Take is said out loud, and a keep already on its way is not sent again (issue 2803).
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { overlay } from '../../../overlay/overlayService';
import { createMockDawClient, type DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { createJournal } from '../../../studio/journal/createJournal';
import { useKeepTakes } from './keepTake';
import { measuredPassage } from './takeFixtures';

afterEach(() => vi.restoreAllMocks());

const base = () => createMockDawClient(DAW_SETUPS.reaper, { chapterIds: ['5'], candidateIds: ['t-7', 't-8', 't-9'], findingIds: [] });
const journal = () => createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'this' });

function mount(useTake: DawClient['useTake']) {
  const passage = measuredPassage();
  const daw: DawClient = { ...base(), useTake };
  const hook = renderHook(() => useKeepTakes(journal(), new Map([[passage.id, passage]])), {
    wrapper: ({ children }) => (
      <ApiProvider api={createMockApi()}>
        <PortOverrides clients={{ daw }}>{children}</PortOverrides>
      </ApiProvider>
    ),
  });
  return { passage, ...hook };
}

describe('Keep Take when the host rejects the call', () => {
  it('shows an error toast, changes nothing and leaves no unhandled rejection', async () => {
    const toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    const toastUndo = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => {});
    const { passage, result } = mount(async () => {
      throw new Error('the host went away');
    });
    const before = result.current.kept[passage.id];
    const other = passage.takes.find((t) => t.id !== before)!;
    await act(async () => {
      await result.current.keep(passage, other);
    });
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('the host went away'), { tone: 'error' });
    expect(toastUndo).not.toHaveBeenCalled();
    expect(result.current.kept[passage.id]).toBe(before);
  });
});

describe('Keep Take pressed while a keep is pending', () => {
  it('sends useTake once for the line, and allows a new keep once it has answered', async () => {
    vi.spyOn(overlay, 'toast').mockImplementation(() => {});
    vi.spyOn(overlay, 'toastUndo').mockImplementation(() => {});
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const useTake = vi.fn(async (...args: Parameters<DawClient['useTake']>) => {
      await gate;
      return base().useTake(...args);
    });
    const { passage, result } = mount(useTake as DawClient['useTake']);
    const [a, b] = passage.takes.filter((t) => !t.active);
    await act(async () => {
      void result.current.keep(passage, a!);
      void result.current.keep(passage, a!);
      void result.current.keep(passage, b ?? a!);
    });
    expect(useTake).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await gate;
    });
    await act(async () => {
      await result.current.keep(passage, b ?? a!);
    });
    expect(useTake.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
