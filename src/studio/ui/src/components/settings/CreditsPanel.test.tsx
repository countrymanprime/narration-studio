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
    const chapter = withoutCredits(await api.manuscriptChapters())[1];
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
    const chapters = withoutCredits(await api.manuscriptChapters());
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
    const chapter = withoutCredits(await plain.manuscriptChapters())[1];
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
