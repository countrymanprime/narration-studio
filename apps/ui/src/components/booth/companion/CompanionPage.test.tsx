// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { CommandRouter } from '../../../input/router';
import type { CreditsRenderResult, NarrationApi } from '../../../types';
import { CompanionPage } from './CompanionPage';

const spies = vi.hoisted(() => ({ useRecordInReaper: vi.fn(), toggleFullscreen: vi.fn(async () => true), shellProps: vi.fn(), resume: vi.fn() }));

vi.mock('../useRecordInReaper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useRecordInReaper')>();
  return {
    ...actual,
    useRecordInReaper: (...args: Parameters<typeof actual.useRecordInReaper>) => {
      spies.useRecordInReaper(...args);
      return actual.useRecordInReaper(...args);
    },
  };
});
vi.mock('../../../api/hostWindow', async (importOriginal) => ({ ...(await importOriginal<object>()), toggleFullscreen: spies.toggleFullscreen }));
vi.mock('../CompanionShell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../CompanionShell')>();
  return {
    CompanionShell: (props: Parameters<typeof actual.CompanionShell>[0]) => {
      spies.shellProps(props);
      return (
        <>
          <actual.CompanionShell {...props} />
          <div data-testid="header-slot">{props.header}</div>
        </>
      );
    },
  };
});
vi.mock('../ResumePrompt', () => ({
  ResumePrompt: (props: { chapterId: string }) => {
    spies.resume(props.chapterId);
    return <p>resume-prompt</p>;
  },
}));

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CREDITS: CreditsRenderResult = { text: '[Title], read by [Narrator].', words: 5, unresolved: ['Title'] };

function Probe() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

async function renderCompanion(entry: string, overrides: Partial<NarrationApi> = {}) {
  const api = createMockApi(overrides);
  const chapters = await api.manuscriptChapters();
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ApiProvider api={api}>
        <CommandRouter>
          <Routes>
            <Route path="/companion" element={<CompanionPage />} />
            <Route path="/booth" element={<p>the booth</p>} />
          </Routes>
          <Probe />
        </CommandRouter>
      </ApiProvider>
    </MemoryRouter>,
  );
  return { api, chapters };
}

describe('CompanionPage', () => {
  it('the-companion-renders-from-its-own-route: /companion?chapter=<id> mounts CompanionShell with the host-built props', async () => {
    const { chapters } = await renderCompanion('/companion?chapter=' + encodeURIComponent((await createMockApi().manuscriptChapters())[0].id));
    expect(await screen.findByRole('heading', { level: 1, name: 'Companion' })).toBeTruthy();
    const props = spies.shellProps.mock.calls.at(-1)![0];
    expect(props.chapterId).toBe(chapters[0].id);
    for (const key of ['session', 'follow', 'chapterTitle', 'recording', 'marks', 'header', 'onFullApp']) expect(props, key).toHaveProperty(key);
  });

  it('play-and-stop-still-arm-and-stop-reaper: the host passes useRecordInReaper(chapterId, record.available)', async () => {
    const [first] = await createMockApi().manuscriptChapters();
    await renderCompanion(`/companion?chapter=${encodeURIComponent(first.id)}`);
    await screen.findByRole('heading', { level: 1, name: 'Companion' });
    const [chapterId, available] = spies.useRecordInReaper.mock.calls.at(-1)!;
    expect(chapterId).toBe(first.id);
    expect(typeof available).toBe('boolean');
    expect(spies.shellProps.mock.calls.at(-1)![0].recording).toEqual(
      expect.objectContaining({ beforeStart: expect.any(Function), afterStop: expect.any(Function) }),
    );
  });

  it('the-resume-notice-and-the-unresolved-credits-warning-are-kept: the header holds ResumePrompt for a chapter', async () => {
    const [first] = await createMockApi().manuscriptChapters();
    await renderCompanion(`/companion?chapter=${encodeURIComponent(first.id)}`);
    expect((await screen.findAllByText('resume-prompt')).length).toBeGreaterThan(0);
    expect(spies.resume).toHaveBeenCalledWith(first.id);
  });

  it('the-resume-notice-and-the-unresolved-credits-warning-are-kept: the header holds the warning for credits with unresolved tokens', async () => {
    await renderCompanion('/companion?credits=opening', {
      creditsTemplates: async () => [{ kind: 'opening', body: 'x' }] as Awaited<ReturnType<NarrationApi['creditsTemplates']>>,
      creditsPreview: async () => CREDITS,
    });
    const slot = await screen.findByTestId('header-slot');
    expect(slot.textContent).toMatch(/Title/);
    expect(screen.queryByText('resume-prompt')).toBeNull();
  });

  it('full-app-goes-back-to-the-booth: Full app navigates to /booth with the same chapter', async () => {
    const [first] = await createMockApi().manuscriptChapters();
    await renderCompanion(`/companion?chapter=${encodeURIComponent(first.id)}`);
    await userEvent.setup().click(await screen.findByRole('button', { name: /full app/i }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(`/booth?chapter=${encodeURIComponent(first.id)}`));
  });

  it('f11-is-not-bound-in-the-companion: F11 never takes the window fullscreen', async () => {
    await renderCompanion('/companion');
    await screen.findByRole('heading', { level: 1, name: 'Companion' });
    await userEvent.setup().keyboard('{F11}');
    expect(spies.toggleFullscreen).not.toHaveBeenCalled();
  });

  it('a-chapterless-address-picks-the-last-read-chapter', async () => {
    const api = createMockApi();
    const reader = await api.readerState();
    await renderCompanion('/companion');
    await screen.findByRole('heading', { level: 1, name: 'Companion' });
    const chapters = await api.manuscriptChapters();
    const expected = chapters.find((item) => item.id === reader.activeChapter || item.title === reader.activeChapter) ?? chapters[0];
    expect(spies.shellProps.mock.calls.at(-1)![0].chapterId).toBe(expected.id);
  });

  it('an unknown chapter redirects to /booth', async () => {
    await renderCompanion('/companion?chapter=no-such-chapter');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/booth'));
    expect(screen.getByText('the booth')).toBeTruthy();
  });
});
