// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { ThemeProvider } from '../../../theme/ThemeContext';
import type { NarrationApi } from '../../../types';
import { SettingsPage } from '../page/SettingsPage';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// Settings > Project > Unknown speakers: the switch for the local model that suggests a speaker for the lines the rules leave
// unknown. It works only when the host says a model is installed; otherwise it is off and says what is missing.
async function renderProject(api: NarrationApi) {
  const data = await api.bootstrap();
  render(
    <MemoryRouter>
      <ThemeProvider>
        <ApiProvider api={api}>
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
        </ApiProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  await userEvent.click(within(screen.getByRole('navigation', { name: 'Settings categories' })).getByRole('button', { name: /^Project/ }));
  return screen.findByRole('switch', { name: /Ask a local model about unknown speakers/ });
}

const fallbackValue = async (api: NarrationApi) => (await api.settingsForScope('global')).ManuscriptGuide?.find((field) => field.key === 'speaker_fallback');

describe('settings-unknown-speakers-switch', () => {
  it('is off by default, turns on for this computer when a model is installed, and off again', async () => {
    const api = createMockApi();
    const save = vi.spyOn(api, 'saveSettings');
    const toggle = await renderProject(api);
    await waitFor(() => expect(toggle.hasAttribute('disabled') || toggle.getAttribute('aria-disabled') === 'true').toBe(false));
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByText(/No local model is installed/)).toBeNull();
    await userEvent.click(toggle);
    await waitFor(() => expect(save).toHaveBeenCalledWith('ManuscriptGuide', 'global', { speaker_fallback: 'true' }));
    await waitFor(async () => expect((await fallbackValue(api))?.effectiveValue).toBe('true'));
    await waitFor(() => expect(screen.getByRole('switch', { name: /Ask a local model about unknown speakers/ }).getAttribute('aria-checked')).toBe('true'));
    await userEvent.click(screen.getByRole('switch', { name: /Ask a local model about unknown speakers/ }));
    await waitFor(async () => expect((await fallbackValue(api))?.effectiveValue).toBe('false'));
  });

  it('is off and says why when the host has no local model, even if the setting was saved on', async () => {
    const api = createMockApi();
    await api.saveSettings('ManuscriptGuide', 'global', { speaker_fallback: 'true' });
    const sources = await api.extractionSources();
    vi.spyOn(api, 'extractionSources').mockResolvedValue(
      sources.map((source) => (source.id === 'local-model' ? { ...source, available: false, reason: 'No local model is installed.' } : source)),
    );
    const save = vi.spyOn(api, 'saveSettings');
    const toggle = await renderProject(api);
    expect(await screen.findByText('No local model is installed.')).toBeTruthy();
    expect(toggle.hasAttribute('disabled') || toggle.getAttribute('aria-disabled') === 'true').toBe(true);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(toggle);
    expect(save).not.toHaveBeenCalled();
  });

  it('stays off and says it could not check when the host cannot be asked', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'extractionSources').mockRejectedValue(new Error('the host is gone'));
    const toggle = await renderProject(api);
    expect(await screen.findByText('Could not check for a local model.')).toBeTruthy();
    expect(toggle.hasAttribute('disabled') || toggle.getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('lists the model and the lines per run beside it, with the defaults', async () => {
    await renderProject(createMockApi());
    expect(await screen.findByText('Local model for unknown speakers')).toBeTruthy();
    expect(screen.getByText('Lines the local model may take per run')).toBeTruthy();
  });
});
