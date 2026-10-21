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
import { trackChoices } from './ChapterLinkDialog';
import { ConnectionResolveDialog } from './ConnectionResolveDialog';
import { resetOpenOnce, useOpenOnce } from './useOpenOnce';

beforeEach(resetOpenOnce);
afterEach(cleanup);

describe('useOpenOnce', () => {
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
    // The first read after Start is still quiet; the second answers.
    let reads = 0;
    const dawCapabilities = vi.fn(async () => structuredClone(DAW_SETUPS[++reads > 1 ? 'reaper' : 'reaper-off']));
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
    await screen.findByRole('radiogroup');
    await userEvent.click(screen.getByRole('button', { name: 'Link track' }));
    await waitFor(() => expect(chapterTrackSet).toHaveBeenCalledWith('c3', '{T-2}'));
    await waitFor(() => expect(props.onLinked).toHaveBeenCalledOnce());
  });

  it('links the track the narrator picks instead, and not twice on a double press', async () => {
    const chapterTrackSet = vi.fn(() => new Promise<never>(() => {}));
    view(<ConnectionResolveDialog {...link()} />, { chapterTrackMatch: async () => match(), chapterTrackSet } as Partial<NarrationApi>);
    await screen.findByRole('radiogroup');
    await userEvent.click(screen.getByRole('radio', { name: 'Chapter 2' }));
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
    await screen.findByRole('radiogroup');
    await userEvent.click(screen.getByRole('radio', { name: 'Chapter 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(chapterTrackMatch).toHaveBeenCalledTimes(2));
    expect(onCheckedAgain).toHaveBeenCalledOnce();
    expect(screen.getByRole('radio', { name: 'Chapter 2' }).getAttribute('aria-checked')).toBe('true');
  });

  it('offers no way to create a track: the host has no call for it', async () => {
    view(<ConnectionResolveDialog {...link()} />, { chapterTrackMatch: async () => match({ tracks: [], track: null, candidates: [] }) });
    expect(await screen.findByText(/has no tracks yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /create/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Link track' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('shows long, right-to-left and emoji names whole', async () => {
    const name = 'الفصل الأول 🎙️ ' + 'x'.repeat(200);
    view(<ConnectionResolveDialog {...link()} />, {
      chapterTrackMatch: async () => match({ tracks: [track(1, name)], track: null, candidates: [], status: 'none' }),
    });
    expect(await screen.findByText(name)).toBeTruthy();
  });
});
