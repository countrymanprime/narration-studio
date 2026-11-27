// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { expectHolderCleanAfterSave } from '../../studio/drafts/holderContract';
import { UnsavedDraftsProvider, useUnsavedDrafts } from '../../studio/drafts/unsavedDrafts';
import { withoutCredits } from '../../chapterKinds';
import { CreditsPanel } from './CreditsPanel';

afterEach(cleanup);

let registry: ReturnType<typeof useUnsavedDrafts>;
function RegistryProbe() {
  registry = useUnsavedDrafts();
  return null;
}

function renderPanel(overrides: Parameters<typeof createMockApi>[0] = {}) {
  const api = createMockApi(overrides);
  const notify = vi.fn();
  render(
    <ApiProvider api={api}>
      <UnsavedDraftsProvider>
        <RegistryProbe />
        <CreditsPanel notify={notify} />
      </UnsavedDraftsProvider>
    </ApiProvider>,
  );
  return { api, notify };
}

describe('CreditsPanel', () => {
  it('loads the shipped default templates into the picker, selecting the first one', async () => {
    renderPanel();
    const select = (await screen.findByRole('combobox', { name: 'Template' })) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBeGreaterThanOrEqual(3));
    expect(select.value).toBeTruthy();
  });

  it('names each template once: its kind is not added when the name already ends in it (#1777)', async () => {
    renderPanel();
    const select = (await screen.findByRole('combobox', { name: 'Template' })) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBeGreaterThanOrEqual(3));
    const labels = [...select.options].map((option) => option.textContent ?? '');
    expect(labels).toContain('ACX minimum (opening)');
    expect(labels.some((label) => /\(opening\) \(Opening\)/i.test(label))).toBe(false);
  });

  it('previews the selected template with an unresolved-token chip and count before any project value is set', async () => {
    renderPanel();
    expect(await screen.findByText(/unresolved token/)).toBeTruthy();
    expect(screen.getByText('[Title]')).toBeTruthy();
  });

  it('fills the preview and drops the unresolved count once matching project values are saved', async () => {
    renderPanel();
    await screen.findByText(/unresolved token/);
    const titleField = screen.getByLabelText('Title') as HTMLInputElement;
    fireEvent.change(titleField, { target: { value: 'Bad Ideas Look Great in Neon' } });
    fireEvent.blur(titleField);
    await waitFor(() => expect(screen.queryByText('[Title]')).toBeNull());
    expect(await screen.findByText(/Bad Ideas Look Great in Neon/)).toBeTruthy();
  });

  it('offers a source-captioned detected value for every empty field with a candidate, and accepting one saves it', async () => {
    renderPanel();
    const detected = await screen.findAllByText(/Detected from/);
    expect(detected.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Use this suggestion' })[0]);
    await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).not.toBe(''));
  });

  it('saves a new template only once its body or name changed, and adds it to the library', async () => {
    const { api } = renderPanel();
    await screen.findByRole('combobox', { name: 'Template' });
    const saveButton = screen.getByRole('button', { name: 'Save template' });
    expect(saveButton).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    const body = screen.getByLabelText('Body') as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: '[Title], read by [Narrator].' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(async () => expect((await api.creditsTemplates()).some((template) => template.body === '[Title], read by [Narrator].')).toBe(true));
  });

  // holder: settings/CreditsPanel.tsx
  it('a template edit renders clean once the registry has saved it (the holder contract)', async () => {
    const { api } = renderPanel();
    await screen.findByRole('combobox', { name: 'Template' });
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.change(screen.getByLabelText('Body') as HTMLTextAreaElement, { target: { value: '[Title], held by the registry.' } });
    expect(registry.heldNow().length).toBe(1);
    await expectHolderCleanAfterSave(() => registry.save());
    expect(registry.heldNow()).toEqual([]);
    expect((await api.creditsTemplates()).some((template) => template.body === '[Title], held by the registry.')).toBe(true);
  });

  // The editor and the template it is on, through the things that happen while a save runs and around the template picker (#3461, qa-breaker).
  const deferSave = (api: ReturnType<typeof createMockApi>) => {
    let release: () => void = () => {};
    const real = api.saveCreditsTemplate.bind(api);
    vi.spyOn(api, 'saveCreditsTemplate').mockImplementation(async (...args) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return real(...args);
    });
    return () => release();
  };
  const editTemplate = async () => {
    const select = (await screen.findByRole('combobox', { name: 'Template' })) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBeGreaterThanOrEqual(3));
    const body = screen.getByLabelText('Body') as HTMLTextAreaElement;
    return { select, body };
  };

  it('text typed while Save template is in flight stays in the editor as an edit still to save (#3461)', async () => {
    const { api } = renderPanel();
    const release = deferSave(api);
    const { body } = await editTemplate();
    fireEvent.change(body, { target: { value: 'First part.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    fireEvent.change(body, { target: { value: 'First part. And typed during the save.' } });
    release();
    await waitFor(async () => expect((await api.creditsTemplates()).some((template) => template.body === 'First part.')).toBe(true));
    await waitFor(() => expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('First part. And typed during the save.'));
    expect(registry.heldNow()).toHaveLength(1);
  });

  it('a save that ends after the narrator went to another template leaves them there, and the discarded text does not come back (#3461)', async () => {
    const { api } = renderPanel();
    const release = deferSave(api);
    const { select, body } = await editTemplate();
    act(() => registry.setShell({ ask: (run) => run(), go: () => {} }));
    const first = select.value;
    fireEvent.change(body, { target: { value: 'Typed, then discarded.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    const other = [...select.options].find((option) => option.value !== first)!.value;
    fireEvent.change(select, { target: { value: other } });
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement).value).toBe(other));
    release();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement).value).toBe(other);
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).not.toBe('Typed, then discarded.');
  });

  const otherOf = (select: HTMLSelectElement) => [...select.options].find((option) => option.value !== select.value)!.value;

  it('text typed on the template the narrator went to stays when the earlier save lands (#3461 A)', async () => {
    const { api } = renderPanel();
    const release = deferSave(api);
    const { select, body } = await editTemplate();
    act(() => registry.setShell({ ask: (run) => run(), go: () => {} }));
    fireEvent.change(body, { target: { value: 'Typed on the first.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    const other = otherOf(select);
    fireEvent.change(select, { target: { value: other } });
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement).value).toBe(other));
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Typed on the second.' } });
    release();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('Typed on the second.');
    expect(registry.heldNow()).toHaveLength(1);
  });

  it('Save & continue while a save runs saves what was typed after it started too (#3461 B)', async () => {
    const { api } = renderPanel();
    const real = api.saveCreditsTemplate.bind(api);
    const releases: Array<() => void> = [];
    const sent: string[] = [];
    vi.spyOn(api, 'saveCreditsTemplate').mockImplementation(async (...args) => {
      sent.push(args[3]);
      await new Promise<void>((resolve) => releases.push(resolve));
      return real(...args);
    });
    const { body } = await editTemplate();
    fireEvent.change(body, { target: { value: 'First part.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'First part. MORE' } });
    const outcome = registry.save();
    await waitFor(() => expect(releases).toHaveLength(1));
    releases[0]!();
    await waitFor(() => expect(releases).toHaveLength(2));
    releases[1]!();
    expect((await outcome).saved).toBe(true);
    expect(sent).toEqual(['First part.', 'First part. MORE']);
    expect(registry.heldNow()).toHaveLength(0);
  });

  it('a save the host never answers gives the editor back at the limit, with the text kept (#3461 G)', async () => {
    const { api } = renderPanel();
    vi.spyOn(api, 'saveCreditsTemplate').mockImplementation(() => new Promise(() => {}));
    const { select, body } = await editTemplate();
    fireEvent.change(body, { target: { value: 'Kept text.' } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
      await act(async () => {});
      expect(select.disabled).toBe(true);
      await act(async () => void vi.advanceTimersByTime(15_001));
      expect(select.disabled).toBe(false);
      expect(screen.getByRole('button', { name: 'New' })).toHaveProperty('disabled', false);
      expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('Kept text.');
      expect(registry.heldNow()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('an edit saved by the automatic second save is clean even when its list read fails (#3461 F, the browser sequence)', async () => {
    const { api } = renderPanel();
    const { body } = await editTemplate();
    fireEvent.change(body, { target: { value: 'First part.' } });
    const realList = api.creditsTemplates.bind(api);
    const lists: Array<{ ok: () => void; fail: () => void }> = [];
    vi.spyOn(api, 'creditsTemplates').mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          lists.push({ ok: () => void realList().then(resolve), fail: () => reject(new Error('list failed')) });
        }),
    );
    // save#1 answers at once; its list read (list#1) is still out when the narrator types.
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(lists).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'First part. MORE' } });
    // list#1 comes back: the editor is reset against it, and the automatic second save starts and answers at once.
    lists[0]!.ok();
    await waitFor(() => expect(lists).toHaveLength(2));
    // list#2 fails.
    lists[1]!.fail();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.getByRole('button', { name: 'Save template' })).toHaveProperty('disabled', true);
    expect(registry.heldNow()).toHaveLength(0);
  });

  it('a New template whose save answers after the limit takes its id, so Save again does not create a second one (#3461 G2)', async () => {
    const { api } = renderPanel();
    const real = api.saveCreditsTemplate.bind(api);
    let answer: () => void = () => {};
    const save = vi.spyOn(api, 'saveCreditsTemplate').mockImplementation(
      (...args) =>
        new Promise((resolve) => {
          answer = () => void real(...args).then(resolve);
        }),
    );
    await editTemplate();
    const before = (await api.creditsTemplates()).length;
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Brand new.' } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
      await act(async () => {});
      await act(async () => void vi.advanceTimersByTime(15_001));
    } finally {
      vi.useRealTimers();
    }
    answer();
    await waitFor(async () => expect((await api.creditsTemplates()).length).toBe(before + 1));
    // The picker names the new template by its id (an empty value would be the unselected draft, which a browser may fill with the first option).
    const created = (await api.creditsTemplates()).find((template) => template.body === 'Brand new.')!;
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement).value).toBe(created.id));
    await waitFor(() => expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('Brand new.'));
    expect(save).toHaveBeenCalledTimes(1);
    // Saving again writes to that template and does not add another.
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Brand new, changed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    answer();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0]).toBe(created.id);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await api.creditsTemplates()).length).toBe(before + 1);
  });

  // A New template whose first save went past the limit, with the answer still out: the editor is back, the text kept.
  const newTemplateSaveGivenUp = async (api: ReturnType<typeof createMockApi>, body: string) => {
    const real = api.saveCreditsTemplate.bind(api);
    const answers: Array<() => void> = [];
    const save = vi.spyOn(api, 'saveCreditsTemplate').mockImplementation(
      (...args) =>
        new Promise((resolve) => {
          answers.push(() => void real(...args).then(resolve));
        }),
    );
    await editTemplate();
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: body } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
      await act(async () => {});
      await act(async () => void vi.advanceTimersByTime(15_001));
    } finally {
      vi.useRealTimers();
    }
    return { save, answers };
  };

  // Round 11 (BR-A, BR-B, BR-C): a late answer's list read that is overtaken by a newer read is dropped, so it never puts a stale list back over what the narrator did since.
  const staleListRead = async (api: ReturnType<typeof createMockApi>, dropId?: { current: string }) => {
    const { answers, save } = await newTemplateSaveGivenUp(api, 'Brand new.');
    const real = api.creditsTemplates.bind(api);
    let release: () => void = () => {};
    let held = false;
    vi.spyOn(api, 'creditsTemplates').mockImplementation(() => {
      const snapshot = real();
      if (held) return snapshot;
      held = true;
      return new Promise((resolve) => {
        release = () => void snapshot.then((list) => resolve(dropId ? list.filter((template) => template.id !== dropId.current) : list));
      });
    });
    answers[0]!();
    save.mockRestore();
    await waitFor(() => expect(held).toBe(true));
    act(() => registry.setShell({ ask: (run) => run(), go: () => {} }));
    const select = screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement;
    return { select, release: () => release() };
  };
  const pickOther = async (select: HTMLSelectElement) => {
    const other = [...select.options].find((option) => option.value !== '' && option.value !== select.value)!;
    fireEvent.change(select, { target: { value: other.value } });
    await waitFor(() => expect(select.value).toBe(other.value));
    return other.value;
  };

  it("a late answer's list read that lands after a Duplicate does not drop the copy or the text typed on it (#3461 round 11 BR-A)", async () => {
    const { api } = renderPanel();
    const { select, release } = await staleListRead(api);
    await pickOther(select);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).not.toBe(''));
    await new Promise((resolve) => setTimeout(resolve, 100));
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Typed on the copy.' } });
    const optionsBefore = select.options.length;
    release();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(select.options.length).toBe(optionsBefore);
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('Typed on the copy.');
  });

  it('a list that lands without the selected template while text is typed keeps the text as a New draft (#3461 round 16 BR-M)', async () => {
    const { api } = renderPanel();
    const gone = { current: '' };
    const { select, release } = await staleListRead(api, gone);
    gone.current = await pickOther(select);
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Typed on a template that vanished.' } });
    release();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect([...select.options].some((option) => option.value === gone.current)).toBe(false);
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('Typed on a template that vanished.');
    expect(registry.heldNow()).toHaveLength(1);
  });

  it("a late answer's list read that lands after a Save does not put the old body back (#3461 round 11 BR-B)", async () => {
    const { api } = renderPanel();
    const { select, release } = await staleListRead(api);
    await pickOther(select);
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'EDITED T2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(async () => expect((await api.creditsTemplates()).some((template) => template.body === 'EDITED T2')).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('EDITED T2');
    expect(registry.heldNow()).toHaveLength(0);
  });

  it("a late answer's list read that lands after a Delete does not bring the template back (#3461 round 11 BR-C)", async () => {
    const { api } = renderPanel();
    const { select, release } = await staleListRead(api);
    const gone = await pickOther(select);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(async () => expect((await api.creditsTemplates()).some((template) => template.id === gone)).toBe(false));
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect([...select.options].some((option) => option.value === gone)).toBe(false);
  });

  it('a project values read that lands after a value was typed does not put the old value back (#3461 round 12 BR-E2)', async () => {
    const real = createMockApi();
    let calls = 0;
    let release: () => void = () => {};
    renderPanel({
      creditsProjectValues: () => {
        calls += 1;
        const snapshot = real.creditsProjectValues();
        if (calls === 1) return snapshot;
        // The read a Duplicate starts is the one that is slow.
        return new Promise((resolve) => {
          release = () => void snapshot.then(resolve);
        });
      },
      saveCreditsProjectValues: real.saveCreditsProjectValues,
    });
    await screen.findByRole('combobox', { name: 'Template' });
    await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(calls).toBe(2));
    const title = screen.getByLabelText('Title') as HTMLInputElement;
    fireEvent.change(title, { target: { value: 'Typed before the read landed' } });
    fireEvent.blur(title);
    await waitFor(async () => expect((await real.creditsProjectValues()).values.title).toBe('Typed before the read landed'));
    release();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Typed before the read landed');
  });

  it("a value typed before the project values arrive does not replace the host's other values (#3461 round 13 BR-F)", async () => {
    const real = createMockApi();
    await real.saveCreditsProjectValues({ title: 'Held Title', author: 'Held Author' });
    let release: () => void = () => {};
    const { api } = renderPanel({
      creditsProjectValues: () =>
        new Promise((resolve) => {
          release = () => void real.creditsProjectValues().then(resolve);
        }),
      saveCreditsProjectValues: real.saveCreditsProjectValues,
    });
    const save = vi.spyOn(api, 'saveCreditsProjectValues');
    const title = (await screen.findByLabelText('Title')) as HTMLInputElement;
    // The field waits for the read; a change that reaches it anyway sends nothing.
    expect(title.disabled).toBe(true);
    fireEvent.change(title, { target: { value: 'Typed too early' } });
    fireEvent.blur(title);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(save).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect((screen.getByLabelText('Author') as HTMLInputElement).value).toBe('Held Author'));
    expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(false);
    expect((await real.creditsProjectValues()).values.author).toBe('Held Author');
  });

  it('a template with no text cannot be saved, and the question offers only Keep editing and Discard (#3461 narrator smoke, finding 1)', async () => {
    renderPanel();
    const { body } = await editTemplate();
    fireEvent.change(body, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Save template' })).toHaveProperty('disabled', true);
    expect(registry.heldNow()).toEqual([expect.objectContaining({ saveable: false, needs: 'some text' })]);
    fireEvent.change(body, { target: { value: 'Some text again.' } });
    expect(screen.getByRole('button', { name: 'Save template' })).toHaveProperty('disabled', false);
    expect(registry.heldNow()[0]).toEqual(expect.objectContaining({ saveable: true }));
  });

  it('the project values show that they are being read until the first read lands (#3461 narrator smoke, finding 3)', async () => {
    const real = createMockApi();
    let release: () => void = () => {};
    renderPanel({
      creditsProjectValues: () =>
        new Promise((resolve) => {
          release = () => void real.creditsProjectValues().then(resolve);
        }),
    });
    expect(await screen.findByText(/Reading this project.s values/)).toBeTruthy();
    expect(screen.getByLabelText('Title').closest('[aria-busy]')!.getAttribute('aria-busy')).toBe('true');
    release();
    await waitFor(() => expect(screen.queryByText(/Reading this project.s values/)).toBeNull());
    expect(screen.getByLabelText('Title').closest('[aria-busy]')!.getAttribute('aria-busy')).toBe('false');
  });

  it('the template editor is off, dimmed and says so until the first list of templates lands, so text typed before it is not lost (#3461 round 14 BR-I)', async () => {
    const real = createMockApi();
    let release: () => void = () => {};
    renderPanel({
      creditsTemplates: () =>
        new Promise((resolve) => {
          release = () => void real.creditsTemplates().then(resolve);
        }),
    });
    expect(await screen.findByText(/Reading the templates/)).toBeTruthy();
    for (const label of ['Name', 'Body']) expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'New' })).toHaveProperty('disabled', true);
    release();
    await waitFor(() => expect((screen.getByLabelText('Body') as HTMLTextAreaElement).disabled).toBe(false));
    expect(screen.queryByText(/Reading the templates/)).toBeNull();
  });

  it('a body cleared while a save runs is not sent by the automatic second save (#3461 round 14 BR-H)', async () => {
    const { api } = renderPanel();
    const release = deferSave(api);
    const save = vi.mocked(api.saveCreditsTemplate);
    const { body } = await editTemplate();
    fireEvent.change(body, { target: { value: 'First part.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    fireEvent.change(body, { target: { value: ' \u00A0\n' } });
    release();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(save).toHaveBeenCalledTimes(1);
    expect(registry.heldNow()).toEqual([expect.objectContaining({ saveable: false, needs: 'some text' })]);
  });

  it('a body of only U+0085 is blank to the host, so Save stays off (#3461 round 14 BR-J)', async () => {
    renderPanel();
    const { body } = await editTemplate();
    fireEvent.change(body, { target: { value: '\u0085' } });
    expect(screen.getByRole('button', { name: 'Save template' })).toHaveProperty('disabled', true);
    expect(registry.heldNow()).toEqual([expect.objectContaining({ saveable: false, needs: 'some text' })]);
  });

  it('a project values read that fails says so with a Retry that reads them again and turns the fields on (#3461 round 14 BR-F2)', async () => {
    const real = createMockApi();
    let reads = 0;
    const { notify } = renderPanel({
      creditsProjectValues: () => {
        reads += 1;
        return reads === 1 ? Promise.reject(new Error('The host could not read them.')) : real.creditsProjectValues();
      },
    });
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('The project values could not be read'), 'error', expect.anything()));
    expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('The values could not be read.')).toBeTruthy();
    const retry = notify.mock.calls.find((call) => String(call[0]).includes('project values could not be read'))![2] as { onAction: () => void };
    await act(async () => retry.onAction());
    await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(false));
    expect(reads).toBe(2);
  });

  it('the editor is off while a Duplicate is out, so text typed meanwhile is not lost when it moves to the copy (#3461 round 15 BR-L)', async () => {
    const { api } = renderPanel();
    const { select } = await editTemplate();
    const real = api.creditsTemplates.bind(api);
    let release: () => void = () => {};
    vi.spyOn(api, 'creditsTemplates').mockImplementation(() => {
      const snapshot = real();
      return new Promise((resolve) => {
        release = () => void snapshot.then(resolve);
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect((screen.getByLabelText('Body') as HTMLTextAreaElement).disabled).toBe(true));
    expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(true);
    expect(select.disabled).toBe(true);
    await waitFor(() => expect(release).not.toBe(undefined));
    release();
    await waitFor(() => expect((screen.getByLabelText('Body') as HTMLTextAreaElement).disabled).toBe(false));
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toMatch(/copy|\(/i);
  });

  // The Name field is an input with no direction of its own, so it draws "<Arabic> copy" with the Arabic run first and "copy" to its right. A first-strong isolate in the toast would put "copy" on the other side (#4129).
  it('the Duplicate toast names the copy left to right, as the Name field draws it, so the added word stays on the same side (#4129)', async () => {
    const { api, notify } = renderPanel();
    await editTemplate();
    const real = api.duplicateCreditsTemplate.bind(api);
    const arabic = 'افتتاحية الكتاب';
    vi.spyOn(api, 'duplicateCreditsTemplate').mockImplementation(async (id) => ({ ...(await real(id)), name: `${arabic} copy` }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(`Duplicated as "⁦${arabic} copy⁩".`));
  });

  it('a template list that fails to read says so with a Retry, in the notice and beside the hint, and the editor returns when a read lands (#3461 round 15 BR-K1)', async () => {
    let reads = 0;
    const real = createMockApi();
    const { notify } = renderPanel({
      creditsTemplates: () => {
        reads += 1;
        return reads === 1 ? Promise.reject(new Error('The host could not list them.')) : real.creditsTemplates();
      },
    });
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('The templates could not be read'), 'error', expect.anything()));
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.getByText('The templates could not be read.')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]!);
    await waitFor(() => expect((screen.getByLabelText('Body') as HTMLTextAreaElement).disabled).toBe(false));
    expect(reads).toBe(2);
    expect((screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement).options.length).toBeGreaterThanOrEqual(3);
  });

  it('a failed values read keeps a Retry beside the hint after the notice is gone (#3461 round 15 BR-K2)', async () => {
    const real = createMockApi();
    let reads = 0;
    renderPanel({
      creditsProjectValues: () => {
        reads += 1;
        return reads === 1 ? Promise.reject(new Error('no')) : real.creditsProjectValues();
      },
    });
    expect(await screen.findByText('The values could not be read.')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]!);
    await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(false));
  });

  it('a Retry after a Delete whose list read failed does not blank text typed since, and the editor leaves the deleted template at once (#3461 round 16 BR-M)', async () => {
    const real = createMockApi();
    let failNext = false;
    const { api, notify } = renderPanel({
      creditsTemplates: () => {
        if (failNext) {
          failNext = false;
          return Promise.reject(new Error('The host could not list them.'));
        }
        return real.creditsTemplates();
      },
      deleteCreditsTemplate: real.deleteCreditsTemplate,
    });
    const { select } = await editTemplate();
    const deleted = select.value;
    failNext = true;
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('The templates could not be read'), 'error', expect.anything()));
    // The editor and the picker are already on another template, and the deleted one is gone from the picker.
    expect(select.value).not.toBe(deleted);
    expect([...select.options].some((option) => option.value === deleted)).toBe(false);
    const body = screen.getByLabelText('Body') as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: 'Typed after the delete.' } });
    const retry = notify.mock.calls.find((call) => String(call[0]).includes('templates could not be read'))![2] as { onAction: () => void };
    await act(async () => retry.onAction());
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('Typed after the delete.');
    expect([...select.options].some((option) => option.value === deleted)).toBe(false);
    expect((await api.creditsTemplates()).some((template) => template.id === deleted)).toBe(false);
  });

  it('a late answer for a New template that was discarded does not take over the next New editor (#3461 B1)', async () => {
    const { api } = renderPanel();
    act(() => registry.setShell({ ask: (run) => run(), go: () => {} }));
    const { answers } = await newTemplateSaveGivenUp(api, 'First new.');
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'second new' } });
    answers[0]!();
    await waitFor(async () => expect((await api.creditsTemplates()).some((template) => template.body === 'First new.')).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('second new');
    expect((screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement).value).not.toBe(
      (await api.creditsTemplates()).find((template) => template.body === 'First new.')!.id,
    );
  });

  it('text typed on a New template after its save went past the limit survives the late answer (#3461 round 7 N1)', async () => {
    const { api } = renderPanel();
    const { answers } = await newTemplateSaveGivenUp(api, 'new one');
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'new one PLUS MORE' } });
    answers[0]!();
    await waitFor(async () => expect((await api.creditsTemplates()).some((template) => template.body === 'new one')).toBe(true));
    const created = (await api.creditsTemplates()).find((template) => template.body === 'new one')!;
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement).value).toBe(created.id));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('new one PLUS MORE');
    expect(screen.getByRole('button', { name: 'Save template' })).toHaveProperty('disabled', false);
    expect(registry.heldNow()).toHaveLength(1);
  });

  it('a late New-template answer whose list read is slow does not take the editor after the narrator moved on (#3461 round 7 BR1)', async () => {
    const { api } = renderPanel();
    act(() => registry.setShell({ ask: (run) => run(), go: () => {} }));
    const { answers } = await newTemplateSaveGivenUp(api, 'First new.');
    // The list read that follows the late answer is held.
    const real = api.creditsTemplates.bind(api);
    let release: () => void = () => {};
    vi.spyOn(api, 'creditsTemplates').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => void real().then(resolve);
        }),
    );
    answers[0]!();
    await waitFor(() => expect(api.creditsTemplates).toHaveBeenCalled());
    // Inside that read the narrator picks another template (Discard) and types in it.
    const select = screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement;
    const other = [...select.options].find((option) => option.value !== '' && option.value !== select.value)!.value;
    fireEvent.change(select, { target: { value: other } });
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement).value).toBe(other));
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'typed on the other template' } });
    release();
    await new Promise((resolve) => setTimeout(resolve, 150));
    // The read ended: the editor is still on the other template with its text, and the picker did not move to the template that was created.
    expect((screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement).value).toBe(other);
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('typed on the other template');
  });

  it('Save during the list read after a late answer does not create twice (#3461 round 9 C-1)', async () => {
    const { api } = renderPanel();
    const { save, answers } = await newTemplateSaveGivenUp(api, 'Only once, even now.');
    const before = (await api.creditsTemplates()).length;
    const real = api.creditsTemplates.bind(api);
    let release: () => void = () => {};
    vi.spyOn(api, 'creditsTemplates').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => void real().then(resolve);
        }),
    );
    answers[0]!();
    await waitFor(() => expect(api.creditsTemplates).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await real()).filter((template) => template.body === 'Only once, even now.')).toHaveLength(1);
    expect((await real()).length).toBe(before + 1);
  });

  it('a failed list read after a late answer says so, and the next Save writes to the created template, not a new one (#3461 round 9 C-2)', async () => {
    const { api, notify } = renderPanel();
    const { save, answers } = await newTemplateSaveGivenUp(api, 'Created late.');
    const real = api.creditsTemplates.bind(api);
    vi.spyOn(api, 'creditsTemplates').mockRejectedValueOnce(new Error('The host could not list them.'));
    answers[0]!();
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.stringContaining('The templates could not be read: The host could not list them.'),
        'error',
        expect.anything(),
      ),
    );
    const created = (await real()).find((template) => template.body === 'Created late.')!;
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Created late, then changed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0]).toBe(created.id);
  });

  it('Retry on the templates-not-read notice only refreshes the list: a New draft started meanwhile keeps its text (#3461 round 10 C-3)', async () => {
    const { api, notify } = renderPanel();
    act(() => registry.setShell({ ask: (run) => run(), go: () => {} }));
    const { answers } = await newTemplateSaveGivenUp(api, 'Created late.');
    vi.spyOn(api, 'creditsTemplates').mockRejectedValueOnce(new Error('The host could not list them.'));
    answers[0]!();
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('The templates could not be read'), 'error', expect.anything()));
    // A second New draft, with text typed in it, and then Retry.
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'second draft text' } });
    const retry = notify.mock.calls.find((call) => String(call[0]).includes('could not be read'))![2] as { onAction: () => void };
    retry.onAction();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('second draft text');
  });

  it('a save answered in time whose list read then fails: the next Save writes to the created template (#3461 round 10 C-4)', async () => {
    const { api } = renderPanel();
    await editTemplate();
    const save = vi.spyOn(api, 'saveCreditsTemplate');
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Created at once.' } });
    vi.spyOn(api, 'creditsTemplates').mockRejectedValue(new Error('The host could not list them.'));
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 150));
    vi.mocked(api.creditsTemplates).mockRestore();
    const created = (await api.creditsTemplates()).find((template) => template.body === 'Created at once.')!;
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'Created at once, then changed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0]).toBe(created.id);
  });

  it('a late answer whose list read never answers releases the draft after the limit (#3461 round 10 C-5)', async () => {
    const { api } = renderPanel();
    const { save, answers } = await newTemplateSaveGivenUp(api, 'Late and unread.');
    vi.spyOn(api, 'creditsTemplates').mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      answers[0]!();
      await act(async () => {});
      await act(async () => void vi.advanceTimersByTime(15_001));
    } finally {
      vi.useRealTimers();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  });

  it('Save again before the first answer of a New template lands creates no second template (#3461 B2)', async () => {
    const { api } = renderPanel();
    const { save, answers } = await newTemplateSaveGivenUp(api, 'Only once.');
    const before = (await api.creditsTemplates()).length;
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(save).toHaveBeenCalledTimes(1);
    answers[0]!();
    await waitFor(async () => expect((await api.creditsTemplates()).length).toBe(before + 1));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await api.creditsTemplates()).filter((template) => template.body === 'Only once.')).toHaveLength(1);
  });

  it('a pick between the save landing and the list being read again still asks (#3461 B2)', async () => {
    const { api } = renderPanel();
    const release = deferSave(api);
    const { select, body } = await editTemplate();
    const asked: Array<() => void> = [];
    act(() => registry.setShell({ ask: (run) => void asked.push(run), go: () => {} }));
    fireEvent.change(body, { target: { value: 'First part.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'First part. MORE' } });
    const real = api.creditsTemplates.bind(api);
    let listed: () => void = () => {};
    vi.spyOn(api, 'creditsTemplates').mockImplementation(async () => {
      await new Promise<void>((resolve) => (listed = resolve));
      return real();
    });
    release();
    await waitFor(() => expect(vi.mocked(api.creditsTemplates)).toHaveBeenCalled());
    expect(registry.heldNow()).toHaveLength(1);
    fireEvent.change(select, { target: { value: otherOf(select) } });
    expect(asked).toHaveLength(1);
    listed();
  });

  it('a list that cannot be read after a save leaves the typed text held, and another template does not show it (#3461 C)', async () => {
    const { api } = renderPanel();
    const release = deferSave(api);
    const { select, body } = await editTemplate();
    act(() => registry.setShell({ ask: (run) => run(), go: () => {} }));
    fireEvent.change(body, { target: { value: 'First part.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: 'First part. MORE' } });
    vi.spyOn(api, 'creditsTemplates').mockRejectedValue(new Error('list failed'));
    release();
    await waitFor(() => expect(vi.mocked(api.creditsTemplates)).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(registry.heldNow()).toHaveLength(1);
    const other = otherOf(select);
    vi.mocked(api.creditsTemplates).mockRestore();
    fireEvent.change(select, { target: { value: other } });
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement).value).toBe(other));
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).not.toContain('MORE');
  });

  it('a New template whose text was typed and deleted holds nothing (#3461)', async () => {
    renderPanel();
    await editTemplate();
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    const body = screen.getByLabelText('Body') as HTMLTextAreaElement;
    await waitFor(() => expect(registry.heldNow()).toHaveLength(0));
    fireEvent.change(body, { target: { value: 'typed' } });
    expect(registry.heldNow()).toHaveLength(1);
    fireEvent.change(body, { target: { value: '' } });
    expect(registry.heldNow()).toHaveLength(0);
  });

  it('another template asks over a held edit, Cancel keeps the text, and answering goes there (#3461)', async () => {
    renderPanel();
    const { select, body } = await editTemplate();
    const asked: Array<() => void> = [];
    act(() => registry.setShell({ ask: (run) => (registry.heldNow().length > 0 ? void asked.push(run) : run()), go: () => {} }));
    const first = select.value;
    fireEvent.change(body, { target: { value: 'Typed but not saved.' } });
    const other = [...select.options].find((option) => option.value !== first)!.value;
    fireEvent.change(select, { target: { value: other } });
    expect(asked).toHaveLength(1);
    expect((screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement).value).toBe(first);
    expect((screen.getByLabelText('Body') as HTMLTextAreaElement).value).toBe('Typed but not saved.');
    act(() => asked[0]!());
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Template' }) as HTMLSelectElement).value).toBe(other));
  });

  it('offers the chapter announcement kind and previews it for the first chapter, filling [Chapter] and [Chapter Title]', async () => {
    const { api } = renderPanel();
    await screen.findByRole('combobox', { name: 'Template' });
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Kind' }), { target: { value: 'chapter_announcement' } });
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: '[Chapter]{: [Chapter Title]}.' } });
    expect(await screen.findByText('Chapter 1: Down the Rabbit-Hole.')).toBeTruthy();
    expect(screen.getByText(/Shown for Chapter 1, one of 12 chapters/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(async () => expect((await api.creditsTemplates()).some((template) => template.kind === 'chapter_announcement')).toBe(true));
  });
});

