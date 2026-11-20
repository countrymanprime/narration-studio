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
  // The host's own sentence for a colour that is not six hex digits (validateSettingValue in app.go).
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

/** A host that answers a save only when told to, with the saves it was sent. */
function slowHost() {
  const api = createMockApi();
  const answers: (() => void)[] = [];
  const save = api.saveSettings;
  const saved = vi.fn(
    (...sent: Parameters<typeof save>) => new Promise<Awaited<ReturnType<typeof save>>>((resolve) => answers.push(() => resolve(save(...sent)))),
  );
  api.saveSettings = saved;
  return { api, saved, answer: () => act(async () => answers.splice(0).forEach((send) => send())) };
}
const form = (box: HTMLElement) => box.closest('form')!;
/** Enter in a text box of a form, as a browser does it: the key, then the form's submit unless the key was cancelled. */
function pressEnter(box: HTMLElement) {
  if (fireEvent.keyDown(box, { key: 'Enter' })) fireEvent.submit(form(box));
}

// R4 (#3680): Enter in the hex box submits the form, and every submit sent the values again while the first save was out.
it('a second submit while a save is out sends nothing', async () => {
  const { api, saved, answer } = slowHost();
  drawCompare(api);
  const box = await misread();
  fireEvent.change(box, { target: { value: 'AA0001' } });
  pressEnter(box);
  for (let repeat = 0; repeat < 20; repeat += 1) pressEnter(box);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await act(async () => undefined);
  expect(saved).toHaveBeenCalledExactlyOnceWith('TranscriptCompare', 'global', { color_misread: 'AA0001' });
  await answer();
  expect((await misread()).value).toBe('AA0001');
  expect(screen.queryByText('Unsaved changes')).toBeNull();
});

it('a save made after the first was answered is sent', async () => {
  const { api, saved, answer } = slowHost();
  drawCompare(api);
  const box = await misread();
  fireEvent.change(box, { target: { value: 'AA0001' } });
  pressEnter(box);
  await answer();
  fireEvent.change(await misread(), { target: { value: 'AA0002' } });
  pressEnter(await misread());
  await answer();
  expect(saved.mock.calls.map((call) => call[2])).toEqual([{ color_misread: 'AA0001' }, { color_misread: 'AA0002' }]);
});

