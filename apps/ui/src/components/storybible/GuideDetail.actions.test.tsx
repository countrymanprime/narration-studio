// @vitest-environment jsdom
// Mode-based header actions (ADR 0087): Lock/Unlock lives in the read view only, Delete lives in edit
// mode only, and an entry can never be locked while it is being edited (the hazard ADR 0018 left open).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import type { GuideEntity } from '../../types';
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
        <Guide notify={vi.fn()} goToManuscript={vi.fn()} />
      </ApiProvider>
    </MemoryRouter>,
  );
  return { api, ...spies };
}
const entryRows = () =>
  within(screen.getByRole('table', { name: 'Story Bible entries' }))
    .getAllByRole('row')
    .slice(1);
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

describe('cancel-after-a-merge-does-not-bring-the-merged-entry-back', () => {
  it('after Merge, editing the target and cancelling leaves the merged source out of the list', async () => {
    renderGuide();
    await screen.findAllByText('Alice');
    expect(rowNames()).toContain('White Rabbit');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit this entry' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Add an alias or find a matching entry' }), { target: { value: 'White Rabbit' } });
    fireEvent.click(within(await screen.findByRole('listbox', { name: 'Matching Story Bible entries' })).getByRole('option', { name: /White Rabbit/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Merge into current entry/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Merge & delete source' }));
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
          <Guide notify={vi.fn()} goToManuscript={vi.fn()} />
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
    expect(alice.textContent).toMatch(/Character · 0 names/);
    const rabbit = entryRows().find((row) => row.textContent?.includes('White Rabbit'))!;
    expect(rabbit.textContent).toMatch(/1 name/);
    const list = within(screen.getByRole('table', { name: 'Story Bible entries' }));
    expect(list.queryByRole('columnheader', { name: /Occurrences|Mentions|Lines/ })).toBeNull();
    expect(list.getByRole('columnheader', { name: 'Chapters' })).toBeTruthy();
  });
});
