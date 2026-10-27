// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { ChapterTrackMatch } from '../../api/contracts/chapterTrackMap';
import { createMockApi } from '../../api/mockApi';
import { DAW_SETUPS } from '../../fixtures/daw';
import type { NarrationApi } from '../../types';
import { TooltipProvider } from '../primitives/Tooltip';
import { trackChoices } from '../mapping/trackChoices';
import { ConnectionResolveDialog } from './ConnectionResolveDialog';
import { resetOpenOnce, useOpenOnce } from './useOpenOnce';

beforeEach(resetOpenOnce);
afterEach(cleanup);

describe('useOpenOnce', () => {
  it('with forgetOnUnmount, a notice drawn again after its condition cleared opens again (another project opened twice)', () => {
    const first = renderHook(() => useOpenOnce('other-project:REAPER', false, { forgetOnUnmount: true }));
    expect(first.result.current.open).toBe(true);
    first.unmount();
    const second = renderHook(() => useOpenOnce('other-project:REAPER', false, { forgetOnUnmount: true }));
    expect(second.result.current.open).toBe(true);
  });

  it('opens by itself the first time a condition is seen, and the narrator closes and reopens it', () => {
    const { result } = renderHook(() => useOpenOnce('reaper-off:REAPER'));
    expect(result.current.open).toBe(true);
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
    act(() => result.current.reopen());
    expect(result.current.open).toBe(true);
  });

  it('does not open again for the same condition when the page is left and opened again', () => {
    const first = renderHook(() => useOpenOnce('unlinked:c1'));
    act(() => first.result.current.close());
    first.unmount();
    const second = renderHook(() => useOpenOnce('unlinked:c1'));
    expect(second.result.current.open).toBe(false);
  });

  it('opens for another chapter, and again for the same one once the condition has ended and come back', () => {
    const { result, rerender } = renderHook(({ key }) => useOpenOnce(key), { initialProps: { key: 'unlinked:c1' as string | null } });
    act(() => result.current.close());
    rerender({ key: 'unlinked:c2' });
    expect(result.current.open).toBe(true);
    act(() => result.current.close());
    rerender({ key: null });
    expect(result.current.open).toBe(false);
    rerender({ key: 'unlinked:c2' });
    expect(result.current.open).toBe(true);
  });

  it('stays closed and unseen while held, and opens when the hold ends if the condition still stands', () => {
    const { result, rerender } = renderHook(({ hold }) => useOpenOnce('reaper-off:REAPER', hold), { initialProps: { hold: true } });
    expect(result.current.open).toBe(false);
    rerender({ hold: false });
    expect(result.current.open).toBe(true);
  });

  it('does not open after the hold ends when the narrator already opened and closed it by hand', () => {
    const { result, rerender } = renderHook(({ hold }) => useOpenOnce('reaper-off:REAPER', hold), { initialProps: { hold: true } });
    act(() => result.current.reopen());
    act(() => result.current.close());
    rerender({ hold: false });
    expect(result.current.open).toBe(false);
  });

  it('never opens for no condition, and reopen does nothing then', () => {
    const { result } = renderHook(() => useOpenOnce(null));
    act(() => result.current.reopen());
    expect(result.current.open).toBe(false);
  });
});

const track = (n: number, name: string) => ({ guid: `{T-${n}}`, name, index: n - 1 });
const candidate = (n: number, name: string) => ({
  trackGuid: `{T-${n}}`,
  trackName: name,
  trackIndex: n - 1,
  score: 1,
  source: 'track-name' as const,
  region: null,
});
const match = (over: Partial<ChapterTrackMatch> = {}): ChapterTrackMatch => ({
  chapterId: 'c3',
  chapterTitle: 'Chapter 3',
  projectFile: 'C:/p.rpp',
  savedAt: '2026-10-20T10:00:00Z',
  status: 'matched',
  track: candidate(2, 'Chapter 3'),
  candidates: [candidate(2, 'Chapter 3')],
  warnings: [],
  tracks: [track(1, 'Chapter 2'), track(2, 'Chapter 3'), track(3, '')],
  recordedEnd: null,
  ...over,
});

