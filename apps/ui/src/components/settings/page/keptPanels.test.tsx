// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import type { NarrationApi } from '../../../types';
import { ProjectDataPanel } from './ProjectDataPanel';
import { ScopedFieldsPanel } from './ScopedFieldsPanel';
import { SettingsFormsProvider } from '../data/settingsForms';

afterEach(cleanup);

function withForms(api: NarrationApi, children: React.ReactNode) {
  return render(
    <ApiProvider api={api}>
      <SettingsFormsProvider notify={vi.fn()} onDirtyChange={vi.fn()} registerActions={vi.fn()}>
        {children}
      </SettingsFormsProvider>
    </ApiProvider>,
  );
}

describe('ProjectDataPanel', () => {
  it('clears only after the confirm, once, and hands over to the app when done', async () => {
    const api = createMockApi();
    let finish: () => void = () => undefined;
    const clear = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    api.clearProjectData = clear;
    const cleared = vi.fn(async () => undefined);
    withForms(api, <ProjectDataPanel notify={vi.fn()} onProjectDataCleared={cleared} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear derived project data…' }));
    expect(clear).not.toHaveBeenCalled();
    const confirm = await screen.findByRole('button', { name: 'Clear project data' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(clear).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(cleared).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Clear project data' })).toBeNull());
  });
});

describe('ScopedFieldsPanel save', () => {
  it('puts a Retry on the failure toast that saves the same edit again', async () => {
    const api = createMockApi();
    const real = api.saveSettings;
    let calls = 0;
    api.saveSettings = async (...args: Parameters<typeof real>) => {
      calls += 1;
      if (calls === 1) throw new Error('The settings file is read-only.');
      return real(...args);
    };
    const notify = vi.fn();
    render(
      <ApiProvider api={api}>
        <SettingsFormsProvider notify={notify} onDirtyChange={vi.fn()} registerActions={vi.fn()}>
          <ScopedFieldsPanel id="cleanup" title="Silence cleanup" tool="Cleanup" scopes={['global']} notify={notify} />
        </SettingsFormsProvider>
      </ApiProvider>,
    );
    const field = (await screen.findAllByRole('textbox'))[0] ?? (await screen.findAllByRole('spinbutton'))[0];
    fireEvent.change(field!, { target: { value: '7' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(notify).toHaveBeenCalled());
    const [, tone, action] = notify.mock.calls[0]!;
    expect(tone).toBe('error');
    expect(action?.label).toBe('Retry');
    action.onAction();
    await waitFor(() => expect(calls).toBe(2));
    await waitFor(() => expect(notify).toHaveBeenLastCalledWith('Global settings saved.'));
  });
});
