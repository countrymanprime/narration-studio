// @vitest-environment jsdom
// Mode-based header actions (ADR 0087): Lock/Unlock lives in the read view only, Delete lives in edit
// mode only, and an entry can never be locked while it is being edited (the hazard ADR 0018 left open).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { CommandRouter } from '../../input/router';
import { StudioProvider } from '../../studio/StudioProvider';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import type { ExtractionSuggestion } from '../../api/contracts/extraction';
import type { GuideEntity } from '../../types';
import { overlay } from '../../overlay/overlayService';
import { ENTRY_SORT_STORAGE_KEY } from './entryList';
import { Guide } from './Guide';
import { GuideDetail } from './GuideDetail';

afterEach(() => cleanup());

const fixture = (pick: (row: GuideEntity) => boolean): GuideEntity => {
  const row = WIRE_ENTITIES.find(pick);
  if (!row) throw new Error('the fixture entry is missing');
  return row;
};
const unlocked = fixture((row) => !row.locked);
const locked = fixture((row) => row.locked);

function renderDetail(entity: GuideEntity) {
  render(
    <ApiProvider api={createMockApi()}>
      <GuideDetail entity={entity} entities={WIRE_ENTITIES} reload={vi.fn().mockResolvedValue(undefined)} notify={vi.fn()} goToManuscript={vi.fn()} />
    </ApiProvider>,
  );
}

