// @vitest-environment jsdom
// Ticking entries in the Story Bible's list and deleting them together (#3662): what the bar and the question say, what is asked of the host, and what is said after.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { CommandRouter } from '../../input/router';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { StudioProvider } from '../../studio/StudioProvider';
import { entryRows, rowName } from './entryTableTestKit';
import { Guide } from './Guide';

afterEach(cleanup);

async function mount() {
  window.localStorage.clear();
  const api = createMockApi();
  const notify = vi.fn();
  render(
    <MemoryRouter initialEntries={['/story-bible']}>
      <ApiProvider api={api}>
        <StudioProvider>
          <OverlayProvider>
            <CommandRouter>
              <Guide notify={notify} goToManuscript={vi.fn()} />
            </CommandRouter>
          </OverlayProvider>
        </StudioProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
  await screen.findAllByText('Alice');
  return { api, notify };
}
const tick = (name: string) => fireEvent.click(screen.getByRole('checkbox', { name: `Select ${name}` }));
const names = () => entryRows().map(rowName);
const bar = () => document.querySelector('thead')!;
const deleteButton = () => screen.getByRole('button', { name: /^Delete \d+ entr/ });

describe('ticking entries to delete them together', () => {
  it('shows no bar until an entry is ticked, then the count and a Delete that says how many', async () => {
    await mount();
    expect(screen.queryByRole('button', { name: /^Delete \d+ entr/ })).toBeNull();
    tick('Alice');
    expect(bar().textContent).toContain('1 selected');
    expect(deleteButton().textContent).toBe('Delete 1 entry');
    tick('Hatter');
    expect(bar().textContent).toContain('2 selected');
    expect(deleteButton().textContent).toBe('Delete 2 entries');
    // Opening nothing: the box ticks, it does not select the row.
    expect(screen.getByRole('checkbox', { name: 'Select Alice' }).getAttribute('aria-checked')).toBe('true');
  });

  it('asks first, naming the count and what is lost, and deletes nothing until it is confirmed', async () => {
    const { api } = await mount();
    const del = vi.spyOn(api, 'guideDelete');
    tick('Alice');
    tick('Hatter');
    fireEvent.click(deleteButton());
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete 2 entries', { selector: 'h2, [role=heading], div, span' })).toBeTruthy();
    expect(dialog.textContent).toContain('Delete the 2 entries you ticked, with their aliases, evidence, and relationships? This cannot be undone.');
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(del).not.toHaveBeenCalled();
    expect(names()).toContain('Alice');
  });

  it('deletes each ticked entry once, reads the list once more, says how many went and clears the ticks', async () => {
    const { api, notify } = await mount();
    const del = vi.spyOn(api, 'guideDelete');
    const read = vi.spyOn(api, 'guideEntities');
    tick('Alice');
    tick('Hatter');
    fireEvent.click(deleteButton());
    await screen.findByRole('alertdialog');
    read.mockClear();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete 2 entries' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Deleted 2 entries.'));
    expect(del).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledTimes(1);
    expect(names()).not.toContain('Alice');
    expect(names()).not.toContain('Hatter');
    expect(screen.queryByRole('button', { name: /^Delete \d+ entr/ })).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a double press on the confirm deletes once', async () => {
    const { api } = await mount();
    const del = vi.spyOn(api, 'guideDelete');
    tick('Alice');
    fireEvent.click(deleteButton());
    const confirm = within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete 1 entry' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(del).toHaveBeenCalledTimes(1);
  });

  it('keeps a locked entry: it is not asked of the host, and the question says how many are kept', async () => {
    const { api, notify } = await mount();
    const del = vi.spyOn(api, 'guideDelete');
    tick('Alice');
    tick('Queen of Hearts');
    expect(deleteButton().textContent).toBe('Delete 1 entry');
    fireEvent.click(deleteButton());
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('1 locked entry is kept.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete 1 entry' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Deleted 1 entry.'));
    expect(del).toHaveBeenCalledTimes(1);
    expect(del.mock.calls[0]![0]).not.toBe('queen');
    expect(names()).toContain('Queen of Hearts');
  });

  it('with only locked entries ticked the Delete is off and says why', async () => {
    await mount();
    tick('Queen of Hearts');
    const button = deleteButton();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('says how many went and why the first failure did, as an error, when some are refused; the ones before it stay deleted', async () => {
    const { api, notify } = await mount();
    const real = api.guideDelete.bind(api);
    vi.spyOn(api, 'guideDelete').mockImplementation(async (id: string) => {
      const entry = (await api.guideEntities()).find((e) => e.id === id);
      if (entry?.canonical_name === 'Hatter') throw new Error('The host said no.');
      return real(id);
    });
    tick('Alice');
    tick('Hatter');
    fireEvent.click(deleteButton());
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete 2 entries' }));
    await waitFor(() => expect(notify).toHaveBeenCalled());
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^Deleted 1 of 2 entries; 1 could not be deleted: .*The host said no/), 'error');
    expect(names()).not.toContain('Alice');
    expect(names()).toContain('Hatter');
  });

  it('counts only the entries the search leaves: a ticked entry the search hides is not deleted', async () => {
    const { api } = await mount();
    const del = vi.spyOn(api, 'guideDelete');
    tick('Alice');
    tick('Hatter');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search entries' }), { target: { value: 'Hatter' } });
    await waitFor(() => expect(names()).toEqual(['Hatter']));
    expect(bar().textContent).toContain('1 selected');
    fireEvent.click(deleteButton());
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete 1 entry' }));
    await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
    expect(await api.guideEntities()).toEqual(expect.arrayContaining([expect.objectContaining({ canonical_name: 'Alice' })]));
  });

  it('the select-all box ticks every entry in the list and then none; Clear takes the ticks away', async () => {
    await mount();
    const all = () => screen.getByRole('checkbox', { name: 'Select every entry' });
    fireEvent.click(all());
    expect(bar().textContent).toContain(`${names().length} selected`);
    expect(all().getAttribute('aria-checked')).toBe('true');
    fireEvent.click(all());
    expect(screen.queryByRole('button', { name: /^Delete \d+ entr/ })).toBeNull();
    tick('Alice');
    fireEvent.click(screen.getByRole('button', { name: 'Clear the selection' }));
    expect(screen.queryByRole('button', { name: /^Delete \d+ entr/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Select Alice' }).getAttribute('aria-checked')).toBe('false');
  });

  it("a press on a row's box does not open the entry", async () => {
    await mount();
    tick('Hatter');
    expect(
      entryRows()
        .find((r) => rowName(r) === 'Hatter')!
        .getAttribute('aria-selected'),
    ).not.toBe('true');
  });
});
