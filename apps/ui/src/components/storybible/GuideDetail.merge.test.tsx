// @vitest-environment jsdom
// Merging (the mock's Names box and mergeEntries, SN-B92 G14 and G15, ruling SB-3): a name that another entry already has is not added as a
// copy, the Names box offers to merge that entry in instead, and the merge is one step that its toast's Undo takes back.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { CommandRouter } from '../../input/router';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import { overlay } from '../../overlay/overlayService';
import { StudioProvider } from '../../studio/StudioProvider';
import { Guide } from './Guide';
import { GuideDetail } from './GuideDetail';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderGuide() {
  window.localStorage.clear();
  const api = createMockApi();
  const merge = vi.spyOn(api, 'guideMerge');
  const unmerge = vi.spyOn(api, 'guideUnmerge');
  const edit = vi.spyOn(api, 'guideEdit');
  const toast = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => undefined);
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
  await screen.findByRole('heading', { name: 'Alice' });
  return { api, merge, unmerge, edit, toast };
}
const box = () => screen.getByRole('combobox', { name: 'Add an alias or find a matching entry' });
const rows = () => within(screen.getByRole('list', { name: 'Story Bible entries' })).queryAllByRole('button');
const rowNames = () => rows().map((row) => row.querySelector('.truncate')?.textContent);
const open = async (name: string) => {
  fireEvent.click(rows().find((row) => row.querySelector('.truncate')?.textContent === name)!);
  await screen.findByRole('heading', { name });
};
// Types a name another entry has, in the Names box of the entry being edited, and asks to add it.
const offerFor = (text: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
  fireEvent.change(box(), { target: { value: text } });
  fireEvent.keyDown(box(), { key: 'Enter' });
};

describe('merging an entry into this one', () => {
  it('a merge combines names, re-points relationships and unions Appears in', async () => {
    const { api, merge } = await renderGuide();
    await open('Cheshire Cat');
    // "Queen’s garden" has the alias "garden", and Queen of Hearts holds "rules Queen’s garden".
    offerFor('Queen’s garden');
    fireEvent.click(await screen.findByRole('button', { name: 'Merge into this entry' }));
    await waitFor(() => expect(merge).toHaveBeenCalledWith('queens-garden', 'cheshire-cat'));
    await waitFor(() => expect(rowNames()).not.toContain('Queen’s garden'));

    const entries = await api.guideEntities();
    const cat = entries.find((row) => row.id === 'cheshire-cat')!;
    expect(cat.aliases.map((alias) => alias.text)).toEqual(['Cat', 'Queen’s garden', 'garden']);
    expect(cat.relationships.map((rel) => rel.id)).toContain('queen-of-hearts');
    const queen = entries.find((row) => row.id === 'queen-of-hearts')!;
    expect(queen.relationships).toContainEqual({ id: 'cheshire-cat', name: 'Cheshire Cat', label: 'rules' });
    expect(queen.relationships.some((rel) => rel.id === 'queens-garden')).toBe(false);
    // The selection stays on the entry that took the merge, which now lists the names it absorbed.
    expect(screen.getByRole('heading', { name: 'Cheshire Cat' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Names' }).textContent).toContain('garden');
  });

  it("the toast's Undo takes the merge back", async () => {
    const { api, unmerge, toast } = await renderGuide();
    await open('Cheshire Cat');
    offerFor('Queen’s garden');
    fireEvent.click(await screen.findByRole('button', { name: 'Merge into this entry' }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast.mock.calls[0][0]).toBe('Merged “Queen’s garden” into “Cheshire Cat”.');

    const result = await toast.mock.calls[0][1]();
    expect(result).toEqual({ ok: true });
    expect(unmerge).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(rowNames()).toContain('Queen’s garden'));
    const entries = await api.guideEntities();
    expect(entries.find((row) => row.id === 'cheshire-cat')!.aliases.map((alias) => alias.text)).toEqual(['Cat']);
    expect(entries.find((row) => row.id === 'queen-of-hearts')!.relationships.some((rel) => rel.id === 'queens-garden')).toBe(true);
  });

  it('says why when the merge can no longer be undone, and changes nothing', async () => {
    const { api, toast } = await renderGuide();
    await open('Cheshire Cat');
    offerFor('Queen’s garden');
    fireEvent.click(await screen.findByRole('button', { name: 'Merge into this entry' }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    await api.guideEdit('cheshire-cat', { description: 'Edited after the merge.' });
    const result = await toast.mock.calls[0][1]();
    expect(result).toEqual({ ok: false, refusal: { reason: 'Cheshire Cat changed after the merge, so it cannot be undone.' } });
    expect(rowNames()).not.toContain('Queen’s garden');
  });

  it('the merge offer follows the typed name and clears on another entry', async () => {
    const { merge, edit } = await renderGuide();
    await open('Cheshire Cat');
    // Matches ignoring case, and the copy is refused: nothing is added, the offer names the entry that has the name.
    offerFor('white rabbit');
    expect(screen.getByRole('status').textContent).toBe('“white rabbit” is already a name of White Rabbit.');
    expect(edit).not.toHaveBeenCalled();
    expect(merge).not.toHaveBeenCalled();
    // An alias of another entry counts as its name too, and the offer follows the text.
    fireEvent.change(box(), { target: { value: 'garden' } });
    expect(screen.queryByRole('button', { name: 'Merge into this entry' })).toBeNull();
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(screen.getByRole('status').textContent).toBe('“garden” is already a name of Queen’s garden.');
    expect(screen.getByRole('button', { name: 'Merge into this entry' })).toBeTruthy();
    // Typing on removes the offer; so does choosing another entry, with the typed text.
    fireEvent.change(box(), { target: { value: 'garden party' } });
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.keyDown(box(), { key: 'Enter' });
    await waitFor(() => expect(edit).toHaveBeenCalledWith('cheshire-cat', { aliases: 'Cat;garden party' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Add alias' })[0].getAttribute('aria-busy')).not.toBe('true'));

    fireEvent.change(box(), { target: { value: 'white rabbit' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(screen.getByRole('status')).toBeTruthy();
    await open('Hatter');
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Merge into this entry' })).toBeNull();
    expect((box() as HTMLInputElement).value).toBe('');
  });

  it('does not offer to merge into a locked entry', () => {
    const api = createMockApi();
    const target = WIRE_ENTITIES.find((row) => row.id === 'cheshire-cat')!;
    render(
      <ApiProvider api={api}>
        <GuideDetail entity={target} entities={WIRE_ENTITIES} reload={vi.fn()} notify={vi.fn()} goToManuscript={vi.fn()} />
      </ApiProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    fireEvent.change(box(), { target: { value: 'queen of hearts' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    // Queen of Hearts is locked: the merge would delete it.
    expect(screen.getByRole('status').textContent).toBe('“queen of hearts” is already a name of Queen of Hearts.');
    const offer = screen.getByRole('button', { name: 'Merge into this entry' });
    expect((offer as HTMLButtonElement).disabled || offer.getAttribute('aria-disabled') === 'true').toBe(true);
  });
});
