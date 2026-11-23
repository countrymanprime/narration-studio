// @vitest-environment jsdom
// A failed read of the Script page's cache is said (#3824): the text is drawn without what the read would add, so the page raises the
// host's sentence in an error toast with Retry, which reads again what failed. Over the browser mock host with one read made to refuse.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { CommandRouter } from '../../../input/router';
import { OverlayHost } from '../../../overlay/OverlayHost';
import { overlay } from '../../../overlay/overlayService';
import { StudioProvider } from '../../../studio/StudioProvider';
import type { NarrationApi } from '../../../types';
import { TooltipProvider } from '../../primitives/Tooltip';
import { ScriptPage } from './ScriptPage';

afterEach(() => {
  cleanup();
  overlay.getSnapshot().toasts.forEach((toast) => overlay.dismissToast(toast.id));
  window.localStorage.clear();
});

function mount(api: NarrationApi) {
  return render(
    <MemoryRouter initialEntries={['/script']}>
      <ApiProvider api={api}>
        <StudioProvider>
          <CommandRouter>
            <TooltipProvider>
              <Routes>
                <Route path="/script" element={<ScriptPage notify={vi.fn()} focusStoryBibleEntity={vi.fn()} />} />
              </Routes>
              <OverlayHost />
            </TooltipProvider>
          </CommandRouter>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
}

/** The mock host with one read refusing while `fails.now` is true; `endJob` says a job ended, so the page reads again all it holds. */
function refusing<K extends keyof NarrationApi>(read: K, sentence: string, base: NarrationApi = createMockApi()) {
  const fails = { now: true };
  const asked = vi.fn();
  const jobEnded = new Set<() => void>();
  const api = {
    ...base,
    [read]: (...args: unknown[]) => {
      asked(...args);
      return fails.now ? Promise.reject(new Error(sentence)) : (base[read] as (...all: unknown[]) => unknown)(...args);
    },
    subscribeJobEnded: (listener: () => void) => {
      jobEnded.add(listener);
      const off = base.subscribeJobEnded(listener as never);
      return () => {
        jobEnded.delete(listener);
        off();
      };
    },
  } as NarrationApi;
  return { api, fails, asked, endJob: () => act(async () => jobEnded.forEach((listener) => listener())) };
}

/** How many times an error toast was raised. */
const raised = (toast: { mock: { calls: unknown[][] } }) =>
  toast.mock.calls.filter(([, options]) => (options as { tone?: string } | undefined)?.tone === 'error').length;

const CUES = 'The dialogue cues could not be read.';
const firstHeading = () => screen.findByRole('heading', { level: 2, name: 'Chapter 1: Down the Rabbit-Hole' }, { timeout: 3000 });
const errorToast = (sentence: string) => screen.findByText(sentence, undefined, { timeout: 3000 });
const retry = () => screen.getByRole('button', { name: 'Retry' });
const chips = () => screen.queryAllByRole('button', { name: /^Speaker: / }).length;

describe('a failed read on Script', () => {
  it('of the dialogue cues on load draws the text without chips and says the host sentence with Retry', async () => {
    const { api } = refusing('guideDialogueCuesIn', CUES);
    mount(api);
    await firstHeading();
    const said = await errorToast(CUES);
    expect(said.closest('[data-tone="error"]')).not.toBeNull();
    expect(retry()).toBeTruthy();
    expect(chips()).toBe(0);
  });

  it('of the cues, then Retry that the host answers: the chips appear and the error goes', async () => {
    const { api, fails, asked } = refusing('guideDialogueCuesIn', CUES);
    mount(api);
    await errorToast(CUES);
    const before = asked.mock.calls.length;
    fails.now = false;
    fireEvent.click(retry());
    await waitFor(() => expect(chips()).toBeGreaterThan(0), { timeout: 3000 });
    await waitFor(() => expect(screen.queryByText(CUES)).toBeNull());
    expect(asked.mock.calls.length).toBe(before + 1);
  });

  it('of the cues that fails again on Retry keeps the sentence and Retry on show', async () => {
    const { api, asked } = refusing('guideDialogueCuesIn', CUES);
    mount(api);
    await errorToast(CUES);
    const before = asked.mock.calls.length;
    fireEvent.click(retry());
    await waitFor(() => expect(asked.mock.calls.length).toBe(before + 1));
    await act(async () => {});
    await errorToast(CUES);
    expect(retry()).toBeTruthy();
    expect(chips()).toBe(0);
  });

  it('that answers after the page has gone says nothing', async () => {
    const base = createMockApi();
    let refuse: (reason: Error) => void = () => {};
    const api = { ...base, guideDialogueCuesIn: () => new Promise<never>((_, reject) => (refuse = reject)) } as NarrationApi;
    const page = mount(api);
    await firstHeading().catch(() => null);
    page.unmount();
    render(<OverlayHost />);
    await act(async () => refuse(new Error(CUES)));
    expect(screen.queryByText(CUES)).toBeNull();
    expect(overlay.getSnapshot().toasts).toEqual([]);
  });

  it('is said while another read has not answered, and is not raised again when the reads of another chapter run', async () => {
    const base = createMockApi();
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const chapterTwo: string[] = [];
    const slow = {
      ...base,
      manuscriptParagraphs: async (chapterId: string) => {
        if (chapterId !== 'chapter-2') return base.manuscriptParagraphs(chapterId);
        chapterTwo.push(chapterId);
        await held;
        return base.manuscriptParagraphs(chapterId);
      },
    } as NarrationApi;
    const { api } = refusing('guideDialogueCuesIn', CUES, slow);
    const toast = vi.spyOn(overlay, 'toast');
    const chapterTwoText = () => document.querySelectorAll('[data-reader] [data-para][data-ch="chapter-2"]').length;
    mount(api);
    await errorToast(CUES);
    expect(chapterTwo).toEqual(['chapter-2']);
    expect(chapterTwoText()).toBe(0);
    expect(raised(toast)).toBe(1);
    await act(async () => release());
    await waitFor(() => expect(chapterTwoText()).toBeGreaterThan(0), { timeout: 3000 });
    await act(async () => {});
    // It is the failure already on show: Chapter 2's read ending does not take the toast away and raise it again.
    expect(raised(toast)).toBe(1);
    expect(screen.getByText(CUES)).toBeTruthy();
    toast.mockRestore();
  });

  it('with no sentence from the host is still said, with Retry', async () => {
    const base = createMockApi();
    mount({ ...base, guideDialogueCuesIn: () => Promise.reject(new Error('')) } as NarrationApi);
    await errorToast('Part of this page could not be read. The host gave no reason.');
    expect(retry()).toBeTruthy();
  });

  it('of both a list and the cues: Retry asks the host for both again', async () => {
    const marks = refusing('marksList', 'The marks could not be read.');
    const cues = refusing('guideDialogueCuesIn', CUES, marks.api);
    mount(cues.api);
    await firstHeading();
    await waitFor(() => expect(marks.asked).toHaveBeenCalled());
    await waitFor(() => expect(cues.asked).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeNull(), { timeout: 3000 });
    await act(async () => {});
    const before = { marks: marks.asked.mock.calls.length, cues: cues.asked.mock.calls.length };
    marks.fails.now = false;
    cues.fails.now = false;
    fireEvent.click(retry());
    await waitFor(() => expect(marks.asked.mock.calls.length).toBe(before.marks + 1));
    await waitFor(() => expect(cues.asked.mock.calls.length).toBe(before.cues + 1));
    await waitFor(() => expect(chips()).toBeGreaterThan(0), { timeout: 3000 });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull(), { timeout: 3000 });
  });

  it.each([
    ['scriptPrepList', 'The prep states could not be read.', 'load'],
    ['guideEntities', 'The Story Bible could not be read.', 'load'],
    ['guideTypes', 'The Story Bible types could not be read.', 'load'],
    ['marksList', 'The marks could not be read.', 'load'],
    ['manuscriptParagraphs', 'This chapter could not be read.', 'load'],
    // A first read of the chapter list that fails is the page's error state (LoadError); a later one keeps the workspace.
    ['manuscriptChapters', 'The chapters could not be read.', 'a later read'],
  ] as const)('of %s ("%s", on %s) says the host sentence with a Retry that reads it again', async (read, sentence, when) => {
    const { api, fails, asked, endJob } = refusing(read, sentence);
    fails.now = when === 'load';
    mount(api);
    if (when !== 'load') {
      await firstHeading();
      fails.now = true;
      await endJob();
    }
    await errorToast(sentence);
    expect(await firstHeading()).toBeTruthy();
    const before = asked.mock.calls.length;
    fails.now = false;
    fireEvent.click(retry());
    await waitFor(() => expect(asked.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull(), { timeout: 3000 });
  });

  // One list for every page (#3658): a job that ends is one read of the chapter list, the store's, and the page follows it; Script has no read of its own for it.
  it('reads the chapter list once when a job ends', async () => {
    const { api, fails, asked, endJob } = refusing('manuscriptChapters', 'The chapters could not be read.');
    fails.now = false;
    mount(api);
    await firstHeading();
    const before = asked.mock.calls.length;
    await endJob();
    await waitFor(() => expect(asked.mock.calls.length).toBeGreaterThan(before));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(asked.mock.calls.length).toBe(before + 1);
  });
});
