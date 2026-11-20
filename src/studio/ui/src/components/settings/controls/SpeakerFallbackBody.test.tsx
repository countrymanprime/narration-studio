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
    await waitFor(() => expect(toggle.getAttribute('aria-disabled')).toBeNull());
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
    const reason = await screen.findByText('No local model is installed.');
    // The reason is the switch's own description and the switch is still a tab stop, so a keyboard and a screen reader get it.
    expect(toggle.getAttribute('aria-disabled')).toBe('true');
    expect(toggle.getAttribute('aria-describedby')).toBe(reason.id);
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(toggle);
    await userEvent.keyboard(' ');
    expect(save).not.toHaveBeenCalled();
  });

  it('stays off and says it could not check when the host cannot be asked', async () => {
    const api = createMockApi();
    vi.spyOn(api, 'extractionSources').mockRejectedValue(new Error('the host is gone'));
    const toggle = await renderProject(api);
    const reason = await screen.findByText('Could not check for a local model.');
    expect(toggle.getAttribute('aria-disabled')).toBe('true');
    expect(toggle.getAttribute('aria-describedby')).toBe(reason.id);
  });

  it('once on, the row is marked Changed and its Reset turns it off again', async () => {
    const api = createMockApi();
    const toggle = await renderProject(api);
    await waitFor(() => expect(toggle.getAttribute('aria-disabled')).toBeNull());
    expect(screen.queryByRole('button', { name: /^Reset Ask a local model about unknown speakers/ })).toBeNull();
    await userEvent.click(toggle);
    const reset = await screen.findByRole('button', { name: /^Reset Ask a local model about unknown speakers/ });
    expect(document.querySelector('[data-row="project.speakerFallback"]')?.getAttribute('data-changed')).toBe('true');
    await userEvent.click(reset);
    await waitFor(async () => expect((await fallbackValue(api))?.effectiveValue).toBe('false'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Reset Ask a local model about unknown speakers/ })).toBeNull());
  });

  it('keeps the model and the lines per run off, each with the reason, until the switch is on', async () => {
    const toggle = await renderProject(createMockApi());
    const model = screen.getByRole('combobox', { name: /Local model for unknown speakers/ });
    const lines = screen.getByRole('textbox', { name: /Lines the local model may take per run/ });
    const reasons = () => screen.queryAllByText('Turn on the local model above to change this.');
    expect((model as HTMLSelectElement).disabled).toBe(true);
    expect((lines as HTMLInputElement).disabled).toBe(true);
    expect(reasons()).toHaveLength(2);
    for (const control of [model, lines]) {
      expect(control.getAttribute('aria-describedby')?.split(' ')).toEqual(
        expect.arrayContaining(
          reasons()
            .map((reason) => reason.id)
            .filter((id) => control.getAttribute('aria-describedby')?.includes(id)),
        ),
      );
      expect(reasons().some((reason) => control.getAttribute('aria-describedby')?.split(' ').includes(reason.id))).toBe(true);
    }
    await waitFor(() => expect(toggle.getAttribute('aria-disabled')).toBeNull());
    await userEvent.click(toggle);
    await waitFor(() => expect((screen.getByRole('combobox', { name: /Local model for unknown speakers/ }) as HTMLSelectElement).disabled).toBe(false));
    expect((screen.getByRole('textbox', { name: /Lines the local model may take per run/ }) as HTMLInputElement).disabled).toBe(false);
    expect(reasons()).toHaveLength(0);
  });
});
