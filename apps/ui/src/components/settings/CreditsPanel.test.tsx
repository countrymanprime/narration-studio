// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CreditsPanel } from './CreditsPanel';

afterEach(cleanup);

function renderPanel() {
  const api = createMockApi();
  const notify = vi.fn();
  render(
    <ApiProvider api={api}>
      <CreditsPanel notify={notify} />
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Use suggestion' })[0]);
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
    const chapter = (await api.manuscriptChapters())[1];
    await screen.findByRole('combobox', { name: 'Sample starts in' });
    pick('Sample starts in', chapter.id);
    pick('Start line', '1');
    pick('Sample ends in', chapter.id);
    pick('End line', '3');
    fireEvent.click(screen.getByRole('button', { name: 'Save sample' }));
    expect(await screen.findByText(/Chapter 2 — The Pool of Tears, line 1 to Chapter 2 — The Pool of Tears, line 3/)).toBeTruthy();
    expect(screen.getByText(/adds no time to the estimate/)).toBeTruthy();
    expect((await api.creditsRetailSample()).sample).toMatchObject({ startLine: 1, endLine: 3 });
  });

  it('shows the refusal for a range over 5 minutes and keeps nothing', async () => {
    const { api } = renderPanel();
    const chapters = await api.manuscriptChapters();
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
    const chapter = (await plain.manuscriptChapters())[1];
    const [first, second] = chapter.paragraphIds ?? [];
    const api = createMockApi({}, { retailSample: { startParagraphId: first.id, endParagraphId: second.id } });
    render(
      <ApiProvider api={api}>
        <CreditsPanel notify={vi.fn()} />
      </ApiProvider>,
    );
    expect(await screen.findByText(/Chapter 2 — The Pool of Tears, line 1 to Chapter 2 — The Pool of Tears, line 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear sample' }));
    expect(await screen.findByText(/No retail sample picked/)).toBeTruthy();
    expect((await api.creditsRetailSample()).sample).toBeNull();
  });
});
