// @vitest-environment jsdom
// The Relationships table (the mock's Relationships and EntryPicker, SN-B92 G11, ruling SB-7): each row is the relationship and the other
// entry; one written from the other entry's side is marked as incoming; the other entry is found by searching, and Add and Remove work.
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

  it('adds a relationship from the picker and marks an incoming one', async () => {
    const { relate } = await renderAlice();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    const add = screen.getByRole('button', { name: 'Add relationship' });
    // Nothing is added until both the text and the entry are chosen.
    fireEvent.click(add);
    expect(relate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Relationship' }), { target: { value: 'pours tea for' } });
    expect((screen.getByRole('textbox', { name: 'Relationship' }) as HTMLInputElement).value).toBe('pours tea for');
    // The picker searches the entries, and never offers the entry being edited.
    const search = screen.getByRole('combobox', { name: 'Search entries' });
    fireEvent.change(search, { target: { value: 'hat' } });
    const options = within(screen.getByRole('listbox', { name: 'Matching entries' })).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Hatter')]));
    expect(options.some((option) => option.textContent?.includes('Alice'))).toBe(false);
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Matching entries' })).getByRole('option', { name: /Hatter/ }));
    expect(screen.getByRole('button', { name: 'Choose another entry' }).closest('[data-picked]')?.textContent).toBe('Hatter');

    fireEvent.click(add);
    await waitFor(() => expect(relate).toHaveBeenCalledWith('alice', 'mad-hatter', 'pours tea for'));
    // The new row is Alice's own relationship, so it is not marked; the text and the picked entry are cleared for the next one.
    await waitFor(() => expect(rowOf('pours tea for')).toBeTruthy());
    expect(within(rowOf('pours tea for')).queryByRole('img', { name: 'Incoming' })).toBeNull();
    expect((screen.getByRole('textbox', { name: 'Relationship' }) as HTMLInputElement).value).toBe('');
  });

  it('removes a relationship, from either side', async () => {
    const { unrelate } = await renderAlice();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    fireEvent.click(within(rowOf('follows')).getByRole('button', { name: 'Remove relationship' }));
    await waitFor(() => expect(unrelate).toHaveBeenCalledWith('alice', 'white-rabbit', 'follows'));
    // An incoming one is held by the other entry, so that is the one it is removed from.
    await waitFor(() => expect(within(table()).queryByText('follows')).toBeNull());
    fireEvent.click(within(rowOf('is followed by')).getByRole('button', { name: 'Remove relationship' }));
    await waitFor(() => expect(unrelate).toHaveBeenCalledWith('white-rabbit', 'alice', 'is followed by'));
    await waitFor(() => expect(within(table()).queryByText('is followed by')).toBeNull());
  });
});
