// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useManuscriptImport } from './ManuscriptImport';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { MockImportKind } from '../../api/mockImportPreview';
import type { Bootstrap, NarrationApi } from '../../types';

afterEach(cleanup);

// The hook as the Production home places it: the choose button, then the dialogs and the credits banner.
function ImportHarness(props: Parameters<typeof useManuscriptImport>[0]) {
  const { chooseButton, dialogs, creditsBanner } = useManuscriptImport(props);
  return (
    <>
      {chooseButton}
      {dialogs}
      {creditsBanner}
    </>
  );
}

// The import with the mock host, at the point the narrator has chosen a manuscript and the host has answered with its preview.
// `prepare` runs before the file is chosen, so a test can spy on the host's answers (the mock keeps its job in its own closure).
async function openReview(prepare: (api: NarrationApi) => void = () => {}, importPreview: MockImportKind = 'docx') {
  const api = createMockApi({}, { noManuscript: true, importPreview });
  prepare(api);
  const data: Bootstrap = await api.bootstrap();
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <ImportHarness data={data} go={() => {}} notify={() => {}} refreshBootstrap={async () => {}} />
      </ApiProvider>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Import manuscript' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Choose a file…' }));
  const dialog = await screen.findByRole('alertdialog', { name: /^Import Alice\./ });
  return { api, dialog: within(dialog) };
}

// The review is an accordion with the chapters open, so a test that works on the character suggestions opens that group (which closes the chapters).
const openSuggestions = (dialog: ReturnType<typeof within>) => fireEvent.click(dialog.getByRole('button', { name: /^Character suggestions/ }));

