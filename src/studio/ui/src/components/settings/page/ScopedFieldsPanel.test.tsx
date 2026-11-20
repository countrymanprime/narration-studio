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

it('names the two chunk_seconds fields for what each one chunks, whatever the host calls them (#2980)', async () => {
  const draw = (tool: string) =>
    render(
      <ApiProvider api={createMockApi()}>
        <SettingsFormsProvider notify={vi.fn()} onDirtyChange={vi.fn()} registerActions={vi.fn()}>
          <ScopedFieldsPanel id={tool} title={tool} tool={tool} scopes={['global']} notify={vi.fn()} />
        </SettingsFormsProvider>
      </ApiProvider>,
    );
  draw('TranscriptCompare');
  const compare = await screen.findByRole('combobox', { name: 'Compare chunk length' });
  expect(Array.from((compare as HTMLSelectElement).options).map((option) => option.value)).toEqual(['30', '60', '300', '600']);
  cleanup();
  draw('RecordingCoverage');
  const coverage = await screen.findByRole('combobox', { name: 'Coverage chunk length (0 = each item whole)' });
  expect(Array.from((coverage as HTMLSelectElement).options).map((option) => option.value)).toContain('0');
});

// B7 (#3680): text left in a colour box that is not a colour was dropped without a word on leaving, and was drawn under the other scope.
function drawCompare(api = createMockApi()) {
  const onDirtyChange = vi.fn();
  render(
    <ApiProvider api={api}>
      <SettingsFormsProvider notify={vi.fn()} onDirtyChange={onDirtyChange} registerActions={vi.fn()}>
        <ScopedFieldsPanel id="compare" title="Compare" tool="TranscriptCompare" scopes={['global', 'project']} notify={vi.fn()} />
      </SettingsFormsProvider>
    </ApiProvider>,
  );
  return { api, onDirtyChange };
}
const misread = () => screen.findByRole<HTMLInputElement>('textbox', { name: 'Misread marker color hex' });

it('a refused colour draft counts as unsaved: the page is told, and a scope switch asks first', async () => {
  const { onDirtyChange } = drawCompare();
  const box = await misread();
  fireEvent.change(box, { target: { value: '4D5E6' } });
  fireEvent.blur(box);
  expect(await screen.findByText('Unsaved changes')).toBeTruthy();
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  expect((await misread()).getAttribute('aria-invalid')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'This project' }));
  expect(await screen.findByText('Save or discard changes before leaving?')).toBeTruthy();
});

it('Discard & continue drops the refused draft: the other scope shows its own colour, unmarked', async () => {
  drawCompare();
  const box = await misread();
  const stored = box.value;
  fireEvent.change(box, { target: { value: '4D5E6' } });
  fireEvent.blur(box);
  fireEvent.click(screen.getByRole('button', { name: 'This project' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Discard & continue' }));
  await act(async () => undefined);
  await screen.findByText('This project, falling back to Global where unset');
  const after = await misread();
  expect(after.value).toBe(stored);
  expect(after.getAttribute('aria-invalid')).toBeNull();
  expect(screen.queryByText('Unsaved changes')).toBeNull();
});

it('Save & continue that the host refuses stays in the scope, with the draft still in its box', async () => {
  const api = createMockApi();
  // The host's own sentence for a colour that is not six hex digits (validateSettingValue in app.go); the mock accepts anything.
  const saved = vi.fn(async () => {
    throw new Error('setting color_misread must be a six-digit color');
  });
  api.saveSettings = saved;
  drawCompare(api);
  const box = await misread();
  fireEvent.change(box, { target: { value: '4D5E6' } });
  fireEvent.blur(box);
  fireEvent.click(screen.getByRole('button', { name: 'This project' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Save & continue' }));
  await act(async () => undefined);
  expect(saved).toHaveBeenCalledExactlyOnceWith('TranscriptCompare', 'global', { color_misread: '4D5E6' });
  expect(screen.getByText('Global defaults')).toBeTruthy();
  expect((await misread()).value).toBe('4D5E6');
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
});
