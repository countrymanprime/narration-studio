// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS, WIRE_TRANSCRIPT } from '../../api/mockFixtures';
import { chapterName } from '../../chapterName';
import { CommandRouter } from '../../input/router';
import type { NarrationApi, TranscriptState } from '../../types';
import { ChapterCompare } from './ChapterCompare';

afterEach(cleanup);

const chapter = WIRE_CHAPTERS[0];

function renderCompare(props: { transcript?: TranscriptState; dawFileLinked?: boolean; overrides?: Partial<NarrationApi> } = {}) {
  const api = createMockApi(props.overrides ?? {});
  render(
    <ApiProvider api={api}>
      <CommandRouter>
        <MemoryRouter>
          <ChapterCompare
            chapter={chapter}
            transcript={props.transcript ?? WIRE_TRANSCRIPT}
            notify={() => {}}
            dawFileLinked={props.dawFileLinked ?? true}
            goToManuscript={() => {}}
          />
        </MemoryRouter>
      </CommandRouter>
    </ApiProvider>,
  );
  return api;
}

describe('ChapterCompare (Compare on the Proof page, #2822)', () => {
  it('opens on Differences with the same comparison panel the chapter view draws', async () => {
    renderCompare();
    expect(screen.getByRole('region', { name: 'Compare' })).toBeTruthy();
    const tabs = screen.getByRole('group', { name: 'Compare view' });
    expect(Array.from(tabs.querySelectorAll('button')).map((tab) => tab.textContent)).toEqual(['Differences', 'Preview', 'Native takes']);
    expect(screen.getByRole('button', { name: 'Differences' }).getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByRole('heading', { name: 'Compare the recording with the script' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Preview' })).toBeNull();
  });

  it('shows the Preview panel and the Native takes panel behind their tabs, one at a time', async () => {
    const user = userEvent.setup();
    renderCompare();
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('heading', { name: 'Preview' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Compare the recording with the script' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Native takes' }));
    expect(await screen.findByText(/The app's recorder has no takes for this chapter/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Preview' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Differences' }));
    expect(await screen.findByRole('heading', { name: 'Compare the recording with the script' })).toBeTruthy();
  });

  it('says why a comparison cannot start when no project file is linked, as the chapter view does', async () => {
    renderCompare({ dawFileLinked: false });
    expect((await screen.findAllByText(/Link a REAPER project \(\.rpp\) file to start a comparison/)).length).toBeGreaterThan(0);
  });

  // The headline of #2822: a comparison is started, cancelled and reviewed from the Proof page itself, through the same wiring the page gives the panel.
  it('starts a comparison for the chapter in view from the Differences tab', async () => {
    const user = userEvent.setup();
    const transcriptStart = vi.fn().mockResolvedValue({ status: 'started' });
    renderCompare({ overrides: { transcriptStart } });
    await user.click(await screen.findByRole('button', { name: /Start comparison/ }));
    await waitFor(() => expect(transcriptStart).toHaveBeenCalledWith(expect.objectContaining({ chapterTitle: chapterName(chapter, 'short') })));
  });

  it('cancels a running comparison, which the app-wide state shows here', async () => {
    const user = userEvent.setup();
    const transcriptCancel = vi.fn().mockResolvedValue(undefined);
    renderCompare({ transcript: { ...WIRE_TRANSCRIPT, phase: 'running' }, overrides: { transcriptCancel } });
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(transcriptCancel).toHaveBeenCalledTimes(1));
  });

  it('keeps the run when the narrator looks at another tab and comes back', async () => {
    const user = userEvent.setup();
    renderCompare({ transcript: { ...WIRE_TRANSCRIPT, phase: 'running' } });
    expect(await screen.findByRole('button', { name: 'Cancel' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await user.click(screen.getByRole('button', { name: 'Differences' }));
    expect(await screen.findByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('offers the last completed comparison for review without a linked project file', async () => {
    const user = userEvent.setup();
    renderCompare({ dawFileLinked: false, overrides: { transcriptLastCompleted: async () => ({ ...WIRE_TRANSCRIPT, phase: 'success' }) } });
    await user.click(await screen.findByRole('button', { name: /Review last run/i }));
    expect(await screen.findByRole('button', { name: /New comparison/i })).toBeTruthy();
  });

  it('keeps the setup choices when the narrator looks at another tab and comes back', async () => {
    const user = userEvent.setup();
    renderCompare();
    const model = await screen.findByRole('button', { name: /^Tiny/ });
    await user.click(model);
    expect(screen.getByRole('button', { name: /^Tiny/ }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Native takes' }));
    await user.click(screen.getByRole('button', { name: 'Differences' }));
    expect(screen.getByRole('button', { name: /^Tiny/ }).getAttribute('aria-pressed')).toBe('true');
  });
});