describe('the import review dialog, as the narrator meets it', () => {
  it('lists the chapters the importer found, each with its switch on, and states the size once, in the chips', async () => {
    const { dialog } = await openReview();
    expect(within(dialog.getByLabelText('What was found')).getByText('221 paragraphs')).toBeTruthy();
    expect(dialog.queryByText(/^DOCX · /)).toBeNull();
    const included = (name: RegExp) => dialog.getByRole('switch', { name }).getAttribute('aria-checked');
    for (const name of [/^Chapter One/, /^Chapter Two/, /^Chapter Three/, /^Chapter Four/, /^Chapter Five/]) expect(included(name)).toBe('true');
    // Front matter and reference sections are not listed: they stay as the importer sorted them.
    for (const title of ['Characters', 'Glossary', 'Front Matter']) expect(dialog.queryByRole('switch', { name: new RegExp(title) })).toBeNull();
    // The character suggestions are folded while every one is checked, so only the chapters are switches yet.
    expect(dialog.getAllByRole('switch')).toHaveLength(5);
    // The one select left is the delivery profile a first import of a project with none chosen also asks for; it is read after the dialog opens.
    await dialog.findByRole('combobox', { name: 'Delivery profile' });
    expect(dialog.getAllByRole('combobox')).toHaveLength(1);
  });

  it('shows the character suggestions as switches, all on, each with how often it appears', async () => {
    const { dialog } = await openReview();
    openSuggestions(dialog);
    for (const name of ['Alice', 'The White Rabbit', 'The Duchess'])
      expect(dialog.getByRole('switch', { name: new RegExp(`^${name}`) }).getAttribute('aria-checked')).toBe('true');
    expect(dialog.getByText('412 appearances')).toBeTruthy();
    expect(dialog.getByText('1 appearance')).toBeTruthy();
    expect(dialog.queryByText(/A curious girl who follows a White Rabbit/)).toBeNull();
  });

  it('commits the sections as they came when nothing was changed, and every suggestion by its id', async () => {
    let commit = vi.fn();
    const { dialog } = await openReview((api) => void (commit = vi.spyOn(api, 'manuscriptImportCommit')));
    fireEvent.click(dialog.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(commit).toHaveBeenCalled());
    expect(commit).toHaveBeenCalledWith('mock-import', {
      confirmedReset: false,
      selection: { sectionKinds: undefined, characterCandidateIds: ['candidate-section-0007-001', 'candidate-section-0007-002', 'candidate-section-0007-003'] },
    });
  });

  it('commits the subtitles as false for every chapter that has one when Subtitles is turned off, and nothing otherwise', async () => {
    let commit = vi.fn();
    const { dialog } = await openReview((api) => void (commit = vi.spyOn(api, 'manuscriptImportCommit')));
    fireEvent.click(dialog.getByRole('checkbox', { name: 'Subtitles' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(commit).toHaveBeenCalled());
    expect(commit.mock.calls[0]?.[1].selection?.subtitleOverrides).toEqual({ 'section-0001': false, 'section-0002': false, 'section-0004': false });
  });

  it('commits a chapter the narrator switched off as left out of the recording, and leaves the others out of the choices', async () => {
    let commit = vi.fn();
    const { dialog } = await openReview((api) => void (commit = vi.spyOn(api, 'manuscriptImportCommit')));
    fireEvent.click(dialog.getByRole('switch', { name: /^Chapter Three/ }));
    expect(dialog.getByRole('switch', { name: /^Chapter Three/ }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(dialog.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(commit).toHaveBeenCalled());
    expect(commit.mock.calls[0]?.[1].selection?.sectionKinds).toEqual({ 'section-0003': 'reference' });
  });

  it('commits only the suggestions that are still checked, as an explicit list', async () => {
    let commit = vi.fn();
    const { dialog } = await openReview((api) => void (commit = vi.spyOn(api, 'manuscriptImportCommit')));
    openSuggestions(dialog);
    fireEvent.click(dialog.getByRole('switch', { name: /^The White Rabbit/ }));
    expect(dialog.getByRole('switch', { name: /^The White Rabbit/ }).getAttribute('aria-checked')).toBe('false');
    expect(dialog.getByRole('switch', { name: /^Alice/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(dialog.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(commit).toHaveBeenCalled());
    expect(commit.mock.calls[0]?.[1].selection?.characterCandidateIds).toEqual(['candidate-section-0007-001', 'candidate-section-0007-003']);
  });

  it('checks a suggestion again after it was cleared', async () => {
    const { dialog } = await openReview();
    openSuggestions(dialog);
    const rabbit = () => dialog.getByRole('switch', { name: /^The White Rabbit/ });
    fireEvent.click(rabbit());
    fireEvent.click(rabbit());
    expect(rabbit().getAttribute('aria-checked')).toBe('true');
  });

  it('a Word file has no chapter heading level to choose', async () => {
    const { dialog } = await openReview();
    expect(dialog.queryByRole('combobox', { name: 'Markdown chapter heading level' })).toBeNull();
  });

  it('a Markdown file starts at H1, and another level reads the file again and drops the choices made for the old sections', async () => {
    let preview = vi.fn();
    let commit = vi.fn();
    const { dialog } = await openReview((api) => {
      preview = vi.spyOn(api, 'manuscriptImportPreview');
      commit = vi.spyOn(api, 'manuscriptImportCommit');
    }, 'markdown');
    const level = () => dialog.getByRole('combobox', { name: 'Markdown chapter heading level' }) as HTMLSelectElement;
    expect(level().value).toBe('1');
    expect(preview).toHaveBeenLastCalledWith('mock-import', { markdownHeadingLevel: 1 });

    fireEvent.click(dialog.getByRole('switch', { name: /^Chapter Three/ }));
    fireEvent.change(level(), { target: { value: '2' } });
    await waitFor(() => expect(preview).toHaveBeenLastCalledWith('mock-import', { markdownHeadingLevel: 2 }));
    await waitFor(() => expect(level().value).toBe('2'));
    expect(dialog.getByRole('switch', { name: /^Chapter Three/ }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(dialog.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(commit).toHaveBeenCalled());
    expect(commit.mock.calls[0]?.[1].selection?.sectionKinds).toBeUndefined();
  });

  it('replacing a manuscript says what is cleared, and the commit is confirmed as a reset', async () => {
    let commit = vi.fn();
    const { dialog } = await openReview((api) => {
      const preview = api.manuscriptImportPreview;
      api.manuscriptImportPreview = async (id, options) => ({ ...(await preview(id, options)), requiresReset: true });
      commit = vi.spyOn(api, 'manuscriptImportCommit');
    });
    expect(dialog.getByText(/This replaces the active manuscript and clears Story Bible/)).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Replace and reset' }));
    await waitFor(() => expect(commit).toHaveBeenCalled());
    expect(commit.mock.calls[0]?.[1].confirmedReset).toBe(true);
  });

  it('Replace manuscript names what it clears before the first confirm, whatever the host flag says (#1777)', async () => {
    const api = createMockApi({}, { importPreview: 'docx' });
    const commit = vi.spyOn(api, 'manuscriptImportCommit');
    const data: Bootstrap = await api.bootstrap();
    expect(data.manuscript).toBeTruthy();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <ImportHarness data={data} go={() => {}} notify={() => {}} refreshBootstrap={async () => {}} />
        </ApiProvider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Replace manuscript…' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a file…' }));
    const dialog = within(await screen.findByRole('alertdialog', { name: /^Import Alice\./ }));
    expect(dialog.getByText(/This replaces the active manuscript and clears Story Bible, notes, bookmarks, statuses/)).toBeTruthy();
    expect(dialog.queryByRole('button', { name: 'Import' })).toBeNull();
    fireEvent.click(dialog.getByRole('button', { name: 'Replace and reset' }));
    await waitFor(() => expect(commit).toHaveBeenCalled());
    expect(commit.mock.calls[0]?.[1].confirmedReset).toBe(true);
  });

  it('the mock host, like the real one, writes nothing on the first commit over an existing manuscript', async () => {
    const api = createMockApi({}, { importPreview: 'docx' });
    const { jobId } = await api.selectManuscript();
    await api.manuscriptImportPreview(jobId!, { markdownHeadingLevel: 1 });
    const first = await api.manuscriptImportCommit(jobId!, { confirmedReset: false });
    expect({ phase: first.phase, requiresReset: first.requiresReset }).toEqual({ phase: 'ready', requiresReset: true });
    expect((await api.manuscriptImportCommit(jobId!, { confirmedReset: true })).phase).toBe('success');
  });

  it('closing with the header X asks the host to drop the job and closes the dialog', async () => {
    let cancel = vi.fn();
    const { dialog } = await openReview((api) => void (cancel = vi.spyOn(api, 'manuscriptImportCancel')));
    expect(dialog.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(dialog.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(cancel).toHaveBeenCalledWith('mock-import');
  });
});

describe('the summary and the groups of the review', () => {
  it('counts what was found once, in the chips, and follows a chapter switched off', async () => {
    const { dialog } = await openReview();
    const chips = within(dialog.getByLabelText('What was found'));
    expect(chips.getByText('5 chapters')).toBeTruthy();
    expect(dialog.queryByText(/^DOCX · /)).toBeNull();
    fireEvent.click(dialog.getByRole('switch', { name: /^Chapter Three/ }));
    expect(chips.getByText('4 chapters')).toBeTruthy();
  });

  it('tells a replacement what it clears, and otherwise how to leave a chapter out', async () => {
    const { dialog } = await openReview();
    expect(dialog.getByText('Switch off any chapter to leave it out of the recording.')).toBeTruthy();
  });

  it('keeps the chapters folded when another Markdown heading level is read', async () => {
    const { dialog } = await openReview(() => {}, 'markdown');
    fireEvent.click(dialog.getByRole('button', { name: /^Chapters/ }));
    expect(dialog.queryByRole('switch', { name: /^Chapter Three/ })).toBeNull();
    fireEvent.change(dialog.getByRole('combobox', { name: 'Markdown chapter heading level' }), { target: { value: '2' } });
    await waitFor(() => expect((dialog.getByRole('combobox', { name: 'Markdown chapter heading level' }) as HTMLSelectElement).value).toBe('2'));
    expect(dialog.getByRole('button', { name: /^Chapters/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('starts the chapters from their default, with no earlier choices, when another file is chosen', async () => {
    const { dialog } = await openReview();
    fireEvent.click(dialog.getByRole('button', { name: /^Chapters/ }));
    fireEvent.click(dialog.getByRole('button', { name: /^Chapters/ }));
    fireEvent.click(dialog.getByRole('switch', { name: /^Chapter Three/ }));
    fireEvent.click(dialog.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Import manuscript' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a file…' }));
    const again = within(await screen.findByRole('alertdialog', { name: /^Import Alice\./ }));
    expect(again.getByRole('button', { name: /^Chapters 5 of 5 chapters included$/ }).getAttribute('aria-expanded')).toBe('true');
    expect(again.getByRole('switch', { name: /^Chapter Three/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('has no preview activity, and says what the importer repaired', async () => {
    const { dialog } = await openReview(() => {}, 'repaired');
    expect(dialog.queryByText('Preview activity')).toBeNull();
    expect(dialog.queryByRole('progressbar')).toBeNull();
    expect(within(dialog.getByLabelText('What was found')).getByText('2 repairs')).toBeTruthy();
    // The repairs are one accordion group, closed until opened (the chapters are the open one).
    fireEvent.click(dialog.getByRole('button', { name: /^Repairs/ }));
    expect(dialog.getByText(/CHAPTER TWOThe Pool of Tears/)).toBeTruthy();
  });
});

describe('the subtitle of each chapter in the review', () => {
  it('shows the subtitle of a chapter on a second line below its title, and no second line when the heading had none', async () => {
    const { dialog } = await openReview();
    // The subtitle is the muted line under the title; the word count under it is a muted line of its own.
    const row = (title: string) => dialog.getByRole('switch', { name: new RegExp(`^${title}`) }).closest('label')!;
    const second = (title: string) => row(title).querySelector('.block[class*="text-[0.8em]"]');
    expect(second('Chapter One')?.textContent).toBe('Down the Rabbit-Hole');
    expect(second('Chapter Two')?.textContent).toBe('The Pool of Tears');
    expect(second('Chapter Three')).toBeNull();
  });

  it('keeps the whole title and subtitle in the title attribute of the row, for a name cut short', async () => {
    const { dialog } = await openReview();
    const titled = (name: RegExp) => dialog.getByRole('switch', { name }).closest('label')!.querySelector('[title]')!.getAttribute('title');
    expect(titled(/^Chapter One/)).toBe('Chapter One: Down the Rabbit-Hole');
    expect(titled(/^Chapter Three/)).toBe('Chapter Three');
  });

  it('names the switch of a row for the subtitle too, so two chapters with one title can be told apart', async () => {
    const { dialog } = await openReview();
    expect(dialog.getByRole('switch', { name: /^Chapter Two.*The Pool of Tears/ })).toBeTruthy();
    expect(dialog.getByRole('switch', { name: /^Chapter Three/ })).toBeTruthy();
  });
});

describe('the "Set up the credits" prompt ', () => {
  async function renderImport(overrides: Partial<NarrationApi> = {}) {
    const api = createMockApi(overrides, { creditsSetup: true });
    const data: Bootstrap = await api.bootstrap();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <ImportHarness data={data} go={() => {}} notify={() => {}} refreshBootstrap={async () => {}} />
        </ApiProvider>
      </MemoryRouter>,
    );
    return { api };
  }

  it('shows the dialog on first load when the host reports it is needed', async () => {
    await renderImport();
    expect(await screen.findByRole('dialog', { name: 'Set up the credits' })).toBeTruthy();
  });

  it('does not show the dialog when the host reports nothing is needed (the default mock boot)', async () => {
    const api = createMockApi({}, {});
    const data: Bootstrap = await api.bootstrap();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <ImportHarness data={data} go={() => {}} notify={() => {}} refreshBootstrap={async () => {}} />
        </ApiProvider>
      </MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'Replace manuscript…' });
    expect(screen.queryByRole('dialog', { name: 'Set up the credits' })).toBeNull();
  });

  it('drops the dialog once Save answers "needed: false"', async () => {
    await renderImport();
    const dialog = within(await screen.findByRole('dialog', { name: 'Set up the credits' }));
    // Title and Author come prefilled from the mock's detected candidates; Narrator has none (no global default in
    // this seed), so it stays unresolved - and the dialog stays open - unless it is typed in.
    fireEvent.change(dialog.getByLabelText('Narrator'), { target: { value: 'Ada Finch' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Set up the credits' })).toBeNull());
  });

  it('drops the dialog once "Not now" dismisses it for the session', async () => {
    await renderImport();
    await screen.findByRole('dialog', { name: 'Set up the credits' });
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Set up the credits' })).toBeNull());
  });

  it('holds back while the manuscript-candidate offer is on screen, so the two dialogs never stack', async () => {
    const api = createMockApi({}, { creditsSetup: true, manuscriptCandidate: { path: '/tmp/book.docx', name: 'book.docx' } });
    const data: Bootstrap = await api.bootstrap();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <ImportHarness data={data} go={() => {}} notify={() => {}} refreshBootstrap={async () => {}} />
        </ApiProvider>
      </MemoryRouter>,
    );
    await screen.findByRole('alertdialog', { name: 'Import manuscript?' });
    expect(screen.queryByRole('dialog', { name: 'Set up the credits' })).toBeNull();
  });
});

describe('the credits-setup banner, the way back after Not now', () => {
  async function renderImportPastNotNow() {
    const api = createMockApi({}, { creditsSetup: true });
    const data: Bootstrap = await api.bootstrap();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <ImportHarness data={data} go={() => {}} notify={() => {}} refreshBootstrap={async () => {}} />
        </ApiProvider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Set up the credits' })).toBeNull());
    return { api };
  }

  it('appears once "Not now" leaves the tokens unresolved, naming them', async () => {
    await renderImportPastNotNow();
    expect(await screen.findByText(/The credits need 3 values/)).toBeTruthy();
    expect(screen.getByText(/Title, Author, Narrator will be read as written, in brackets\./)).toBeTruthy();
  });

  it('Fill in reopens the same dialog, and the banner steps aside while it is open', async () => {
    await renderImportPastNotNow();
    fireEvent.click(await screen.findByRole('button', { name: 'Fill in' }));
    expect(await screen.findByRole('dialog', { name: 'Set up the credits' })).toBeTruthy();
    expect(screen.queryByText(/The credits need 3 values/)).toBeNull();
  });

  it('"Don\'t ask for this project" on the banner removes it, without reopening the dialog', async () => {
    await renderImportPastNotNow();
    fireEvent.click(await screen.findByRole('button', { name: /^Don.t ask for this project$/ }));
    await waitFor(() => expect(screen.queryByText(/The credits need 3 values/)).toBeNull());
    expect(screen.queryByRole('dialog', { name: 'Set up the credits' })).toBeNull();
  });

  it('no banner on the default mock boot (setup already dismissed at the project scope)', async () => {
    const api = createMockApi({}, {});
    const data: Bootstrap = await api.bootstrap();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <ImportHarness data={data} go={() => {}} notify={() => {}} refreshBootstrap={async () => {}} />
        </ApiProvider>
      </MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'Replace manuscript…' });
    expect(screen.queryByText(/The credits need/)).toBeNull();
  });
});

describe('the delivery profile on the first import (SNM-4d)', () => {
  const profileField = (dialog: ReturnType<typeof within>) => dialog.queryByRole('combobox', { name: 'Delivery profile' }) as HTMLSelectElement | null;

  it('asks for it when the project has none chosen, offering ACX and Other / none', async () => {
    const { dialog } = await openReview();
    const field = await waitFor(() => {
      const found = profileField(dialog);
      expect(found).toBeTruthy();
      return found!;
    });
    expect(
      within(field)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['ACX', 'Other / none']);
    expect(field.value).toBeTruthy();
  });

  it('saves the choice once, after the import has been written', async () => {
    let select: ReturnType<typeof vi.spyOn> | undefined;
    const { api, dialog } = await openReview((host) => {
      select = vi.spyOn(host, 'deliverySelectProfile');
    });
    await waitFor(() => expect(profileField(dialog)).toBeTruthy());
    fireEvent.change(profileField(dialog)!, { target: { value: 'acx' } });
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(select).toHaveBeenCalledTimes(1));
    expect(select).toHaveBeenCalledWith('project', 'acx', expect.any(String));
    expect((await api.deliveryProfiles()).projectChoice?.id).toBe('acx');
  });

  it('says the host’s sentence when the save is refused, and the import stands', async () => {
    const notify = vi.fn();
    const api = createMockApi({}, { noManuscript: true, importPreview: 'docx' });
    vi.spyOn(api, 'deliverySelectProfile').mockRejectedValue(new Error('profile store is read-only'));
    const data = await api.bootstrap();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <ImportHarness data={data} go={() => {}} notify={notify} refreshBootstrap={async () => {}} />
        </ApiProvider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Import manuscript' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a file…' }));
    const dialog = within(await screen.findByRole('alertdialog', { name: /^Import Alice\./ }));
    await waitFor(() => expect(profileField(dialog)).toBeTruthy());
    fireEvent.click(dialog.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.stringContaining('profile store is read-only'), 'error'));
  });

  it('never asks on a replace', async () => {
    const api = createMockApi();
    const data = await api.bootstrap();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <ImportHarness data={data} go={() => {}} notify={() => {}} refreshBootstrap={async () => {}} />
        </ApiProvider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Replace manuscript…' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a file…' }));
    const dialog = within(await screen.findByRole('alertdialog', { name: /^Import Alice\./ }));
    expect(profileField(dialog)).toBeNull();
  });

  it('does not ask when the project already has a profile', async () => {
    const api = createMockApi({}, { noManuscript: true, importPreview: 'docx', deliveryProfile: 'custom' });
    const data = await api.bootstrap();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <ImportHarness data={data} go={() => {}} notify={() => {}} refreshBootstrap={async () => {}} />
        </ApiProvider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Import manuscript' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choose a file…' }));
    const dialog = within(await screen.findByRole('alertdialog', { name: /^Import Alice\./ }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(profileField(dialog)).toBeNull();
  });
});

describe('step 1: choose your manuscript (the Studio Next mock)', () => {
  async function openStep1(replacing = false, prepare: (api: NarrationApi) => void = () => {}) {
    const api = createMockApi({}, replacing ? { importPreview: 'docx' } : { noManuscript: true, importPreview: 'docx' });
    prepare(api);
    const data: Bootstrap = await api.bootstrap();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <ImportHarness data={data} go={() => {}} notify={() => {}} refreshBootstrap={async () => {}} />
        </ApiProvider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: replacing ? 'Replace manuscript…' : 'Import manuscript' }));
    return { api, dialog: await screen.findByRole('dialog', { name: replacing ? /^Replace manuscript · step 1 of 2/ : /^Import manuscript · step 1 of 2/ }) };
  }

  it('opens before anything else and says what it takes, with no note about the manuscript being read-only', async () => {
    const { api, dialog } = await openStep1();
    const select = vi.spyOn(api, 'selectManuscript');
    expect(within(dialog).getByRole('heading', { name: 'Choose your manuscript' })).toBeTruthy();
    expect(within(dialog).getByText('Use a .docx, .md or .txt file. A copy is kept in your project.')).toBeTruthy();
    expect(within(dialog).queryByText(/read-only/)).toBeNull();
    expect(within(dialog).getByText('Drop a manuscript here')).toBeTruthy();
    expect(select).not.toHaveBeenCalled();
  });

  it('the header X closes it, there is no Cancel, and nothing reaches the host', async () => {
    const { api, dialog } = await openStep1();
    const select = vi.spyOn(api, 'selectManuscript');
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /step 1 of 2/ })).toBeNull());
    expect(select).not.toHaveBeenCalled();
  });

  it('says it replaces the manuscript when there is one', async () => {
    const { dialog } = await openStep1(true);
    // The day as the Manuscript row behind the dialog writes it ("Jan 1, 2026", `calendarDay`), not a locale date such as 1/1/2026.
    expect(within(dialog).getByText(/^Replaces the manuscript imported [A-Z][a-z]{2} \d{1,2}, \d{4}\.$/)).toBeTruthy();
  });

  it('a dropped file with a path starts the same preview as Choose a file', async () => {
    const { api, dialog } = await openStep1();
    const begin = vi.spyOn(api, 'manuscriptBeginImport');
    const zone = within(dialog).getByText('Drop a manuscript here').closest('[data-drop-zone]')!;
    fireEvent.drop(zone, { dataTransfer: { files: [{ name: 'Alice.docx', path: 'C:/Books/Alice.docx' }] } });
    await waitFor(() => expect(begin).toHaveBeenCalledWith('C:/Books/Alice.docx'));
    expect(await screen.findByRole('alertdialog', { name: /^Import Alice\./ })).toBeTruthy();
  });

  it('marks the zone for the desktop host, which reads a file dropped on it itself', async () => {
    const { dialog } = await openStep1();
    expect(within(dialog).getByText('Drop a manuscript here').closest('[data-drop-zone]')?.hasAttribute('data-file-drop-target')).toBe(true);
  });

  it('a file the host began importing opens the review, and only while step 1 is open', async () => {
    let onDropped: Parameters<NarrationApi['subscribeManuscriptDropped']>[0] = () => {};
    let subscribed = 0;
    const { api } = await openStep1(false, (host) => {
      host.subscribeManuscriptDropped = (listener) => {
        onDropped = listener;
        subscribed++;
        return () => void subscribed--;
      };
    });
    expect(subscribed).toBe(1);
    const begin = vi.spyOn(api, 'manuscriptBeginImport');
    // The mock host keeps its one job in a closure; the real host began this one before it sent the event.
    const { jobId } = await api.selectManuscript();
    await act(async () => onDropped({ jobId: jobId!, name: 'Alice.docx' }));
    expect(await screen.findByRole('alertdialog', { name: /^Import Alice\./ })).toBeTruthy();
    expect(begin).not.toHaveBeenCalled();
    expect(subscribed).toBe(0);
  });

  it('a drop the host refused says why in the zone and keeps step 1 open', async () => {
    let onDropped: Parameters<NarrationApi['subscribeManuscriptDropped']>[0] = () => {};
    const { dialog } = await openStep1(false, (host) => {
      host.subscribeManuscriptDropped = (listener) => {
        onDropped = listener;
        return () => {};
      };
    });
    await act(async () => onDropped({ message: 'Drop one manuscript at a time.' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Drop one manuscript at a time.');
  });

  it('a dropped file whose location the window cannot read says so and starts nothing', async () => {
    const { api, dialog } = await openStep1();
    const begin = vi.spyOn(api, 'manuscriptBeginImport');
    const zone = within(dialog).getByText('Drop a manuscript here').closest('[data-drop-zone]')!;
    fireEvent.drop(zone, { dataTransfer: { files: [{ name: 'Alice.docx' }] } });
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Use Choose a file… instead.');
    expect(begin).not.toHaveBeenCalled();
  });
});

describe('step 2: check the chapter outline (the Studio Next mock)', () => {
  it('is named for the file and its step, and says what was found once, in pills above the options', async () => {
    const { dialog } = await openReview();
    expect(screen.getByRole('alertdialog', { name: 'Import Alice.docx · step 2 of 2' })).toBeTruthy();
    expect(dialog.queryByRole('heading', { name: 'Check the chapter outline' })).toBeNull();
    const pills = within(dialog.getByLabelText('What was found'));
    expect(pills.getByText(/^\d+ chapters?$/)).toBeTruthy();
    expect(pills.getByText(/^221 paragraphs$/)).toBeTruthy();
    expect(pills.getByText(/character suggestions?$/)).toBeTruthy();
  });

  it('Back drops the host job and returns to step 1, with nothing committed', async () => {
    const { api, dialog } = await openReview();
    const cancel = vi.spyOn(api, 'manuscriptImportCancel');
    const commit = vi.spyOn(api, 'manuscriptImportCommit');
    fireEvent.click(dialog.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('dialog', { name: /^Import manuscript · step 1 of 2/ })).toBeTruthy();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(commit).not.toHaveBeenCalled();
  });

  it('the confirm is Import, and Replace and reset when it replaces one', async () => {
    const { dialog } = await openReview();
    expect(dialog.getByRole('button', { name: 'Import' })).toBeTruthy();
  });
});

describe('closing the import when it finishes', () => {
  const checkbox = (dialog: ReturnType<typeof within>) => dialog.findByRole('checkbox', { name: 'Close when the import finishes' });

  it('is on by default, and closes the import once the manuscript is written', async () => {
    const { dialog } = await openReview();
    expect((await checkbox(dialog)).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(dialog.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Import manuscript' })).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('saves an unchecked box as an app setting, and then leaves the finished import on screen to read', async () => {
    let save = vi.fn();
    const { dialog } = await openReview((api) => void (save = vi.spyOn(api, 'saveSettings')));
    fireEvent.click(await checkbox(dialog));
    await waitFor(() => expect(save).toHaveBeenCalledWith('General', 'global', { close_import_when_done: 'false' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('dialog', { name: 'Import manuscript' })).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.getByRole('dialog', { name: 'Import manuscript' })).toBeTruthy();
  });

  it('starts unchecked when the saved setting is off', async () => {
    const { dialog } = await openReview((api) => void api.saveSettings('General', 'global', { close_import_when_done: 'false' }));
    await waitFor(async () => expect((await checkbox(dialog)).getAttribute('aria-checked')).toBe('false'));
  });
});

describe('the sample under the review', () => {
  it('writes the first chapter heading the way the list does: the title, then the subtitle on a muted line, with no dash', async () => {
    const { dialog } = await openReview();
    const sample = within(dialog.getByRole('region', { name: 'Preview of the selected heading' }));
    const heading = sample.getByRole('heading');
    expect(heading.textContent).toBe('Chapter One: Down the Rabbit-Hole');
    const subtitle = heading.querySelectorAll('span.block')[1];
    expect(subtitle!.textContent).toBe('Down the Rabbit-Hole');
    expect(subtitle!.className).toContain('text-[0.8em]');
    expect(subtitle!.className).toContain('text-[var(--text-muted)]');
  });

  it('keeps the word count of a chapter row to the right of its title, and lets a long title clip instead of running under the next column', async () => {
    const { dialog } = await openReview();
    const row = dialog.getByRole('switch', { name: /^Chapter One/ }).closest('label')!;
    const words = within(row).getByText(/ words?$/);
    const firstLine = words.parentElement!;
    expect(firstLine.textContent).toMatch(/^Chapter One/);
    expect(words.className).toContain('flex-none');
    const title = firstLine.firstElementChild!;
    expect(title.className).toContain('truncate');
    expect(title.className).toContain('min-w-0');
    // The label's text box can shrink below its content, which is what lets the clip happen inside the column.
    expect(row.querySelector(':scope > span.min-w-0')).not.toBeNull();
  });

  it('follows the pointer over another chapter', async () => {
    const { dialog } = await openReview();
    const sample = within(dialog.getByRole('region', { name: 'Preview of the selected heading' }));
    fireEvent.mouseEnter(dialog.getByRole('switch', { name: /^Chapter Two/ }).closest('div')!);
    expect(sample.getByRole('heading').textContent).toBe('Chapter Two: The Pool of Tears');
  });
});
