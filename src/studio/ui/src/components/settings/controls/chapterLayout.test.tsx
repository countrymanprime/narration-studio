// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { StudioProvider } from '../../../studio/StudioProvider';
import { ThemeProvider } from '../../../theme/ThemeContext';
import { useVoiceLayout, useVoiceSetup, VoiceSetupProvider } from '../../engine/voiceLayout';
import { TooltipProvider } from '../../primitives/Tooltip';
import { SettingsPage } from '../page/SettingsPage';
import { ROWS } from '../registry/rows';
import { search } from '../registry/search';

afterEach(cleanup);

/** What the Engine panel reads: the same app-wide voice setup the Settings row writes. */
function EnginePanelProbe() {
  const { replace } = useVoiceSetup();
  const layout = useVoiceLayout();
  return (
    <button type="button" onClick={() => replace({ layout: 'flat', narratorCharacter: '', tracks: [] })}>
      Engine panel layout: {layout}
    </button>
  );
}

async function renderSettings() {
  const api = createMockApi({}, { daw: {} });
  const set = vi.spyOn(api, 'voiceTracksSetLayout');
  const data = await api.bootstrap();
  render(
    <MemoryRouter>
      <ThemeProvider>
        <ApiProvider api={api}>
          <StudioProvider>
            <TooltipProvider>
              <VoiceSetupProvider projectFolder={data.projectFolder}>
                <EnginePanelProbe />
                <main tabIndex={-1}>
                  <SettingsPage
                    data={data}
                    notify={vi.fn()}
                    onDirtyChange={vi.fn()}
                    registerActions={vi.fn()}
                    onProjectDataCleared={async () => undefined}
                    onLinkDawFile={vi.fn()}
                    go={vi.fn()}
                    refreshBootstrap={async () => undefined}
                  />
                </main>
              </VoiceSetupProvider>
            </TooltipProvider>
          </StudioProvider>
        </ApiProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  const nav = screen.getByRole('navigation', { name: 'Settings categories' });
  fireEvent.click(within(nav).getByRole('button', { name: /^Recording & DAW/ }));
  await screen.findByRole('heading', { level: 2, name: 'Recording & DAW' });
  return { set };
}

describe('the Chapter layout setting (parity audit)', () => {
  it('is a project row for REAPER in Chapter sync, found by search, with its help in the ? popover', () => {
    const row = ROWS.find((candidate) => candidate.id === 'daw.layout');
    expect(row).toMatchObject({ cat: 'recording', section: 'Chapter sync', scope: 'project', needs: 'reaper', def: 'flat' });
    expect(row?.more).toContain('Voice folders');
    for (const query of ['voice folders', 'flat', 'chapter layout']) expect(search(query).some((hit) => hit.row?.id === 'daw.layout')).toBe(true);
  });

  it('writes the project’s layout and the Engine panel follows at once', async () => {
    const { set } = await renderSettings();
    const group = await screen.findByRole('group', { name: 'Chapter layout' });
    fireEvent.click(within(group).getByRole('button', { name: /Voice folders/ }));
    await waitFor(() => expect(set).toHaveBeenCalledWith('folders'));
    expect(screen.getByRole('button', { name: 'Engine panel layout: folders' })).toBeTruthy();
    expect(document.querySelector('[data-row="daw.layout"]')?.textContent).toContain('Changed');
  });

  it('follows a change made on the Engine panel', async () => {
    const { set } = await renderSettings();
    const group = await screen.findByRole('group', { name: 'Chapter layout' });
    fireEvent.click(within(group).getByRole('button', { name: /Voice folders/ }));
    await waitFor(() => expect(set).toHaveBeenCalled());
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Engine panel layout/ })));
    await waitFor(() => expect(within(group).getByRole('button', { name: /Flat/ }).getAttribute('aria-pressed')).toBe('true'));
  });
});
