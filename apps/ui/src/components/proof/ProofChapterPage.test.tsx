// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS, WIRE_DISCREPANCIES, WIRE_TRACKS_PROJECT, WIRE_TRANSCRIPT } from '../../api/mockFixtures';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chapterName } from '../../chapterName';
import { CommandRouter } from '../../input/router';
import type { NarrationApi } from '../../types';
import { ProofChapterPage } from './ProofChapterPage';

afterEach(cleanup);

const chapter = WIRE_CHAPTERS[0];
const linkedTrackGuid = WIRE_TRACKS_PROJECT.tracks[0].guid;

type PageProps = Parameters<typeof ProofChapterPage>[0];

function renderWorkspace(overrides: Partial<NarrationApi> = {}, initial: Parameters<typeof createMockApi>[1] = {}, page: Partial<PageProps> = {}) {
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
        <MemoryRouter initialEntries={[`/proof/${chapter.id}`]}>
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
    expect(await screen.findByRole('heading', { name: `Proof · ${chapterName(chapter)}` })).toBeTruthy();
    expect(await screen.findByText('Check current')).toBeTruthy();
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
    expect(await screen.findAllByText(/hasn’t been checked yet/)).not.toHaveLength(0);
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
    await user.click(await screen.findByRole('button', { name: /Last narrated take/ }));
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
