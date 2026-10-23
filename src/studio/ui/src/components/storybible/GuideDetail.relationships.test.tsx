// @vitest-environment jsdom
// The Relationships table (the mock's Relationships and EntryPicker, SN-B92 G11, ruling SB-7, gap SB-4): each row is the relationship and the other
// entry; one written from the other entry's side is marked as incoming; while editing the text and the other entry change in place, and Add and Remove work.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { CommandRouter } from '../../input/router';
import { createMockApi } from '../../api/mockApi';
import { StudioProvider } from '../../studio/StudioProvider';
import { Guide } from './Guide';

afterEach(() => cleanup());

async function renderAlice() {
  window.localStorage.clear();
  const api = createMockApi();
  const relate = vi.spyOn(api, 'guideRelate');
  const unrelate = vi.spyOn(api, 'guideUnrelate');
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
  return { api, relate, unrelate };
}
const table = () => screen.getByRole('table', { name: 'Relationships' });
const rowOf = (label: string) => within(table()).getByText(label).closest('tr')!;

describe('the Relationships table', () => {
  it('shows the relationship and the other entry, and marks the ones written from the other entry', async () => {
    await renderAlice();
    const outgoing = rowOf('follows');
    expect(within(outgoing).getByText('White Rabbit')).toBeTruthy();
    expect(within(outgoing).queryByRole('img', { name: 'Incoming' })).toBeNull();
    // White Rabbit holds "is followed by Alice": from Alice's side that is a relationship she receives.
    const incoming = rowOf('is followed by');
    expect(within(incoming).getByText('White Rabbit')).toBeTruthy();
    expect(within(incoming).getByRole('img', { name: 'Incoming' })).toBeTruthy();
    expect(within(table()).getAllByRole('img', { name: 'Incoming' })).toHaveLength(3);
  });

  it('adds a relationship: a blank row, the text, then the entry from the picker, and nothing is written before both', async () => {
    const { relate } = await renderAlice();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a relationship' }));
    const rows = within(table()).getAllByRole('row');
    const blank = rows[rows.length - 2];
    fireEvent.change(within(blank).getByRole('combobox', { name: 'Relationship' }), { target: { value: 'pours tea for' } });
    fireEvent.blur(within(blank).getByRole('combobox', { name: 'Relationship' }));
    expect(relate).not.toHaveBeenCalled();

    fireEvent.click(within(blank).getByRole('button', { name: 'To: choose an entry' }));
    // The picker searches the entries, and never offers the entry being edited.
    const search = await screen.findByRole('combobox', { name: 'Search entries' });
    fireEvent.change(search, { target: { value: 'hat' } });
    const options = within(screen.getByRole('listbox', { name: 'Matching entries' })).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Hatter')]));
    expect(options.some((option) => option.textContent?.includes('Alice'))).toBe(false);
    // Enter picks the first match.
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(relate).toHaveBeenCalledWith('alice', 'mad-hatter', 'pours tea for'));
    // The new row is Alice's own relationship, so it is not marked, and the blank row is gone.
    await waitFor(() => expect(screen.getByDisplayValue('pours tea for')).toBeTruthy());
    expect(
      within(table())
        .getAllByRole('combobox', { name: 'Relationship' })
        .map((box) => (box as HTMLInputElement).value),
    ).not.toContain('');
  });

  it('changes a relationship in place: the text, and the other entry, each written as the new one and then the old removed', async () => {
    const { relate, unrelate } = await renderAlice();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    const label = screen.getByDisplayValue('follows');
    fireEvent.change(label, { target: { value: 'chases' } });
    fireEvent.blur(label);
    await waitFor(() => expect(relate).toHaveBeenCalledWith('alice', 'white-rabbit', 'chases'));
    await waitFor(() => expect(unrelate).toHaveBeenCalledWith('alice', 'white-rabbit', 'follows'));
    await waitFor(() => expect(screen.getByDisplayValue('chases')).toBeTruthy());

    // The write is over once Add is enabled again.
    await waitFor(() => expect((screen.getByRole('button', { name: 'Add a relationship' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(screen.getByDisplayValue('chases').closest('tr')!).getByRole('button', { name: /^To: / }));
    fireEvent.click(within(await screen.findByRole('listbox', { name: 'Matching entries' })).getByRole('option', { name: /^Hatter/ }));
    await waitFor(() => expect(relate).toHaveBeenCalledWith('alice', 'mad-hatter', 'chases'));
    await waitFor(() => expect(unrelate).toHaveBeenCalledWith('alice', 'white-rabbit', 'chases'));
  });

  it('puts the text back when it is emptied, and writes nothing', async () => {
    const { relate, unrelate } = await renderAlice();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    const label = screen.getByDisplayValue('follows') as HTMLInputElement;
    fireEvent.change(label, { target: { value: '  ' } });
    fireEvent.blur(label);
    expect(label.value).toBe('follows');
    expect(relate).not.toHaveBeenCalled();
    expect(unrelate).not.toHaveBeenCalled();
  });

  it('removes a relationship, from either side', async () => {
    const { unrelate } = await renderAlice();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    fireEvent.click(within(screen.getByDisplayValue('follows').closest('tr')!).getByRole('button', { name: 'Remove relationship' }));
    await waitFor(() => expect(unrelate).toHaveBeenCalledWith('alice', 'white-rabbit', 'follows'));
    // An incoming one is held by the other entry, so that is the one it is removed from.
    await waitFor(() => expect(screen.queryByDisplayValue('follows')).toBeNull());
    fireEvent.click(within(screen.getByDisplayValue('is followed by').closest('tr')!).getByRole('button', { name: 'Remove relationship' }));
    await waitFor(() => expect(unrelate).toHaveBeenCalledWith('white-rabbit', 'alice', 'is followed by'));
    await waitFor(() => expect(screen.queryByDisplayValue('is followed by')).toBeNull());
  });
});
