// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { ScopedFieldsPanel } from './ScopedFieldsPanel';
import { SettingsFormsProvider } from '../data/settingsForms';

afterEach(cleanup);

it('keeps an edit typed before the panel has copied the settings it just read', async () => {
  const api = createMockApi();
  const read = api.settingsForScope;
  let answer: () => void = () => undefined;
  api.settingsForScope = (scope) => read(scope).then((settings) => new Promise((resolve) => (answer = () => resolve(settings))));
  const saved = vi.fn(api.saveSettings);
  api.saveSettings = saved;
  render(
    <ApiProvider api={api}>
      <SettingsFormsProvider notify={vi.fn()} onDirtyChange={vi.fn()} registerActions={vi.fn()}>
        <ScopedFieldsPanel id="cleanup" title="Silence cleanup" tool="Cleanup" scopes={['global']} notify={vi.fn()} />
      </SettingsFormsProvider>
    </ApiProvider>,
  );
  await act(async () => undefined);
  // The read lands outside act, as it does in the app: React draws the fields but has not run its effects yet.
  const previous = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  const firstField = () => screen.queryAllByRole('textbox')[0] ?? screen.queryAllByRole('spinbutton')[0];
  // A MutationObserver hears the commit straight away, as findBy* does; React runs the commit's effects in a later task.
  const drawn = new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (!firstField()) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  answer();
  await drawn;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previous;
  const field = firstField();
  expect(field).toBeDefined();
  fireEvent.change(field!, { target: { value: '7' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
  await act(async () => undefined);
  expect(saved).toHaveBeenCalledTimes(1);
});
