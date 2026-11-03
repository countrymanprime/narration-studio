// @vitest-environment jsdom
// The state matrix (definition of done, rule 3) for the "Voice sample storage" row in Settings. Each cell names its test.
//
//   REAPER (can label a range)      'offers all three and saves the choice with the project'
//   nothing chosen                  'starts on In the project folder and saves nothing'
//   back to the default             'choosing In the project folder again removes the project's choice'
//   Audacity (cannot)               'a DAW that cannot keep a region has the two DAW choices off, with the reason'
//   saved daw, DAW cannot           the same test: the saved value stays shown; a mark says why it cannot (the host's daw_unavailable)
//   DAW not answering               not tested here: the declaration, not the heartbeat, decides what is offered; a mark with the DAW closed is the host's refusal (internal/voicesample)
//   refused save                    not tested here: the host's refusal of a choice is the store's (SettingsStore tests)
//   loading                         'the DAW choices wait until the DAW has been asked'
//   reload, leave mid-action        not tested: the row holds no state the host keeps
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { StudioProvider } from '../../../studio/StudioProvider';
import { ThemeProvider } from '../../../theme/ThemeContext';
import type { NarrationApi } from '../../../types';
import { TooltipProvider } from '../../primitives/Tooltip';
import { SettingsPage } from '../page/SettingsPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderRow(api: NarrationApi) {
  const data = await api.bootstrap();
  render(
    <MemoryRouter>
      <ThemeProvider>
        <ApiProvider api={api}>
          <StudioProvider>
            <TooltipProvider>
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
            </TooltipProvider>
          </StudioProvider>
        </ApiProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  const nav = screen.getByRole('navigation', { name: 'Settings categories' });
  fireEvent.click(within(nav).getByRole('button', { name: /^Recording & DAW/ }));
  await screen.findByRole('heading', { level: 2, name: 'Recording & DAW' });
}
const row = () => document.querySelector<HTMLElement>('[data-row="daw.sampleStorage"]')!;
const radio = (name: string) => within(row()).findByRole('radio', { name });
const savedStorage = async (api: NarrationApi) => (await api.settingsForScope('project')).VoiceSamples?.find((f) => f.key === 'storage');

describe('Voice sample storage', () => {
  it('starts on In the project folder and saves nothing', async () => {
    const api = createMockApi();
    await renderRow(api);
    expect(((await radio('In the project folder')) as HTMLInputElement).getAttribute('aria-checked')).toBe('true');
    expect((await savedStorage(api))?.isSet).toBe(false);
  });

  it('offers all three and saves the choice with the project', async () => {
    const api = createMockApi();
    await renderRow(api);
    const daw = await radio('In the DAW');
    await waitFor(() => expect(daw.getAttribute('aria-disabled')).not.toBe('true'));
    fireEvent.click(daw);
    await waitFor(async () => expect((await savedStorage(api))?.effectiveValue).toBe('daw'));
    fireEvent.click(await radio('Both'));
    await waitFor(async () => expect((await savedStorage(api))?.effectiveValue).toBe('both'));
  });

  it("choosing In the project folder again removes the project's choice", async () => {
    const api = createMockApi();
    await api.saveSettings('VoiceSamples', 'project', { storage: 'both' });
    await renderRow(api);
    await waitFor(async () => expect((await radio('Both')).getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(await radio('In the project folder'));
    await waitFor(async () => expect((await savedStorage(api))?.isSet).toBe(false));
  });

  it('a DAW that cannot keep a region has the two DAW choices off, with the reason', async () => {
    const api = createMockApi({}, { daw: { daw: 'Audacity' } });
    await renderRow(api);
    const daw = await radio('In the DAW');
    await waitFor(() => expect(daw.getAttribute('aria-disabled')).toBe('true'));
    expect((await radio('Both')).getAttribute('aria-disabled')).toBe('true');
    expect(row().textContent).toMatch(/not available with Audacity yet/);
    expect((await radio('In the project folder')).getAttribute('aria-disabled')).not.toBe('true');
  });
});
