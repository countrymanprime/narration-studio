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

/** The mock host with one read refusing while `fails.now` is true. */
function refusing<K extends keyof NarrationApi>(read: K, sentence: string) {
  const base = createMockApi();
  const fails = { now: true };
  const asked = vi.fn();
  const api = {
    ...base,
    [read]: (...args: unknown[]) => {
      asked(...args);
      return fails.now ? Promise.reject(new Error(sentence)) : (base[read] as (...all: unknown[]) => unknown)(...args);
    },
  } as NarrationApi;
  return { api, fails, asked };
}

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

  it.each([
    ['scriptPrepList', 'The prep states could not be read.'],
    ['guideEntities', 'The Story Bible could not be read.'],
    ['guideTypes', 'The Story Bible types could not be read.'],
    ['marksList', 'The marks could not be read.'],
    ['manuscriptParagraphs', 'This chapter could not be read.'],
  ] as const)('of %s says the host sentence with a Retry that reads it again', async (read, sentence) => {
    const { api, fails, asked } = refusing(read, sentence);
    mount(api);
    await errorToast(sentence);
    const before = asked.mock.calls.length;
    fails.now = false;
    fireEvent.click(retry());
    await waitFor(() => expect(asked.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull(), { timeout: 3000 });
  });
});
