// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import type { ChapterTrackMatch } from '../../api/contracts/chapterTrackMap';
import { createMockApi } from '../../api/mockApi';
import { DAW_SETUPS } from '../../fixtures/daw';
import type { NarrationApi } from '../../types';
import { createOverlayService } from '../../overlay/overlayService';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { TooltipProvider } from '../primitives/Tooltip';
import { ChapterTrackStateProvider, useChapterTrackState } from '../chapterTracks/ChapterTrackState';
import { trackChoices } from '../mapping/trackChoices';
import { ConnectionResolveDialog } from './ConnectionResolveDialog';
import { LinkDawFileContext } from './linkDawFile';
import { resetOpenOnce, useOpenOnce } from './useOpenOnce';
import { VoiceLayoutContext } from '../engine/voiceLayout';

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

const track = (n: number, name: string) => ({ guid: `{T-${n}}`, name, index: n - 1, depth: 0, isFolder: false, hasAudio: true });
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

/** What a track outside any folder adds to a choice. */
const FLAT = { color: '', depth: 0, isFolder: false, hasAudio: true };

describe('trackChoices', () => {
  it('lists the matcher’s candidates first, then the rest in project order, and marks the best', () => {
    expect(trackChoices(match())).toEqual([
      { guid: '{T-2}', name: 'Chapter 3', best: true, ...FLAT, index: 1 },
      { guid: '{T-1}', name: 'Chapter 2', best: false, ...FLAT, index: 0 },
      { guid: '{T-3}', name: 'Track 3', best: false, ...FLAT, index: 2 },
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
    expect(await screen.findByText(/No REAPER project file is linked to this project yet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start REAPER' }).getAttribute('aria-disabled')).toBe('true');
  });

  describe('Link project file…', () => {
    const notLinked = async () => ({ hasProject: true, daw: 'REAPER', state: 'not_linked', linkedFile: null, foundFiles: [], options: [] }) as never;
    const linkedChoice = async () => ({ hasProject: true, daw: 'REAPER', state: 'linked', linkedFile: 'Alice.rpp', foundFiles: [], options: [] }) as never;

    it('is the primary action while no project file is linked, with Start off beside it', async () => {
      view(<ConnectionResolveDialog {...off} />, { dawChoice: notLinked });
      const link = await screen.findByRole('button', { name: 'Link project file…' });
      expect(link).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Start REAPER' }).getAttribute('aria-disabled')).toBe('true');
      expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
      expect(screen.queryByText(/Link the project file first/)).toBeNull();
    });

    it('is not offered once the project file is linked', async () => {
      view(<ConnectionResolveDialog {...off} />, { dawChoice: linkedChoice });
      await screen.findByText(/The project is linked, but REAPER has not connected/);
      expect(screen.queryByRole('button', { name: 'Link project file…' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Start REAPER' }).getAttribute('aria-disabled')).toBeNull();
    });

    it('runs the app’s one link action, then checks again so the page and every other page follow', async () => {
      const onCheckAgain = vi.fn();
      const link = vi.fn(async () => ({ kind: 'linked' as const }));
      view(
        <LinkDawFileContext.Provider value={link}>
          <ConnectionResolveDialog {...off} onCheckAgain={onCheckAgain} />
        </LinkDawFileContext.Provider>,
        { dawChoice: notLinked },
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Link project file…' }));
      await waitFor(() => expect(onCheckAgain).toHaveBeenCalledTimes(1));
      expect(link).toHaveBeenCalledTimes(1);
    });

    it('scrolls a refused link into view, so a small window shows why nothing linked (#2823 break B1)', async () => {
      const scrollIntoView = vi.fn();
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = scrollIntoView;
      try {
        const link = vi.fn(async () => ({ kind: 'refused' as const, message: 'That is not a REAPER project file.' }));
        view(
          <LinkDawFileContext.Provider value={link}>
            <ConnectionResolveDialog {...off} />
          </LinkDawFileContext.Provider>,
          { dawChoice: notLinked },
        );
        await userEvent.click(await screen.findByRole('button', { name: 'Link project file…' }));
        await screen.findByText('That is not a REAPER project file.');
        expect(scrollIntoView).toHaveBeenCalled();
      } finally {
        Element.prototype.scrollIntoView = original;
      }
    });

    it('says so when the app is already choosing a project file, instead of doing nothing (#2823 break B2)', async () => {
      const link = vi.fn(async () => ({ kind: 'busy' as const }));
      view(
        <LinkDawFileContext.Provider value={link}>
          <ConnectionResolveDialog {...off} />
        </LinkDawFileContext.Provider>,
        { dawChoice: notLinked },
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Link project file…' }));
      expect((await screen.findByRole('alert')).textContent).toMatch(/already choosing a project file/);
    });

    it('says nothing when the narrator closes the file picker', async () => {
      const onCheckAgain = vi.fn();
      const link = vi.fn(async () => ({ kind: 'cancelled' as const }));
      view(
        <LinkDawFileContext.Provider value={link}>
          <ConnectionResolveDialog {...off} onCheckAgain={onCheckAgain} />
        </LinkDawFileContext.Provider>,
        { dawChoice: notLinked },
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Link project file…' }));
      await waitFor(() => expect(link).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('alert')).toBeNull();
      expect(onCheckAgain).not.toHaveBeenCalled();
    });

    it('shows the host’s sentence when it will not link the file, and a failed link in words', async () => {
      const refuse = vi.fn(async () => ({ kind: 'refused' as const, message: 'That file is not a REAPER project.' }));
      view(
        <LinkDawFileContext.Provider value={refuse}>
          <ConnectionResolveDialog {...off} />
        </LinkDawFileContext.Provider>,
        { dawChoice: notLinked },
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Link project file…' }));
      expect((await screen.findByRole('alert')).textContent).toContain('That file is not a REAPER project.');
      cleanup();
      const fail = vi.fn(async () => ({ kind: 'failed' as const, error: new Error('the host went away') }));
      view(
        <LinkDawFileContext.Provider value={fail}>
          <ConnectionResolveDialog {...off} />
        </LinkDawFileContext.Provider>,
        { dawChoice: notLinked },
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Link project file…' }));
      expect((await screen.findByRole('alert')).textContent).toContain('the host went away');
    });

    it('does not check again while another link is open (the host’s picker is modal)', async () => {
      const onCheckAgain = vi.fn();
      const busy = vi.fn(async () => ({ kind: 'busy' as const }));
      view(
        <LinkDawFileContext.Provider value={busy}>
          <ConnectionResolveDialog {...off} onCheckAgain={onCheckAgain} />
        </LinkDawFileContext.Provider>,
        { dawChoice: notLinked },
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Link project file…' }));
      await waitFor(() => expect(busy).toHaveBeenCalledTimes(1));
      expect(onCheckAgain).not.toHaveBeenCalled();
    });
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

  // #3365: the dialog dropped the displaced chapter, so another chapter silently became unlinked.
  it('names the chapter that lost the track when the chosen track was held', async () => {
    const service = createOverlayService();
    const chapterTrackSet = vi.fn(async (chapterId: string, trackGuid: string) => ({
      documentId: 'd',
      link: { trackGuid, chapterId, chapterTitle: 'Chapter 3', confirmedAt: '' },
      displaced: { trackGuid, chapterId: 'c9', chapterTitle: 'Chapter 9', confirmedAt: '' },
      mappings: [],
    }));
    const props = link();
    view(
      <OverlayProvider service={service}>
        <ConnectionResolveDialog {...props} />
      </OverlayProvider>,
      { chapterTrackMatch: async () => match(), chapterTrackSet },
    );
    await screen.findByRole('combobox', { name: 'Track for Chapter 3' });
    await userEvent.click(screen.getByRole('button', { name: 'Link track' }));
    await waitFor(() => expect(props.onLinked).toHaveBeenCalledOnce());
    expect(service.getSnapshot().toasts.map((t) => t.text)).toEqual(['Track linked. Chapter 9 was linked to that track and is now not linked.']);
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
    expect(onLinked.mock.calls[0][1]).toMatchObject({ outcome: 'created', track: { guid: '{NEW}', name: 'Chapter 3', index: 3 } });
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

  it('in a Voice folders project says folder: the button, the line beside the list and the empty-project line (#2958)', async () => {
    const folders = (ui: React.ReactElement, api: Partial<NarrationApi>) =>
      render(
        <ApiProvider api={createMockApi(api)}>
          <TooltipProvider>
            <VoiceLayoutContext.Provider value="folders">{ui}</VoiceLayoutContext.Provider>
          </TooltipProvider>
        </ApiProvider>,
      );
    const listed = folders(<ConnectionResolveDialog {...link()} />, { chapterTrackMatch: async () => match() });
    await screen.findByRole('combobox', { name: 'Folder for Chapter 3' });
    expect(screen.getByRole('button', { name: 'Link folder' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create a new folder' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create a new track' })).toBeNull();
    expect(screen.getByText(/Or have REAPER add a new folder for this chapter, named after it with a Narrator track in it, and link it:/)).toBeTruthy();
    listed.unmount();
    folders(<ConnectionResolveDialog {...link()} />, { chapterTrackMatch: async () => match({ tracks: [], track: null, candidates: [] }) });
    expect(await screen.findByText(/Create a new folder adds one named after the chapter, with a Narrator track in it, and links it/)).toBeTruthy();
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

  // #3416: a match read that never answers ends in the failed state (with Create offered) instead of reading for good.
  it('a track-match read that never answers fails after its limit, and still offers to create the track', async () => {
    vi.useFakeTimers();
    try {
      view(<ConnectionResolveDialog {...link()} />, { chapterTrackMatch: () => new Promise(() => {}) });
      expect(screen.getByText(/Reading the REAPER tracks/)).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8100);
      });
      expect(screen.getByRole('alert').textContent).toMatch(/could not be read: REAPER did not answer in 8 s/);
      expect(screen.getByRole('button', { name: 'Create a new track' }).getAttribute('aria-disabled')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Check again shows it is working and ignores presses meanwhile: three presses start one read', async () => {
    let release: (m: ChapterTrackMatch) => void = () => {};
    const chapterTrackMatch = vi
      .fn<() => Promise<ChapterTrackMatch>>()
      .mockResolvedValueOnce(match())
      .mockImplementation(() => new Promise((resolve) => (release = resolve)));
    const onCheckedAgain = vi.fn();
    view(<ConnectionResolveDialog {...link({ onCheckedAgain })} />, { chapterTrackMatch });
    await screen.findByRole('combobox', { name: 'Track for Chapter 3' });
    const again = screen.getByRole('button', { name: 'Check again' });
    await userEvent.click(again);
    await userEvent.click(again);
    await userEvent.click(again);
    expect(chapterTrackMatch).toHaveBeenCalledTimes(2);
    expect(onCheckedAgain).toHaveBeenCalledOnce();
    expect(screen.getByText(/Reading the REAPER tracks/)).toBeTruthy();
    await act(async () => release(match()));
    expect(await screen.findByRole('combobox', { name: 'Track for Chapter 3' })).toBeTruthy();
  });

  it('a blank or very long chapter name still gives the title a subject and a bounded length', async () => {
    const { unmount } = view(<ConnectionResolveDialog {...link({ chapterName: '   ' })} />);
    expect((await screen.findAllByText(/^This chapter /)).length).toBeGreaterThan(0);
    unmount();
    view(<ConnectionResolveDialog {...link({ chapterName: 'x'.repeat(5000) })} />);
    const heading = await screen.findByRole('heading');
    expect((heading.textContent ?? '').length).toBeLessThan(200);
  });

  it('closing hands focus to the opener the page names, not to <main>', async () => {
    const chip = document.createElement('button');
    document.body.appendChild(chip);
    const main = document.createElement('main');
    main.tabIndex = -1;
    document.body.appendChild(main);
    function Host() {
      const [open, setOpen] = useState(true);
      return open ? <ConnectionResolveDialog {...link({ returnFocus: () => chip, onClose: () => setOpen(false) })} /> : null;
    }
    view(<Host />);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(chip));
    chip.remove();
    main.remove();
  });

  it('shows long, right-to-left and emoji names whole', async () => {
    const name = 'الفصل الأول 🎙️ ' + 'x'.repeat(200);
    view(<ConnectionResolveDialog {...link()} />, {
      chapterTrackMatch: async () => match({ tracks: [track(1, name)], track: null, candidates: [], status: 'none' }),
    });
    expect(await screen.findByText(name)).toBeTruthy();
  });
});

// #3350: the dialog reads its links from the app's one chapter-track state, so it and every other screen show the same links at once.
describe('the not-linked dialog on the shared chapter-track state', () => {
  const held = { trackGuid: '{T-2}', chapterId: 'c9', chapterTitle: 'Chapter 9', confirmedAt: '', origin: 'manual' as const, match: null };

  /** Another screen: it shows the state's links, and a button stands in for a change made there. */
  function Elsewhere() {
    const state = useChapterTrackState({ enabled: true, tracks: false });
    return (
      <div>
        <output aria-label="Links elsewhere">{state.mappings.map((m) => `${m.chapterId}>${m.trackGuid}`).join(',')}</output>
        <button onClick={() => state.applyMappings([])}>Unlink elsewhere</button>
      </div>
    );
  }

  function open(api: Partial<NarrationApi>, notify: () => void = () => {}) {
    const props = {
      variant: 'chapter-unlinked' as const,
      chapterId: 'c3',
      chapterName: 'Chapter 3',
      sentence: 's',
      dawName: 'REAPER',
      onLinked: vi.fn(),
      onClose: vi.fn(),
    };
    render(
      <ApiProvider api={createMockApi(api)}>
        <TooltipProvider>
          <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={notify}>
            <Elsewhere />
            <ConnectionResolveDialog {...props} />
          </ChapterTrackStateProvider>
        </TooltipProvider>
      </ApiProvider>,
    );
    return props;
  }

  it('a link made in the dialog shows in another screen at once', async () => {
    const chapterTrackSet = vi.fn(async (chapterId: string, trackGuid: string) => {
      const link = { trackGuid, chapterId, chapterTitle: 'Chapter 3', confirmedAt: '', origin: 'manual' as const, match: null };
      return { documentId: 'd', link, displaced: null, mappings: [link] };
    });
    open({ chapterTrackMatch: async () => match(), chapterTrackMapList: async () => ({ documentId: 'd', mappings: [] }), chapterTrackSet });
    await screen.findByRole('combobox', { name: 'Track for Chapter 3' });
    expect(screen.getByLabelText('Links elsewhere').textContent).toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'Link track' }));
    await waitFor(() => expect(screen.getByLabelText('Links elsewhere').textContent).toBe('c3>{T-2}'));
  });

  it('a link changed in another screen shows in the dialog at once', async () => {
    open({ chapterTrackMatch: async () => match(), chapterTrackMapList: async () => ({ documentId: 'd', mappings: [held] }) });
    const select = await screen.findByRole('combobox', { name: 'Track for Chapter 3' });
    expect(within(select).getByRole('option', { name: /linked to Chapter 9/ })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Unlink elsewhere', hidden: true }));
    await waitFor(() => expect(within(select).queryByRole('option', { name: /linked to Chapter 9/ })).toBeNull());
  });

  it('keeps the picker and says the links could not be read again when only that read fails, and Check again recovers', async () => {
    let fail = true;
    const chapterTrackMapList = vi.fn(async () => {
      if (fail) throw new Error('the host is busy');
      return { documentId: 'd', mappings: [] as (typeof held)[] };
    });
    open({ chapterTrackMatch: async () => match(), chapterTrackMapList });
    // The picker stays (the match answered); the failure is said under it, naming the links and not the tracks.
    await screen.findByRole('combobox', { name: 'Track for Chapter 3' });
    expect((await screen.findByRole('alert')).textContent).toContain('The links could not be read again');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('a link that fails after the dialog was closed still says so, as a toast', async () => {
    const service = createOverlayService();
    let rejectSet: (reason: Error) => void = () => {};
    const chapterTrackSet = vi.fn(() => new Promise<never>((_, reject) => (rejectSet = reject)));
    const props = {
      variant: 'chapter-unlinked' as const,
      chapterId: 'c3',
      chapterName: 'Chapter 3',
      sentence: 's',
      dawName: 'REAPER',
      onLinked: vi.fn(),
      onClose: vi.fn(),
    };
    const { unmount } = render(
      <ApiProvider api={createMockApi({ chapterTrackMatch: async () => match(), chapterTrackSet })}>
        <TooltipProvider>
          <OverlayProvider service={service}>
            <ChapterTrackStateProvider projectFolder="C:/Projects/Alice" enabled notify={() => {}}>
              <ConnectionResolveDialog {...props} />
            </ChapterTrackStateProvider>
          </OverlayProvider>
        </TooltipProvider>
      </ApiProvider>,
    );
    await screen.findByRole('combobox', { name: 'Track for Chapter 3' });
    await userEvent.click(screen.getByRole('button', { name: 'Link track' }));
    // Escape while the link is out: the dialog is gone before the host answers.
    unmount();
    rejectSet(new Error('REAPER did not answer'));
    await waitFor(() => expect(service.getSnapshot().toasts.some((toast) => toast.text.includes('The link could not be made'))).toBe(true));
  });

  it('Check again re-reads the links through the state, quietly', async () => {
    const chapterTrackMapList = vi.fn(async () => ({ documentId: 'd', mappings: [] as (typeof held)[] }));
    const notify = vi.fn();
    open({ chapterTrackMatch: async () => match(), chapterTrackMapList }, notify);
    await screen.findByRole('combobox', { name: 'Track for Chapter 3' });
    const before = chapterTrackMapList.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(chapterTrackMapList.mock.calls.length).toBeGreaterThan(before));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });
});