describe('Clear credits', () => {
  const setTitle = async (value: string) => {
    await screen.findByText(/unresolved token/);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value } });
    await waitFor(() => expect(screen.queryByText('[Title]')).toBeNull());
  };

  it('is off while the project has no credit value saved', async () => {
    renderPanel();
    await screen.findByText(/unresolved token/);
    expect(screen.getByRole('button', { name: 'Clear credits' })).toHaveProperty('disabled', true);
  });

  it('asks first, naming what it removes and what stays, and Cancel keeps the values', async () => {
    const { api } = renderPanel();
    await setTitle('Alice in Wonderland');
    fireEvent.click(screen.getByRole('button', { name: 'Clear credits' }));
    const dialog = await screen.findByRole('alertdialog', { name: "Clear this project's credits?" });
    expect(dialog.textContent).toMatch(/Title, Subtitle, Author, Series, Book number, Copyright, Year, Copyright holder, Publisher and the Narrator override/);
    expect(dialog.textContent).toMatch(/templates in your library stay/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect((await api.creditsProjectValues()).values.title).toBe('Alice in Wonderland');
  });

  it("clears every one of the project's credit values once confirmed, and the preview asks for them again", async () => {
    const { api, notify } = renderPanel();
    await setTitle('Alice in Wonderland');
    fireEvent.click(screen.getByRole('button', { name: 'Clear credits' }));
    const dialog = await screen.findByRole('alertdialog', { name: "Clear this project's credits?" });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear credits' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('');
    expect(await screen.findByText('[Title]')).toBeTruthy();
    expect(Object.values((await api.creditsProjectValues()).values).filter(Boolean)).toEqual([]);
    expect(notify).toHaveBeenCalledWith('Credits cleared for this project.');
    expect(screen.getByRole('button', { name: 'Clear credits' })).toHaveProperty('disabled', true);
  });
});

