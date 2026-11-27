// @vitest-environment jsdom
// #4087: with no chapter asked for and none remembered, the Companion opens on the chapter the DAW is on, as the Booth does (`useFollowDawOnOpen`), draws no
// other chapter first, and "Full app" goes to that chapter without moving the DAW anywhere else. A DAW answer that comes after the narrator pressed Play moves nothing.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { CommandRouter } from '../../../input/router';
import type { NarrationApi } from '../../../types';
import { saveLastPlace } from '../page/lastPlace';
import { CompanionPage } from './CompanionPage';

const spies = vi.hoisted(() => ({ shellProps: vi.fn() }));

vi.mock('../../../api/hostWindow', async (importOriginal) => ({ ...(await importOriginal<object>()), toggleFullscreen: vi.fn(async () => true) }));
vi.mock('../CompanionShell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../CompanionShell')>();
  return {
    CompanionShell: (props: Parameters<typeof actual.CompanionShell>[0]) => {
      spies.shellProps(props);
      return <actual.CompanionShell {...props} />;
    },
  };
});
vi.mock('../ResumePrompt', () => ({ ResumePrompt: () => null }));

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function Probe() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

const shown = (): string | undefined => spies.shellProps.mock.calls.at(-1)?.[0].chapterId;
/** Every chapter the shell was drawn on, in order. */
const drawn = (): string[] => [...new Set(spies.shellProps.mock.calls.map((call) => call[0].chapterId as string))];
const dawOn = (chapterId: string) => async () => ({ ok: true, message: '', chapterId, selected: chapterId === '' ? 0 : 1, cursor: 0 });
const goTo = () => vi.fn(async () => ({ ok: true, changed: true, message: '', undoSteps: 0 }));
/** The reader state names the chapter the narrator last read: the page opens on it when the DAW names none. */
const READER_ON_1 = async () => ({ ...(await createMockApi().readerState()), activeChapter: 'chapter-1' });
const READER_ON_2 = async () => ({ ...(await createMockApi().readerState()), activeChapter: 'chapter-2' });

function tree(api: NarrationApi, entry = '/companion', projectFolder = '/proj') {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <ApiProvider api={api}>
        <CommandRouter>
          <Routes>
            <Route path="/companion" element={<CompanionPage projectFolder={projectFolder} />} />
            <Route path="/booth" element={<p>the booth</p>} />
          </Routes>
          <Probe />
        </CommandRouter>
      </ApiProvider>
    </MemoryRouter>
  );
}