describe('trackChoices', () => {
  it('lists the matcher’s candidates first, then the rest in project order, and marks the best', () => {
    expect(trackChoices(match())).toEqual([
      { guid: '{T-2}', name: 'Chapter 3', best: true },
      { guid: '{T-1}', name: 'Chapter 2', best: false },
      { guid: '{T-3}', name: 'Track 3', best: false },
    ]);
  });

  it('preselects nothing for a tie or no match, and offers no track when the project has none', () => {
    expect(trackChoices(match({ status: 'ambiguous', track: null })).some((t) => t.best)).toBe(false);
    expect(trackChoices(match({ status: 'none', track: null, candidates: [] })).some((t) => t.best)).toBe(false);
    expect(trackChoices(match({ tracks: [], track: null, candidates: [] }))).toEqual([]);
  });

  it('says which chapter holds a track now, unless it is the chapter being linked', () => {
    const links = [
      { trackGuid: '{T-1}', chapterId: 'c9', chapterTitle: 'Chapter 9', confirmedAt: '' },
      { trackGuid: '{T-2}', chapterId: 'c3', chapterTitle: 'Chapter 3', confirmedAt: '' },
    ];
    const choices = trackChoices(match(), links, 'c3');
    expect(choices.find((c) => c.guid === '{T-1}')?.heldBy).toBe('Chapter 9');
    expect(choices.find((c) => c.guid === '{T-2}')?.heldBy).toBeUndefined();
  });

  it('falls back to the first candidate for an uncertain match with no track', () => {
    expect(trackChoices(match({ status: 'uncertain', track: null })).find((t) => t.best)?.guid).toBe('{T-2}');
  });
});

function view(ui: React.ReactElement, api: Partial<NarrationApi> = {}) {
  return render(
    <ApiProvider api={createMockApi(api)}>
      <TooltipProvider>{ui}</TooltipProvider>
    </ApiProvider>,
  );
}

const off = {
  variant: 'reaper-off',
  daw: 'REAPER',
  sentence: 'REAPER is not running.',
  stillWorks: 'Takes can be read.',
  checkedAt: Date.now(),
  onCheckAgain: vi.fn(),
  onClose: vi.fn(),
} as const;

