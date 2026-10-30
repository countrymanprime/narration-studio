// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS, WIRE_DISCREPANCIES, WIRE_TRACKS_PROJECT, WIRE_TRANSCRIPT } from '../../api/mockFixtures';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { headingName } from '../../chapterHeading';
import { CommandRouter } from '../../input/router';
import type { NarrationApi } from '../../types';
import { ProofChapterPage } from './ProofChapterPage';

afterEach(cleanup);

const chapter = WIRE_CHAPTERS[0];
const linkedTrackGuid = WIRE_TRACKS_PROJECT.tracks[0].guid;

type PageProps = Parameters<typeof ProofChapterPage>[0];

function renderWorkspace(
  overrides: Partial<NarrationApi> = {},
  initial: Parameters<typeof createMockApi>[1] = {},
  page: Partial<PageProps> = {},
  at = `/proof/${chapter.id}`,
) {
  const props: PageProps = {
    notify: () => {},
    transcript: WIRE_TRANSCRIPT,
    dawFileLinked: true,
    goToManuscript: () => {},
    goToEditing: () => {},
    refreshKey: 'test',
    ...page,
  };
  const api = createMockApi(overrides, {
    chapterTrackMappings: [{ trackGuid: linkedTrackGuid, chapterId: chapter.id, chapterTitle: chapter.title, confirmedAt: '2026-01-01T00:00:00Z' }],
    ...initial,
  });
  render(
    <ApiProvider api={api}>
      <CommandRouter>
        <MemoryRouter initialEntries={[at]}>
          <Routes>
            <Route path="/proof/:chapterId" element={<ProofChapterPage {...props} />} />
          </Routes>
        </MemoryRouter>
      </CommandRouter>
    </ApiProvider>,
  );
  return api;
}

describe('ProofChapterPage', () => {
  it('shows the chapter’s name and a current check state', async () => {
    renderWorkspace();
    expect(await screen.findByRole('heading', { name: `Proof · ${headingName(chapter)}` })).toBeTruthy();
    expect(await screen.findByText('Check current')).toBeTruthy();
  });

  // Owner rule: the credits are chapters, so each opens here like any other and is never "not in the manuscript".
  it.each(['credits-opening', 'credits-closing'])('opens %s as a chapter of its own', async (id) => {
    renderWorkspace({}, {}, {}, `/proof/${id}`);
    expect(await screen.findByRole('heading', { name: /^Proof · .*credits/i })).toBeTruthy();
    expect(screen.queryByText('This chapter is not in the manuscript')).toBeNull();
  });

  // SN-E9 (no-flag-no-second-page): the chapter view is Proof's, never the old workspace: no script, transport, takes or flags panel.
  it('no-flag-no-second-page: draws none of the workspace the Editing page replaced', async () => {
    renderWorkspace();
    await screen.findByText('Check current');
    expect(screen.queryByRole('button', { name: /^Play/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: /^Flags/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: /^Takes/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /in REAPER$/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Start comparison/ })).toBeTruthy();
  });

  it('shows the "not checked yet" state for a chapter never checked', async () => {
    const neverChecked = WIRE_CHAPTERS[9]; // status 'proofing'/'not_started' tier, no recordedFraction seeded
    render(
      <ApiProvider
        api={createMockApi(
          {},
          {
            chapterTrackMappings: [
              {
                trackGuid: WIRE_TRACKS_PROJECT.tracks[0].guid,
                chapterId: neverChecked.id,
                chapterTitle: neverChecked.title,
                confirmedAt: '2026-01-01T00:00:00Z',
              },
            ],
          },
        )}
      >
        <CommandRouter>
          <MemoryRouter initialEntries={[`/proof/${neverChecked.id}`]}>
            <Routes>
              <Route
                path="/proof/:chapterId"
                element={
                  <ProofChapterPage
                    notify={() => {}}
                    transcript={WIRE_TRANSCRIPT}
                    dawFileLinked
                    goToManuscript={() => {}}
                    goToEditing={() => {}}
                    refreshKey="test"
                  />
                }
              />
            </Routes>
          </MemoryRouter>
        </CommandRouter>
      </ApiProvider>,
    );
    // The title row's status says it, with Check recordings… beside it; the sentence is not repeated in a card under it (alignment audit XPC-13).
    expect(await screen.findByText('Not checked yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check recordings…' })).toBeTruthy();
    expect(screen.queryByText(/hasn’t been checked yet/)).toBeNull();
  });

  it('shows a message when the chapter has no linked track', async () => {
    renderWorkspace({}, { chapterTrackMappings: [] });
    expect(await screen.findByText(/isn’t linked to a REAPER track yet/)).toBeTruthy();
  });
});