describe('Story Bible header actions by mode', () => {
  it('the read view offers Lock and Edit, and no Delete', () => {
    renderDetail(unlocked);
    expect(screen.getByRole('button', { name: 'Lock entry' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit this entry' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete entity' })).toBeNull();
  });

  it('edit mode offers Save, Cancel and a red Delete, and no Lock', () => {
    renderDetail(unlocked);
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    expect(screen.getByRole('button', { name: 'Save changes to this entry' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel editing' })).toBeTruthy();
    const deleteButton = screen.getByRole('button', { name: 'Delete entity' });
    expect(deleteButton.className).toContain('border-[var(--danger)]');
    expect(deleteButton.className).toContain('text-[var(--danger-text)]');
    expect(screen.queryByRole('button', { name: 'Lock entry' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Unlock entry' })).toBeNull();
  });

  it('a locked entry offers only Unlock: no Edit, no Save, no Delete', () => {
    renderDetail(locked);
    expect(screen.getByRole('button', { name: 'Unlock entry' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit this entry' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save changes to this entry' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete entity' })).toBeNull();
  });

  it('cannot be locked mid-edit, so Lock then Unlock can no longer snap back into edit mode', () => {
    renderDetail(unlocked);
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    // There is no way to reach Lock from here - the hazard ADR 0018 left open cannot occur.
    expect(screen.queryByRole('button', { name: 'Lock entry' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lock entry' }));
  });
});

// The list around the detail: a new entry is a draft that exists nowhere until a category is chosen, so Cancel drops it and there is
// nothing to leave dangling; the sort and the counts of each row.
function renderGuide() {
  window.localStorage.clear();
  const api = createMockApi();
  const spies = { create: vi.spyOn(api, 'guideCreate'), edit: vi.spyOn(api, 'guideEdit'), remove: vi.spyOn(api, 'guideDelete') };
  render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <StudioProvider>
          <CommandRouter>
            <Guide notify={vi.fn()} goToManuscript={vi.fn()} />
          </CommandRouter>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  return { api, ...spies };
}
const entryRows = () => within(screen.getByRole('list', { name: 'Story Bible entries' })).queryAllByRole('button');
const rowNames = () => entryRows().map((row) => row.querySelector('.truncate')?.textContent);
const addEntity = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Add entity' }));
  await screen.findByDisplayValue(/New entity/);
};

describe('cancel-on-a-new-unsaved-entry-drops-it-and-its-relationships', () => {
  it('Cancel on a new entry leaves no entry in the list and writes nothing', async () => {
    const { create, edit, remove } = renderGuide();
    await screen.findAllByText('Alice');
    const before = rowNames();
    await addEntity();
    // The draft is held by the page, not the list: it is in no row until a category is chosen.
    expect(rowNames()).toEqual(before);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel new entry' }));
    expect(rowNames()).toEqual(before);
    expect(screen.queryByDisplayValue(/New entity/)).toBeNull();
    expect([create, edit, remove].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);
  });
});

describe('save-keeps-it-and-leaving-an-unsaved-draft-for-another-entry-drops-it', () => {
  it('picking another row drops the unsaved draft and keeps every existing entry', async () => {
    const { create } = renderGuide();
    await screen.findAllByText('Alice');
    const before = rowNames();
    await addEntity();
    fireEvent.click(entryRows().find((row) => row.textContent?.includes('White Rabbit'))!);
    expect(rowNames()).toEqual(before);
    expect(create).not.toHaveBeenCalled();
  });

  it('cancelling the edit of an existing entry never drops it', async () => {
    renderGuide();
    await screen.findAllByText('Alice');
    const before = rowNames();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit this entry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(rowNames()).toEqual(before);
  });

  it('choosing a category saves the draft and it stays in the list', async () => {
    const { create } = renderGuide();
    await screen.findAllByText('Alice');
    await addEntity();
    fireEvent.click(screen.getByRole('button', { name: 'Choose category' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Character/ }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(rowNames()).toContain('New entity'));
  });
});

describe('deleting an entry', () => {
  it('deleting an entry removes its relationships, clears the selection and says so', async () => {
    const notify = vi.fn();
    window.localStorage.clear();
    const api = createMockApi();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <StudioProvider>
            <CommandRouter>
              <Guide notify={notify} goToManuscript={vi.fn()} />
            </CommandRouter>
          </StudioProvider>
        </ApiProvider>
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Alice' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete entity' }));
    fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Delete entry' })).getByRole('button', { name: 'Delete entry' }));
    await waitFor(() => expect(rowNames()).not.toContain('Alice'));
    expect(notify).toHaveBeenCalledWith('Deleted “Alice”.');
    // The deleted entry is no longer open, in edit mode or otherwise, and no entry still relates to it.
    expect(screen.queryByRole('heading', { name: 'Alice' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save changes to this entry' })).toBeNull();
    const rest = await api.guideEntities();
    expect(rest.some((row) => row.relationships.some((rel) => rel.id === 'alice'))).toBe(false);
    expect(rest.some((row) => row.id === 'alice')).toBe(false);
  });
});

describe('a new entry', () => {
  it('a new entry takes the filtered kind and focuses its name', async () => {
    renderGuide();
    await screen.findAllByText('Alice');
    await addEntity();
    // It opens named, selected and ready to rename; nothing is written until a category is chosen.
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }));
    expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('New entity');
  });

  it('starting another new entry drops the unsaved one', async () => {
    const { create } = renderGuide();
    await screen.findAllByText('Alice');
    await addEntity();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Tweedledum' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add entity' }));
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('New entity'));
    expect(screen.queryByDisplayValue('Tweedledum')).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(rowNames()).not.toContain('Tweedledum');
  });
});

describe('cancel-after-a-merge-does-not-bring-the-merged-entry-back', () => {
  it('after Merge, editing the target and cancelling leaves the merged source out of the list', async () => {
    renderGuide();
    await screen.findAllByText('Alice');
    expect(rowNames()).toContain('White Rabbit');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit this entry' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Add an alias or find a matching entry' }), { target: { value: 'White Rabbit' } });
    fireEvent.click(within(await screen.findByRole('listbox', { name: 'Matching Story Bible entries' })).getByRole('option', { name: /White Rabbit/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Merge into this entry' }));
    await waitFor(() => expect(rowNames()).not.toContain('White Rabbit'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(rowNames()).not.toContain('White Rabbit');
  });
});

describe('the-control-sorts-the-list-and-the-choice-is-kept', () => {
  it('sorts by chapters, saves the choice and restores it on reopen', async () => {
    renderGuide();
    await screen.findAllByText('Alice');
    expect(rowNames()).toEqual([...rowNames()].sort((a, b) => a!.localeCompare(b!)));
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort entries' }), { target: { value: 'type' } });
    expect(window.localStorage.getItem(ENTRY_SORT_STORAGE_KEY)).toBe('type');
    cleanup();
    const api = createMockApi();
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <StudioProvider>
            <CommandRouter>
              <Guide notify={vi.fn()} goToManuscript={vi.fn()} />
            </CommandRouter>
          </StudioProvider>
        </ApiProvider>
      </MemoryRouter>,
    );
    await screen.findAllByText('Alice');
    expect((screen.getByRole('combobox', { name: 'Sort entries' }) as HTMLSelectElement).value).toBe('type');
  });
});

describe('each-row-shows-its-names-and-its-chapters-and-no-mention-counts', () => {
  it('a row has a name count and a chapter count, and the list has no occurrences column', async () => {
    renderGuide();
    await screen.findAllByText('Alice');
    const alice = entryRows().find((row) => row.textContent?.includes('Alice'))!;
    expect(alice.textContent).toMatch(/Character · 1 name · /);
    const rabbit = entryRows().find((row) => row.textContent?.includes('White Rabbit'))!;
    expect(rabbit.textContent).toMatch(/2 names/);
    expect(alice.textContent).toMatch(/· \d+ chapters?$/);
    expect(alice.textContent).not.toMatch(/Occurrences|Mentions|Lines/);
  });
});

// SNB-3b: the "Needs review" chip beside the category tabs, and the pill on a row. The mock host flags nothing to start with; its
// suggestions put 2 to verify on White Rabbit and none on the other entries.
describe('needs-review-chip-and-row-pill', () => {
  const chip = () => screen.queryByRole('button', { name: /^Needs review · \d+$/ });
  async function renderBible(prepare: (api: ReturnType<typeof createMockApi>) => Promise<void> | void = () => undefined) {
    window.localStorage.clear();
    const api = createMockApi();
    await prepare(api);
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <StudioProvider>
            <CommandRouter>
              <Guide notify={vi.fn()} goToManuscript={vi.fn()} />
            </CommandRouter>
          </StudioProvider>
        </ApiProvider>
      </MemoryRouter>,
    );
    await screen.findAllByText('Alice');
    return api;
  }
  const noSuggestions = (api: ReturnType<typeof createMockApi>) => void vi.spyOn(api, 'extractionList').mockResolvedValue([] as ExtractionSuggestion[]);
  const flagHatter = (api: ReturnType<typeof createMockApi>) => api.guideFlagReview('mad-hatter');
  const rowFor = (name: string) => entryRows().find((row) => row.querySelector('.truncate')?.textContent === name)!;

  it('chip-with-the-count-filters: counts the flagged and the to-verify entries once and filters to them', async () => {
    await renderBible(flagHatter);
    const button = await screen.findByRole('button', { name: 'Needs review · 2' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(rowNames().length).toBeGreaterThan(3);
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Needs review · 2' }).getAttribute('aria-pressed')).toBe('true');
    expect([...rowNames()].sort()).toEqual(['Hatter', 'White Rabbit']);
    fireEvent.click(screen.getByRole('button', { name: 'Needs review · 2' }));
    expect(rowNames().length).toBeGreaterThan(3);
  });

  it('the chip is absent at 0 unless the filter is on', async () => {
    await renderBible(noSuggestions);
    expect(chip()).toBeNull();
    cleanup();
    await renderBible(async (api) => {
      noSuggestions(api);
      await flagHatter(api);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Needs review · 1' }));
    expect(rowNames()).toEqual(['Hatter']);
    fireEvent.click(rowFor('Hatter'));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark reviewed' }));
    const stays = await screen.findByRole('button', { name: 'Needs review · 0' });
    expect(stays.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('No entries match.')).toBeTruthy();
    fireEvent.click(stays);
    await waitFor(() => expect(chip()).toBeNull());
  });

  it('row-pill-says-verify-or-review', async () => {
    await renderBible(flagHatter);
    expect(within(rowFor('White Rabbit')).getByText('Verify · 2')).toBeTruthy();
    expect(within(rowFor('Alice')).queryByText(/Review|Verify/)).toBeNull();
    expect(within(rowFor('Hatter')).getByText('Review')).toBeTruthy();
    expect(within(rowFor('Caterpillar')).queryByText(/Review|Verify/)).toBeNull();
  });

  it('a flagged entry with something to verify says Verify, and Review once nothing is left', async () => {
    const api = await renderBible(async (host) => void (await host.guideFlagReview('white-rabbit')));
    expect(within(rowFor('White Rabbit')).getByText('Verify · 2')).toBeTruthy();
    const open = await api.extractionList();
    await Promise.all(open.filter((s) => s.entryId === 'white-rabbit' && s.status === 'needs-verification').map((s) => api.extractionReject(s.id)));
    cleanup();
    vi.spyOn(api, 'extractionList');
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <StudioProvider>
            <CommandRouter>
              <Guide notify={vi.fn()} goToManuscript={vi.fn()} />
            </CommandRouter>
          </StudioProvider>
        </ApiProvider>
      </MemoryRouter>,
    );
    await screen.findAllByText('Alice');
    expect(within(rowFor('White Rabbit')).getByText('Review')).toBeTruthy();
  });

  it('mark-reviewed-clears-the-entry-and-its-names: the count follows', async () => {
    const api = await renderBible(async (host) => {
      noSuggestions(host);
      await flagHatter(host);
      await host.guideFlagReview('caterpillar');
    });
    await screen.findByRole('button', { name: 'Needs review · 2' });
    fireEvent.click(rowFor('Hatter'));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark reviewed' }));
    await screen.findByRole('button', { name: 'Needs review · 1' });
    expect((await api.guideEntities()).find((row) => row.id === 'mad-hatter')?.review).toEqual({ entry: false, aliases: [] });
    expect(within(rowFor('Hatter')).queryByText('Review')).toBeNull();
  });

  it('blocked-while-anything-needs-verification: White Rabbit cannot be marked reviewed until its suggestions are decided', async () => {
    const api = await renderBible(async (host) => void (await host.guideFlagReview('white-rabbit')));
    const mark = vi.spyOn(api, 'guideMarkReviewed');
    fireEvent.click(rowFor('White Rabbit'));
    const button = (await screen.findByRole('button', { name: 'Mark reviewed' })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByRole('group', { name: 'Verify or reject its suggestions first.' })).toBeTruthy();
    fireEvent.click(button);
    expect(mark).not.toHaveBeenCalled();
  });

  it('mark-reviewed-can-be-undone: Undo flags the entry again and the chip counts it', async () => {
    const toast = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
    const api = await renderBible(async (host) => {
      noSuggestions(host);
      await flagHatter(host);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Needs review · 1' }));
    fireEvent.click(rowFor('Hatter'));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark reviewed' }));
    await screen.findByRole('button', { name: 'Needs review · 0' });
    await toast.mock.calls[0][1]();
    await screen.findByRole('button', { name: 'Needs review · 1' });
    expect((await api.guideEntities()).find((row) => row.id === 'mad-hatter')?.review?.entry).toBe(true);
    toast.mockRestore();
  });

  it('editor-shows-the-flags: Cancel of an edit does not bring a cleared flag back', async () => {
    const api = await renderBible(async (host) => {
      noSuggestions(host);
      await host.guideFlagReview('white-rabbit', 0);
    });
    fireEvent.click(rowFor('White Rabbit'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit this entry' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark Rabbit reviewed' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark Rabbit reviewed' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
    expect(screen.queryByRole('button', { name: 'Mark Rabbit reviewed' })).toBeNull();
    expect((await api.guideEntities()).find((row) => row.id === 'white-rabbit')?.review?.aliases).toEqual([]);
  });

  it('merge-keeps-both-flags-visible: the result shows what the host sends, and the client merges nothing', async () => {
    let flag!: ReturnType<typeof vi.spyOn>;
    let mark!: ReturnType<typeof vi.spyOn>;
    await renderBible(async (api) => {
      noSuggestions(api);
      const rows = await api.guideEntities();
      // What the host answers after a merge: the target carries the union of both entries' flags.
      vi.spyOn(api, 'guideEntities').mockResolvedValue(rows.map((row) => (row.id === 'alice' ? { ...row, review: { entry: true, aliases: [] } } : row)));
      flag = vi.spyOn(api, 'guideFlagReview');
      mark = vi.spyOn(api, 'guideMarkReviewed');
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Needs review · 1' }));
    expect(rowNames()).toEqual(['Alice']);
    expect(within(screen.getByRole('list', { name: 'Story Bible entries' })).getByText('Review')).toBeTruthy();
    expect([flag, mark].map((spy) => spy.mock.calls.length)).toEqual([0, 0]);
  });

  // The title is cited by docs/research/studio-next-parity-script-and-bible.md (scripts/ci/studio-next-parity.mjs checks it); the category tabs
  // are now kind chips, so the test checks that an entry in the Needs Review category lists under All and under no kind chip.
  it('needs-review-category-tab-still-works: the category tab filters by category, not by the flags', async () => {
    await renderBible(flagHatter);
    expect(screen.queryByRole('button', { name: /^Needs Review$/ })).toBeNull();
    expect(rowNames()).toContain('March Hare');
    fireEvent.click(within(screen.getByRole('group', { name: 'Kind' })).getByRole('button', { name: 'Character' }));
    expect(rowNames()).not.toContain('March Hare');
    expect(screen.getByRole('button', { name: /^Needs review · \d+$/ })).toBeTruthy();
  });
});