describe('the Companion with nothing remembered opens on the DAW chapter (#4087)', () => {
  it('opens on chapter 3 without drawing chapter 1, and Full app goes to chapter 3 without sending the DAW anywhere', async () => {
    const dawGoToChapter = goTo();
    render(tree(createMockApi({ readerState: READER_ON_2, dawPlace: dawOn('chapter-3'), dawGoToChapter })));
    await waitFor(() => expect(shown()).toBe('chapter-3'));
    expect(drawn()).toEqual(['chapter-3']);
    await userEvent.setup().click(await screen.findByRole('button', { name: /full app/i }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/booth?chapter=chapter-3'));
    // The Companion itself never moves the DAW, and the Booth it goes to is given the DAW's own chapter, not chapter 1.
    expect(dawGoToChapter).not.toHaveBeenCalled();
  });

  it('says "Opening your chapter…", as the Booth does, until the DAW answers', async () => {
    // The DAW's answer is held open by this test, so the status is on screen for as long as the test needs it, whatever the load.
    let answer: () => void = () => {};
    const dawPlace = vi.fn(
      () =>
        new Promise<never>((resolve) => {
          answer = () => resolve({ ok: true, message: '', chapterId: 'chapter-3', selected: 1, cursor: 0 } as never);
        }),
    );
    render(tree(createMockApi({ dawPlace })));
    // The status is drawn once the chapters are read and the DAW is asked: wait for that call, not for the text under a timer.
    await waitFor(() => expect(dawPlace).toHaveBeenCalledTimes(1), { timeout: 10_000 });
    expect(screen.getByText('Opening your chapter…')).toBeTruthy();
    expect(spies.shellProps).not.toHaveBeenCalled();
    await act(async () => answer());
    await waitFor(() => expect(shown()).toBe('chapter-3'));
    expect(screen.queryByText('Opening your chapter…')).toBeNull();
  });

  it('asks the DAW once', async () => {
    const dawPlace = vi.fn(dawOn('chapter-2'));
    render(tree(createMockApi({ dawPlace })));
    await waitFor(() => expect(shown()).toBe('chapter-2'));
    expect(dawPlace).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no chapter selected', dawOn('')],
    ['a chapter the book does not have', dawOn('nowhere')],
    ['a DAW that is not linked', async () => ({ ok: false, message: 'No DAW is linked.', chapterId: '', selected: 0, cursor: 0 })],
    [
      'a read that fails',
      async () => {
        throw new Error('no answer');
      },
    ],
  ])('%s: the chapter last read opens, and the DAW is not moved', async (_name, dawPlace) => {
    const dawGoToChapter = goTo();
    render(tree(createMockApi({ readerState: READER_ON_2, dawPlace, dawGoToChapter } as Partial<NarrationApi>)));
    await waitFor(() => expect(shown()).toBe('chapter-2'));
    expect(dawGoToChapter).not.toHaveBeenCalled();
  });

  it('a remembered chapter wins over the DAW, and the DAW is not asked', async () => {
    saveLastPlace('/proj', { chapterId: 'chapter-2', paragraphId: '', word: 0 });
    const dawPlace = vi.fn(dawOn('chapter-3'));
    render(tree(createMockApi({ dawPlace })));
    await waitFor(() => expect(shown()).toBe('chapter-2'));
    expect(dawPlace).not.toHaveBeenCalled();
  });

  it('a remembered chapter that is gone is nothing remembered: the DAW decides', async () => {
    saveLastPlace('/proj', { chapterId: 'deleted', paragraphId: '', word: 0 });
    render(tree(createMockApi({ dawPlace: dawOn('chapter-3') })));
    await waitFor(() => expect(shown()).toBe('chapter-3'));
  });

  it('a chapter in the address wins, and the DAW is not asked', async () => {
    const dawPlace = vi.fn(dawOn('chapter-3'));
    render(tree(createMockApi({ dawPlace }), '/companion?chapter=chapter-2'));
    await waitFor(() => expect(shown()).toBe('chapter-2'));
    expect(dawPlace).not.toHaveBeenCalled();
  });

  it('a running session chapter wins, and the DAW is not asked', async () => {
    const base = createMockApi();
    const dawPlace = vi.fn(dawOn('chapter-3'));
    render(tree(createMockApi({ dawPlace, teleprompterState: async () => ({ ...(await base.teleprompterState()), phase: 'running', chapter: 'chapter-2' }) })));
    await waitFor(() => expect(shown()).toBe('chapter-2'));
    expect(dawPlace).not.toHaveBeenCalled();
  });
});

describe('a DAW answer that comes after the narrator pressed Play moves nothing (#4087)', () => {
  /** The DAW answers only when the test says, after the Companion has given up waiting and drawn a chapter. */
  async function openUndecided(overrides: Partial<NarrationApi>) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let answer: () => void = () => {};
    const dawPlace = vi.fn(
      () =>
        new Promise<never>((resolve) => {
          answer = () => resolve({ ok: true, message: '', chapterId: 'chapter-3', selected: 1, cursor: 0 } as never);
        }),
    );
    render(tree(createMockApi({ readerState: READER_ON_1, dawPlace, ...overrides })));
    await act(async () => void (await vi.advanceTimersByTimeAsync(3600)));
    await waitFor(() => expect(shown()).toBe('chapter-1'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await screen.findByRole('button', { name: /^play/i }));
    return { answer: () => act(async () => answer()), dawPlace, user };
  }
  const stays = () => {
    expect(shown()).toBe('chapter-1');
    expect(screen.getByTestId('where').textContent).toBe('/companion');
    expect(drawn()).toEqual(['chapter-1']);
  };

  it('a start the host has not answered yet', async () => {
    const teleprompterStart = vi.fn(() => new Promise<never>(() => {}));
    const { answer } = await openUndecided({ teleprompterStart });
    expect(teleprompterStart).toHaveBeenCalledTimes(1);
    await answer();
    stays();
  });

  it('a start that failed', async () => {
    const teleprompterStart = vi.fn(async () => {
      throw new Error('No microphone');
    });
    const { answer } = await openUndecided({ teleprompterStart });
    expect(teleprompterStart).toHaveBeenCalledTimes(1);
    await answer();
    stays();
  });

  it('a take that started and was stopped', async () => {
    const { answer, user } = await openUndecided({});
    await user.click(await screen.findByRole('button', { name: /stop reading/i }));
    await answer();
    stays();
  });
});

describe('a last-read read that never answers (#4087)', () => {
  it('holds the Companion for the DAW cap (3.5 s) and no longer, then opens the first chapter with text', async () => {
    // The clock is the test's alone (no auto-advance), so the bound is read off it exactly: a cap of 7 s would fail the second expect.
    vi.useFakeTimers();
    render(tree(createMockApi({ dawPlace: dawOn(''), readerState: () => new Promise<never>(() => {}) })));
    await act(async () => void (await vi.advanceTimersByTimeAsync(3400)));
    expect(spies.shellProps).not.toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(300)));
    expect(shown()).toBe('chapter-1');
  });
});