// R5 (#3680): the form holds refused text as its unsaved value, and Enter in the box sent it to the host at once.
it.each(['GGGGGG', 'red', '# abcdef', '##abcdef', '<img src=x onerror=alert(1)>', 'ﬀﬀﬀ', 'A'.repeat(10_000)])(
  'Enter in a box holding refused text does not submit it: %j',
  async (text) => {
    const api = createMockApi();
    const saved = vi.fn(api.saveSettings);
    api.saveSettings = saved;
    drawCompare(api);
    const box = await misread();
    fireEvent.change(box, { target: { value: text } });
    // The Enter that refuses it, and those that follow while it is in the box.
    for (let press = 0; press < 3; press += 1) pressEnter(await misread());
    await act(async () => undefined);
    expect(saved).not.toHaveBeenCalled();
    expect((await misread()).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  },
);

it('Enter on a colour saves it through the form, as before', async () => {
  const notify = vi.fn();
  const api = createMockApi();
  render(
    <ApiProvider api={api}>
      <SettingsFormsProvider notify={vi.fn()} onDirtyChange={vi.fn()} registerActions={vi.fn()}>
        <ScopedFieldsPanel id="compare" title="Compare" tool="TranscriptCompare" scopes={['global', 'project']} notify={notify} />
      </SettingsFormsProvider>
    </ApiProvider>,
  );
  const box = await misread();
  fireEvent.change(box, { target: { value: ' #aa0003' } });
  pressEnter(box);
  await act(async () => undefined);
  expect(notify).toHaveBeenCalledWith('Global settings saved.');
  expect((await api.settingsForScope('global')).TranscriptCompare?.find((field) => field.key === 'color_misread')?.value).toBe('AA0003');
});

it('Escape in a refused box puts the stored colour back, and Save then has nothing to send', async () => {
  const api = createMockApi();
  const saved = vi.fn(api.saveSettings);
  api.saveSettings = saved;
  drawCompare(api);
  const box = await misread();
  const stored = box.value;
  fireEvent.change(box, { target: { value: 'GGGGGG' } });
  pressEnter(box);
  expect((await misread()).value).toBe('GGGGGG');
  fireEvent.keyDown(await misread(), { key: 'Escape' });
  expect((await misread()).value).toBe(stored);
  expect((await misread()).getAttribute('aria-invalid')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await act(async () => undefined);
  expect(saved).not.toHaveBeenCalled();
  expect(screen.queryByText('Unsaved changes')).toBeNull();
});

const hostColour = async (api: ReturnType<typeof createMockApi>) =>
  (await api.settingsForScope('global')).TranscriptCompare?.find((field) => field.key === 'color_misread')?.value;

// C1 (#3680): a second submit joined the save that was out, which carried the earlier values: the later value was dropped and the page said it saved.
it('a value changed while a save is out is sent by the next submit, or stays unsaved and says so', async () => {
  const { api, saved, answer } = slowHost();
  drawCompare(api);
  const box = await misread();
  fireEvent.change(box, { target: { value: '110001' } });
  pressEnter(box);
  fireEvent.change(await misread(), { target: { value: '220002' } });
  pressEnter(await misread());
  await act(async () => undefined);
  expect(saved).toHaveBeenCalledTimes(1);
  // The first answer: the second submit was waiting for it, and now sends the form as it is.
  await answer();
  expect(saved.mock.calls.map((call) => call[2])).toEqual([{ color_misread: '110001' }, { color_misread: '220002' }]);
  expect((await misread()).value).toBe('220002');
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  await answer();
  expect((await misread()).value).toBe('220002');
  expect(screen.queryByText('Unsaved changes')).toBeNull();
  expect(await hostColour(api)).toBe('220002');
});

it('a value changed while a save is out and not submitted stays in its box as unsaved', async () => {
  const { api, saved, answer } = slowHost();
  drawCompare(api);
  const box = await misread();
  fireEvent.change(box, { target: { value: '110001' } });
  pressEnter(box);
  fireEvent.change(await misread(), { target: { value: '220002' } });
  fireEvent.blur(await misread());
  await answer();
  expect(saved).toHaveBeenCalledExactlyOnceWith('TranscriptCompare', 'global', { color_misread: '110001' });
  expect((await misread()).value).toBe('220002');
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await act(async () => undefined);
  await answer();
  expect(saved.mock.calls.map((call) => call[2])).toEqual([{ color_misread: '110001' }, { color_misread: '220002' }]);
  expect(screen.queryByText('Unsaved changes')).toBeNull();
});

it('a value put back to the one being saved, then submitted, is sent again by its own save', async () => {
  const { api, saved, answer } = slowHost();
  drawCompare(api);
  const box = await misread();
  const stored = box.value;
  fireEvent.change(box, { target: { value: '110001' } });
  pressEnter(box);
  // Back to the colour the host held before the save that is out: once that save answers, this is a change again.
  fireEvent.change(await misread(), { target: { value: stored } });
  pressEnter(await misread());
  await answer();
  await answer();
  expect(saved.mock.calls.map((call) => call[2])).toEqual([{ color_misread: '110001' }, { color_misread: stored }]);
  expect(await hostColour(api)).toBe(stored);
  expect(screen.queryByText('Unsaved changes')).toBeNull();
});

// C7 (#3680): when the save answered, the form was copied from the read made before it, until the new read landed: the box's value changed
// twice, which dropped what was being typed.
it('text typed in a field while the save is out stands when it answers', async () => {
  const { api, answer } = slowHost();
  // The read that follows the save answers later than the save, as a host does.
  const read = api.settingsForScope;
  const reads: (() => void)[] = [];
  let held = false;
  api.settingsForScope = (scope) => (held ? new Promise((resolve) => reads.push(() => resolve(read(scope)))) : read(scope));
  drawCompare(api);
  const box = await misread();
  held = true;
  fireEvent.change(box, { target: { value: 'BB0002' } });
  pressEnter(box);
  fireEvent.change(await misread(), { target: { value: 'CC00' } });
  await answer();
  expect((await misread()).value).toBe('CC00');
  held = false;
  await act(async () => reads.splice(0).forEach((land) => land()));
  expect((await misread()).value).toBe('CC00');
  expect(await hostColour(api)).toBe('BB0002');
  // The save is over: the box is no longer marked as being saved, and what is in it is a draft like any other.
  fireEvent.keyDown(await misread(), { key: 'Escape' });
  expect((await misread()).value).toBe('BB0002');
  expect(screen.queryByText('Unsaved changes')).toBeNull();
});

// C6 (#3680): an emptied colour was sent as '', which the host refuses in either scope.
it('an emptied colour under Global sends nothing, by Enter or by Save', async () => {
  const api = createMockApi();
  const saved = vi.fn(api.saveSettings);
  api.saveSettings = saved;
  drawCompare(api);
  const box = await misread();
  fireEvent.change(box, { target: { value: '' } });
  pressEnter(box);
  fireEvent.blur(box);
  await act(async () => undefined);
  expect(saved).not.toHaveBeenCalled();
  expect((await misread()).getAttribute('aria-invalid')).toBe('true');
  expect(screen.queryByText('Unsaved changes')).toBeNull();
});

it("an emptied colour under This project clears the project's own colour", async () => {
  const api = createMockApi();
  await api.saveSettings('TranscriptCompare', 'project', { color_misread: 'AA0004' });
  const saved = vi.fn(api.saveSettings);
  api.saveSettings = saved;
  drawCompare(api);
  const inherited = (await misread()).value;
  fireEvent.click(screen.getByRole('button', { name: 'This project' }));
  await screen.findByDisplayValue('AA0004');
  fireEvent.change(await misread(), { target: { value: '' } });
  fireEvent.blur(await misread());
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
  await act(async () => undefined);
  expect(saved).toHaveBeenCalledExactlyOnceWith('TranscriptCompare', 'project', { color_misread: null });
  expect((await misread()).value).toBe(inherited);
  expect(screen.queryByText('Unsaved changes')).toBeNull();
});