describe('the not-connected dialog', () => {
  it('saves the launcher setting, starts the DAW with the host’s launcher, and hands each read to the page until it answers', async () => {
    const order: string[] = [];
    const saveSettings = vi.fn(async (...args: unknown[]) => {
      order.push(`save ${JSON.stringify(args)}`);
      return createMockApi().bootstrap();
    });
    const launchDaw = vi.fn(async () => {
      order.push('launch');
      return { launched: true, path: 'C:/REAPER/reaper.exe', source: 'registry' };
    });
    // The app's DAW session makes the first read at start; the first read after Start is still quiet, and the second answers.
    let reads = 0;
    const dawCapabilities = vi.fn(async () => structuredClone(DAW_SETUPS[++reads > 2 ? 'reaper' : 'reaper-off']));
    const onCaps = vi.fn();
    const onLaunched = vi.fn();
    view(<ConnectionResolveDialog {...off} onCaps={onCaps} onLaunched={onLaunched} pollMs={5} />, {
      saveSettings,
      launchDaw,
      dawCapabilities,
    } as Partial<NarrationApi>);
    await userEvent.click(screen.getByRole('button', { name: 'Start REAPER' }));
    await waitFor(() => expect(onCaps).toHaveBeenCalledTimes(2));
    expect(onCaps.mock.calls.map(([caps]) => caps.reachable)).toEqual([false, true]);
    expect(order).toEqual([`save ${JSON.stringify(['DAW', 'global', { auto_start_launcher: 'true' }])}`, 'launch']);
    expect(onLaunched).toHaveBeenCalledWith('C:/REAPER/reaper.exe');
  });

  it('does not start a second launcher run on a second press while the first is running', async () => {
    const launchDaw = vi.fn(() => new Promise<never>(() => {}));
    view(<ConnectionResolveDialog {...off} />, { launchDaw } as Partial<NarrationApi>);
    const start = screen.getByRole('button', { name: 'Start REAPER' });
    await userEvent.click(start);
    await userEvent.click(start);
    await waitFor(() => expect(launchDaw).toHaveBeenCalledTimes(1));
    expect(start.getAttribute('aria-busy')).toBe('true');
  });

  it('says it started and did not answer, when the bridge stays quiet', async () => {
    const launchDaw = vi.fn(async () => ({ launched: true, path: 'p', source: 's' }));
    const dawCapabilities = vi.fn(async () => structuredClone(DAW_SETUPS['reaper-off']));
    view(<ConnectionResolveDialog {...off} pollMs={1} polls={2} />, { launchDaw, dawCapabilities } as Partial<NarrationApi>);
    await userEvent.click(screen.getByRole('button', { name: 'Start REAPER' }));
    expect((await screen.findByRole('alert')).textContent).toContain('REAPER was started and has not answered yet');
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
  });

  it('names the host’s own reading: closed or no launcher, gone quiet, or no project file linked', async () => {
    const choice = (state: string) => async () => ({ hasProject: true, daw: 'REAPER', state, linkedFile: null, foundFiles: [], options: [] }) as never;
    view(<ConnectionResolveDialog {...off} />, { dawChoice: choice('not_running') });
    expect(await screen.findByText(/connected before and has stopped answering/)).toBeTruthy();
    cleanup();
    view(<ConnectionResolveDialog {...off} />, { dawChoice: choice('not_linked') });
    expect(await screen.findByText(/Link the project file first/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start REAPER' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('has the header X as its way out and no Cancel', async () => {
    const onClose = vi.fn();
    view(<ConnectionResolveDialog {...off} onClose={onClose} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('the not-linked dialog', () => {
  const link = (over: object = {}) => ({
    variant: 'chapter-unlinked' as const,
    chapterId: 'c3',
    chapterName: 'Chapter 3',
    sentence: 'Chapter 3 is not linked.',
    dawName: 'REAPER',
    onLinked: vi.fn(),
    onClose: vi.fn(),
    ...over,
  });

  it('links the preselected best match with chapterTrackSet and hands the result to the page, which reads the chapter again', async () => {
    const chapterTrackSet = vi.fn(async (chapterId: string, trackGuid: string) => ({
      documentId: 'd',
      link: { trackGuid, chapterId, chapterTitle: 'Chapter 3', confirmedAt: '' },
      displaced: null,
      mappings: [],
    }));
    const props = link();
    view(<ConnectionResolveDialog {...props} />, { chapterTrackMatch: async () => match(), chapterTrackSet });
    await screen.findByRole('combobox', { name: 'Track for Chapter 3' });
    await userEvent.click(screen.getByRole('button', { name: 'Link track' }));
    await waitFor(() => expect(chapterTrackSet).toHaveBeenCalledWith('c3', '{T-2}'));
    await waitFor(() => expect(props.onLinked).toHaveBeenCalledOnce());
  });

  it('links the track the narrator picks instead, and not twice on a double press', async () => {
    const chapterTrackSet = vi.fn(() => new Promise<never>(() => {}));
    view(<ConnectionResolveDialog {...link()} />, { chapterTrackMatch: async () => match(), chapterTrackSet } as Partial<NarrationApi>);
    const select = await screen.findByRole('combobox', { name: 'Track for Chapter 3' });
    await userEvent.selectOptions(select, '{T-1}');
    const button = screen.getByRole('button', { name: 'Link track' });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(chapterTrackSet).toHaveBeenCalledTimes(1);
    expect(chapterTrackSet).toHaveBeenCalledWith('c3', '{T-1}');
  });

  it('keeps the narrator’s pick across Check again and tells the page it checked', async () => {
    const onCheckedAgain = vi.fn();
    const props = link({ onCheckedAgain });
    const chapterTrackMatch = vi.fn(async () => match());
    view(<ConnectionResolveDialog {...props} />, { chapterTrackMatch });
    const select = await screen.findByRole('combobox', { name: 'Track for Chapter 3' });
    await userEvent.selectOptions(select, '{T-1}');
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(chapterTrackMatch).toHaveBeenCalledTimes(2));
    expect(onCheckedAgain).toHaveBeenCalledOnce();
    expect((screen.getByRole('combobox', { name: 'Track for Chapter 3' }) as HTMLSelectElement).value).toBe('{T-1}');
  });

  const created = (over: object = {}) => ({
    outcome: 'created' as const,
    documentId: 'doc',
    link: { trackGuid: '{NEW}', chapterId: 'c3', chapterTitle: 'Chapter 3', confirmedAt: '2026-10-23T10:00:00Z', origin: 'manual' as const, match: null },
    displaced: null,
    mappings: [],
    track: { guid: '{NEW}', name: 'Chapter 3', index: 3 },
    ...over,
  });

  it('with no tracks to choose from, creating one is the primary action, and it links the new track', async () => {
    const onLinked = vi.fn();
    const chapterTrackCreate = vi.fn(async () => created());
    view(<ConnectionResolveDialog {...link({ onLinked })} />, {
      chapterTrackMatch: async () => match({ tracks: [], track: null, candidates: [] }),
      chapterTrackCreate,
    });
    expect(await screen.findByText(/has no tracks yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Link track' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Create a new track' }));
    await waitFor(() => expect(onLinked).toHaveBeenCalledOnce());
    expect(chapterTrackCreate).toHaveBeenCalledWith('c3');
    expect(onLinked.mock.calls[0][1]).toEqual({ guid: '{NEW}', name: 'Chapter 3', index: 3 });
  });

  it('offers to create a track beside the list, and a double press adds one track', async () => {
    let finish: (value: ReturnType<typeof created>) => void = () => {};
    const chapterTrackCreate = vi.fn(() => new Promise<ReturnType<typeof created>>((resolve) => (finish = resolve)));
    const onLinked = vi.fn();
    view(<ConnectionResolveDialog {...link({ onLinked })} />, { chapterTrackMatch: async () => match(), chapterTrackCreate });
    await screen.findByRole('combobox', { name: 'Track for Chapter 3' });
    expect(screen.getByText(/Or have REAPER add a new track for this chapter/)).toBeTruthy();
    const create = screen.getByRole('button', { name: 'Create a new track' });
    await userEvent.dblClick(create);
    await userEvent.click(create);
    expect(chapterTrackCreate).toHaveBeenCalledTimes(1);
    await act(async () => finish(created()));
    await waitFor(() => expect(onLinked).toHaveBeenCalledOnce());
  });

  it("says the DAW's refusal in the dialog and links nothing; a failed call says why", async () => {
    const onLinked = vi.fn();
    const message = 'REAPER is recording. Stop the take, then create the track.';
    const chapterTrackCreate = vi
      .fn()
      .mockResolvedValueOnce({ outcome: 'refused', reason: 'recording', message })
      .mockRejectedValueOnce(new Error('the bridge timed out'));
    view(<ConnectionResolveDialog {...link({ onLinked })} />, {
      chapterTrackMatch: async () => match({ tracks: [], track: null, candidates: [] }),
      chapterTrackCreate,
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Create a new track' }));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    await userEvent.click(screen.getByRole('button', { name: 'Create a new track' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be added: .*timed out/));
    expect(onLinked).not.toHaveBeenCalled();
  });

  it('an engine that cannot add a track says so and offers nothing that would fail', async () => {
    const chapterTrackCreate = vi.fn();
    view(<ConnectionResolveDialog {...link({ dawName: 'Audacity', create: { available: false, message: 'Audacity cannot add a track from this app.' } })} />, {
      chapterTrackMatch: async () => match({ tracks: [], track: null, candidates: [] }),
      chapterTrackCreate,
    });
    expect(await screen.findByText('Audacity cannot add a track from this app.')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Create a new track' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(button);
    expect(chapterTrackCreate).not.toHaveBeenCalled();
  });

  it('a project that cannot be read still offers to create the track', async () => {
    view(<ConnectionResolveDialog {...link()} />, {
      chapterTrackMatch: async () => {
        throw new Error('no project file is linked');
      },
    });
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read/);
    expect(screen.getByRole('button', { name: 'Create a new track' }).getAttribute('aria-disabled')).toBeNull();
  });

  it('shows long, right-to-left and emoji names whole', async () => {
    const name = 'الفصل الأول 🎙️ ' + 'x'.repeat(200);
    view(<ConnectionResolveDialog {...link()} />, {
      chapterTrackMatch: async () => match({ tracks: [track(1, name)], track: null, candidates: [], status: 'none' }),
    });
    expect(await screen.findByText(name)).toBeTruthy();
  });
});
