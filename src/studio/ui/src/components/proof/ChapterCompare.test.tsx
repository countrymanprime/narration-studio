// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_CHAPTERS, WIRE_TRANSCRIPT } from '../../api/mockFixtures';
import { CommandRouter } from '../../input/router';
import type { TranscriptState } from '../../types';
import { ChapterCompare } from './ChapterCompare';

afterEach(cleanup);

const chapter = WIRE_CHAPTERS[0];

function renderCompare(props: { transcript?: TranscriptState; dawFileLinked?: boolean } = {}) {
  const api = createMockApi();
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
});
