// @vitest-environment jsdom
// Opening the Companion with no chapter asked for: the chapter a running session is on, else the one the Booth remembers for this
// project (`loadLastPlace`, the one source), else the chapter the DAW is on (the Booth's `useFollowDawOnOpen`), else the reader state's,
// else the first chapter. "Full app" returns to that chapter.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function Probe() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

const place = (chapterId: string) => ({ chapterId, paragraphId: '', word: 0 });
const shown = (): string | undefined => spies.shellProps.mock.calls.at(-1)?.[0].chapterId;
const ON_CHAPTER_1 = async () => ({ ...(await createMockApi().readerState()), activeChapter: 'Chapter 1' });

function tree(api: NarrationApi, entry: string, projectFolder: string) {
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

async function open(entry = '/companion', overrides: Partial<NarrationApi> = {}, projectFolder = '/proj') {
  render(tree(createMockApi(overrides), entry, projectFolder));
  await screen.findByRole('heading', { level: 1, name: 'Companion' });
}

describe('the Companion opens on the chapter the Booth remembers', () => {
  it('opens-on-the-chapter-the-booth-saved-and-full-app-goes-there', async () => {
    saveLastPlace('/proj', place('chapter-3'));
    await open('/companion', { readerState: ON_CHAPTER_1 });
    await waitFor(() => expect(shown()).toBe('chapter-3'));
    await userEvent.setup().click(await screen.findByRole('button', { name: /full app/i }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/booth?chapter=chapter-3'));
  });

  it('a-running-session-chapter-still-wins', async () => {
    saveLastPlace('/proj', place('chapter-3'));
    const base = createMockApi();
    await open('/companion', { teleprompterState: async () => ({ ...(await base.teleprompterState()), phase: 'running', chapter: 'chapter-2' }) });
    await waitFor(() => expect(shown()).toBe('chapter-2'));
  });

  it('a-chapter-in-the-address-wins-over-everything', async () => {
    saveLastPlace('/proj', place('chapter-3'));
    await open('/companion?chapter=chapter-2', { readerState: ON_CHAPTER_1 });
    await waitFor(() => expect(shown()).toBe('chapter-2'));
  });

  it('an-unknown-saved-chapter-falls-through-to-the-reader-state', async () => {
    saveLastPlace('/proj', place('no-such-chapter'));
    await open('/companion', { readerState: async () => ({ ...(await createMockApi().readerState()), activeChapter: 'chapter-2' }) });
    await waitFor(() => expect(shown()).toBe('chapter-2'));
  });

  it('an-unknown-saved-chapter-and-reader-state-fall-through-to-the-first-chapter', async () => {
    saveLastPlace('/proj', place('no-such-chapter'));
    await open('/companion', { readerState: async () => ({ ...(await createMockApi().readerState()), activeChapter: 'nothing' }) });
    await waitFor(() => expect(shown()).toBe('chapter-1'));
  });

  it('a-place-saved-for-another-project-is-ignored', async () => {
    saveLastPlace('/other', place('chapter-3'));
    await open('/companion', { readerState: ON_CHAPTER_1 });
    await waitFor(() => expect(shown()).toBe('chapter-1'));
  });

  it('corrupt-storage-falls-through', async () => {
    window.localStorage.setItem('narration.booth.lastPlace./proj', '{not json');
    await open('/companion', { readerState: ON_CHAPTER_1 });
    await waitFor(() => expect(shown()).toBe('chapter-1'));
  });

  it('blocked-storage-falls-through', async () => {
    saveLastPlace('/proj', place('chapter-3'));
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await open('/companion', { readerState: ON_CHAPTER_1 });
    await waitFor(() => expect(shown()).toBe('chapter-1'));
  });

  it('a-project-switch-reads-the-new-projects-place', async () => {
    saveLastPlace('/a', place('chapter-3'));
    saveLastPlace('/b', place('chapter-2'));
    const api = createMockApi();
    const view = render(tree(api, '/companion', '/a'));
    await waitFor(() => expect(shown()).toBe('chapter-3'));
    view.rerender(tree(api, '/companion', '/b'));
    await waitFor(() => expect(shown()).toBe('chapter-2'));
  });

  it('with-nothing-remembered-it-opens-on-the-chapter-the-daw-is-on-and-full-app-goes-there', async () => {
    const dawPlace = async () => ({ ok: true, message: '', chapterId: 'chapter-6', selected: 1, cursor: 10 });
    await open('/companion', { readerState: ON_CHAPTER_1, dawPlace });
    await waitFor(() => expect(shown()).toBe('chapter-6'));
    await userEvent.setup().click(await screen.findByRole('button', { name: /full app/i }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/booth?chapter=chapter-6'));
  });

  it('the-remembered-chapter-wins-over-the-daws', async () => {
    saveLastPlace('/proj', place('chapter-3'));
    const dawPlace = vi.fn(async () => ({ ok: true, message: '', chapterId: 'chapter-6', selected: 1, cursor: 10 }));
    await open('/companion', { readerState: ON_CHAPTER_1, dawPlace });
    await waitFor(() => expect(shown()).toBe('chapter-3'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(shown()).toBe('chapter-3');
    expect(dawPlace).not.toHaveBeenCalled();
  });

  it('a-running-session-wins-over-the-daw', async () => {
    const base = createMockApi();
    const dawPlace = vi.fn(async () => ({ ok: true, message: '', chapterId: 'chapter-6', selected: 1, cursor: 10 }));
    await open('/companion', { dawPlace, teleprompterState: async () => ({ ...(await base.teleprompterState()), phase: 'running', chapter: 'chapter-2' }) });
    await waitFor(() => expect(shown()).toBe('chapter-2'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(shown()).toBe('chapter-2');
    expect(dawPlace).not.toHaveBeenCalled();
  });

  it('a-late-daw-answer-after-a-reading-started-does-not-change-the-chapter', async () => {
    let answer: (place: Awaited<ReturnType<NarrationApi['dawPlace']>>) => void = () => {};
    const dawPlace = () => new Promise<Awaited<ReturnType<NarrationApi['dawPlace']>>>((resolve) => (answer = resolve));
    await open('/companion', { readerState: ON_CHAPTER_1, dawPlace });
    await waitFor(() => expect(shown()).toBe('chapter-1'));
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Play' }));
    await screen.findByRole('button', { name: 'Pause' });
    answer({ ok: true, message: '', chapterId: 'chapter-6', selected: 1, cursor: 10 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(shown()).toBe('chapter-1');
  });
});