describe('Retail sample', () => {
  const pick = (name: string, value: string) => fireEvent.change(screen.getByRole('combobox', { name }), { target: { value } });

  it('saves the range the narrator picks and shows its length, as a marker that adds no time', async () => {
    const { api } = renderPanel();
    const chapter = withoutCredits((await api.manuscriptChapters()).chapters)[1];
    await screen.findByRole('combobox', { name: 'Sample starts in' });
    pick('Sample starts in', chapter.id);
    pick('Start line', '1');
    pick('Sample ends in', chapter.id);
    pick('End line', '3');
    fireEvent.click(screen.getByRole('button', { name: 'Save sample' }));
    // One chapter is named once (alignment audit R3SE2-7).
    expect(await screen.findByText(/^Chapter 2: The Pool of Tears, lines 1 to 3 \(\d[\d,]* words, about /)).toBeTruthy();
    expect(screen.getByText(/adds no time to the estimate/)).toBeTruthy();
    expect((await api.creditsRetailSample()).sample).toMatchObject({ startLine: 1, endLine: 3 });
  });

  it("offers only the book's own chapters to start and end in, never the credits", async () => {
    renderPanel();
    const starts = await screen.findByRole('combobox', { name: 'Sample starts in' });
    const options = [...starts.querySelectorAll('option')].map((option) => option.value);
    expect(options.length).toBeGreaterThan(0);
    expect(options.some((id) => id.startsWith('credits-'))).toBe(false);
  });

  it('shows the refusal for a range over 5 minutes and keeps nothing', async () => {
    const { api } = renderPanel();
    const chapters = withoutCredits((await api.manuscriptChapters()).chapters);
    await screen.findByRole('combobox', { name: 'Sample starts in' });
    pick('Sample starts in', chapters[0].id);
    pick('Start line', '1');
    pick('Sample ends in', chapters[11].id);
    pick('End line', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Save sample' }));
    expect(await screen.findByText(/at most 5 minutes/)).toBeTruthy();
    expect((await api.creditsRetailSample()).sample).toBeNull();
  });

  it('clears a saved sample', async () => {
    const plain = createMockApi();
    const chapter = withoutCredits((await plain.manuscriptChapters()).chapters)[1];
    const [first, second] = chapter.paragraphIds ?? [];
    const api = createMockApi({}, { retailSample: { startParagraphId: first.id, endParagraphId: second.id } });
    render(
      <ApiProvider api={api}>
        <CreditsPanel notify={vi.fn()} />
      </ApiProvider>,
    );
    expect(await screen.findByText(/^Chapter 2: The Pool of Tears, lines 1 to 2 \(/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear sample' }));
    expect(await screen.findByText(/No retail sample picked/)).toBeTruthy();
    expect((await api.creditsRetailSample()).sample).toBeNull();
  });
});

// Alignment audit (XSE2-11, XSE2-5, R3SE2-6, R3SE2-9): the editor's sections are set apart, the short fields pair up, a chapter select
// takes its row, a template named like its kind is not labelled twice, and Use suggestion never wraps.
describe('CreditsPanel layout', () => {
  it('sets each section apart with a rule and a heading above the field labels', async () => {
    renderPanel();
    const heading = await screen.findByRole('heading', { level: 3, name: 'Project values' });
    expect(heading.className).toContain('text-[0.9375rem]');
    expect(heading.closest('section')!.className).toContain('border-t');
  });

  it('pairs the short project values on one line once there is room', async () => {
    renderPanel();
    const title = await screen.findByRole('textbox', { name: 'Title' });
    expect(title.closest('[class*="@lg:grid-cols-2"]')).toBeTruthy();
  });

  it('gives each chapter select the row and its line a short field beside it', async () => {
    renderPanel();
    const start = await screen.findByRole('combobox', { name: 'Sample starts in' });
    expect(start.closest('[class*="grid-cols-[minmax(0,1fr)_6rem]"]')).toBeTruthy();
  });

  it('does not repeat the kind after a template named like it', async () => {
    const plain = createMockApi();
    const api = createMockApi({
      creditsTemplates: async () => [
        ...(await plain.creditsTemplates()),
        { id: 'announce', name: 'Chapter announcement', kind: 'chapter_announcement', body: '[Chapter]', builtIn: false },
      ],
    });
    render(
      <ApiProvider api={api}>
        <CreditsPanel notify={vi.fn()} />
      </ApiProvider>,
    );
    const picker = await screen.findByRole('combobox', { name: 'Template' });
    await waitFor(() => expect([...picker.querySelectorAll('option')].map((option) => option.textContent)).toContain('Chapter announcement'));
    expect([...picker.querySelectorAll('option')].map((option) => option.textContent)).not.toContain('Chapter announcement (Chapter announcement)');
  });
});

// Issue #1845: a failed save is an error toast with Retry where repeating it is safe. Each of these writes the same values again.
describe('CreditsPanel failed saves offer Retry', () => {
  const retryOf = (notify: ReturnType<typeof vi.fn>) => notify.mock.calls.find((call) => call[1] === 'error')?.[2] as { label: string; onAction: () => void };

  it('Retry on a failed template save saves the same template again', async () => {
    const base = createMockApi();
    let refuse = true;
    const saveCreditsTemplate = vi.fn(async (...args: Parameters<typeof base.saveCreditsTemplate>) => {
      if (refuse) throw new Error('The host refused it.');
      return base.saveCreditsTemplate(...args);
    });
    const { notify } = renderPanel({ saveCreditsTemplate });
    await screen.findByRole('combobox', { name: 'Template' });
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.change(screen.getByLabelText('Body'), { target: { value: '[Title], read by [Narrator].' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(retryOf(notify)?.label).toBe('Retry'));
    refuse = false;
    retryOf(notify).onAction();
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Credit template saved.'));
    expect(saveCreditsTemplate.mock.calls[1]).toEqual(saveCreditsTemplate.mock.calls[0]);
  });

  it('Retry on a failed value save saves that value again', async () => {
    const base = createMockApi();
    let refuse = true;
    const saveCreditsProjectValues = vi.fn(async (...args: Parameters<typeof base.saveCreditsProjectValues>) => {
      if (refuse) throw new Error('The host refused it.');
      return base.saveCreditsProjectValues(...args);
    });
    const { notify } = renderPanel({ saveCreditsProjectValues });
    await screen.findByText(/unresolved token/);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Alice in Wonderland' } });
    await waitFor(() => expect(retryOf(notify)?.label).toBe('Retry'));
    refuse = false;
    retryOf(notify).onAction();
    await waitFor(() => expect(saveCreditsProjectValues).toHaveBeenCalledTimes(2));
    expect(saveCreditsProjectValues.mock.calls[1]).toEqual(saveCreditsProjectValues.mock.calls[0]);
  });
});