// The compare run stays on the chapter view with its summary; its discrepancies were flags in the workspace, which the Editing page replaced.
describe('ProofChapterPage compare run', () => {
  const success = { ...WIRE_TRANSCRIPT, phase: 'success' as const, rows: WIRE_DISCREPANCIES };

  it('counts this chapter’s discrepancies in the summary, leaving other chapters’ out', async () => {
    renderWorkspace({}, {}, { transcript: success });
    expect(await screen.findByText(/2 discrepancies in Chapter 1/)).toBeTruthy();
  });

  it('reviews the last comparison with no linked DAW file, with Export off', async () => {
    const user = userEvent.setup();
    renderWorkspace({}, {}, { dawFileLinked: false });
    await user.click(await screen.findByRole('button', { name: 'Review last run' }));
    await waitFor(() => expect((screen.getByRole('button', { name: /Export \d+ marker/ }) as HTMLButtonElement).disabled).toBe(true));
  });
});

// SN-E9 (old-files-are-gone-and-nothing-imports-them): the workspace's files are deleted, and nothing in the app imports one.
describe('the old workspace', () => {
  const GONE = [
    'ScriptView',
    'TransportBar',
    'WaveformStrip',
    'TakesPanel',
    'ApplyFxDialog',
    'useChapterPlayback',
    'tokenAtTime',
    'takesPassage',
    'findingFlags',
    'compareFlags',
    'waveformLayout',
    'peaksDecode',
    'useWorkspaceReaper',
    'FlagsPanel',
    'InlineDiff',
  ];
  const here = dirname(fileURLToPath(import.meta.url));
  const src = join(here, '..', '..');
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? sources(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : [],
    );

  it('old-files-are-gone-and-nothing-imports-them: no workspace file is left in proof/', () => {
    const left = readdirSync(here).map((name) => name.replace(/\.(test\.)?tsx?$/, ''));
    expect(GONE.filter((name) => left.includes(name))).toEqual([]);
  });

  it('old-files-are-gone-and-nothing-imports-them: no source imports a deleted workspace file', () => {
    const importer = new RegExp(`from '[^']*/proof/(${GONE.join('|')})'|from '\\./(${GONE.join('|')})'`);
    const offenders = sources(src).filter((file) => importer.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

// The loading state (definition-of-done.md state matrix): a skeleton under the page's title while the chapter is read, then the page, a
// "not in the manuscript" panel for an id with no chapter, or the error; never a blank page.
describe('ProofChapterPage loading state', () => {
  const never = () => new Promise<never>(() => {});
  const region = () => screen.queryByRole('group', { name: 'Loading the chapter' });

  it('shows the title and a busy region while the chapters are read, however long that takes', async () => {
    renderWorkspace({ manuscriptChapters: never });
    expect(await screen.findByRole('heading', { level: 1, name: 'Proof' })).toBeTruthy();
    expect(region()?.getAttribute('aria-busy')).toBe('true');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(region()).toBeTruthy();
  });

  it('is replaced by the chapter when it arrives', async () => {
    renderWorkspace();
    expect(await screen.findByRole('heading', { name: `Proof · ${headingName(chapter)}` })).toBeTruthy();
    expect(region()).toBeNull();
  });

  it('says the chapter is not in the manuscript for an id that has none, not a blank page or a skeleton', async () => {
    renderWorkspace({ manuscriptChapters: async () => [] });
    expect(await screen.findByText('This chapter is not in the manuscript')).toBeTruthy();
    expect(region()).toBeNull();
  });

  it('shows the error, not a skeleton, when the chapters cannot be read', async () => {
    renderWorkspace({ manuscriptChapters: () => Promise.reject(new Error('The manuscript could not be read.')) });
    expect(await screen.findByText(/The manuscript could not be read\./)).toBeTruthy();
    expect(region()).toBeNull();
  });

  describe('a failed read offers Retry', () => {
    const chapters = () => Promise.resolve(WIRE_CHAPTERS);
    const failing = (message: string) => () => Promise.reject(new Error(message));
    const retry = () => screen.getByRole('button', { name: 'Retry' });
    const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    // Each call takes the next step: a function that answers (or fails) now, or a held promise.
    const sequence = <T,>(steps: Array<() => Promise<T>>) => vi.fn(() => (steps.length > 1 ? (steps.shift() as () => Promise<T>)() : steps[0]()));

    it("shows the read's sentence as an alert with Retry, and no skeleton", async () => {
      renderWorkspace({ manuscriptChapters: failing('The manuscript could not be read.') });
      const sentence = await screen.findByText(/The manuscript could not be read\./);
      expect(sentence.getAttribute('role')).toBe('alert');
      expect(retry()).toBeTruthy();
      expect(region()).toBeNull();
    });

    it('shows the skeleton with no stale error while it reads again, then the chapter', async () => {
      let release: (value: typeof WIRE_CHAPTERS) => void = () => {};
      const held = new Promise<typeof WIRE_CHAPTERS>((resolve) => (release = resolve));
      const read = sequence([failing('The manuscript could not be read.'), () => held]);
      renderWorkspace({ manuscriptChapters: read });
      await screen.findByText(/The manuscript could not be read\./);
      await userEvent.click(retry());
      expect(region()?.getAttribute('aria-busy')).toBe('true');
      expect(screen.queryByText(/The manuscript could not be read\./)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      await act(async () => release(WIRE_CHAPTERS));
      expect(await screen.findByRole('heading', { name: `Proof · ${headingName(chapter)}` })).toBeTruthy();
      expect(region()).toBeNull();
    });

    it('shows the new error with Retry when the second read fails too', async () => {
      renderWorkspace({ manuscriptChapters: sequence([failing('first'), failing('second')]) });
      await screen.findByText('first');
      await userEvent.click(retry());
      expect(await screen.findByText('second')).toBeTruthy();
      expect(screen.queryByText('first')).toBeNull();
      expect(retry()).toBeTruthy();
    });

    it("reads the chapter's check state again too, when that read was what failed", async () => {
      const alignment = sequence([failing('The check could not be read.'), () => new Promise<never>(() => {})]);
      renderWorkspace({ workspaceAlignment: alignment as never, manuscriptChapters: chapters });
      await screen.findByText(/The check could not be read\./);
      await userEvent.click(retry());
      await settle();
      expect(alignment).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/The check could not be read\./)).toBeNull();
    });

    it('fires one extra read for a double press', async () => {
      const read = sequence([failing('The manuscript could not be read.'), () => new Promise<never>(() => {})]);
      renderWorkspace({ manuscriptChapters: read });
      await screen.findByText(/The manuscript could not be read\./);
      const button = retry();
      await act(async () => {
        button.click();
        button.click();
      });
      await settle();
      expect(read).toHaveBeenCalledTimes(2);
    });

    it('sets nothing when the page is left mid-retry', async () => {
      let release: (value: typeof WIRE_CHAPTERS) => void = () => {};
      const held = new Promise<typeof WIRE_CHAPTERS>((resolve) => (release = resolve));
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      renderWorkspace({ manuscriptChapters: sequence([failing('The manuscript could not be read.'), () => held]) });
      await screen.findByText(/The manuscript could not be read\./);
      await userEvent.click(retry());
      cleanup();
      await act(async () => release(WIRE_CHAPTERS));
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
