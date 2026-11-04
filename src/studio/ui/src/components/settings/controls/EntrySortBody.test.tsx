// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SORT, ENTRY_SORT_STORAGE_KEY, loadEntrySort, saveEntrySort } from '../../storybible/entryTable';
import { BROWSER_CHANGED } from '../data/browserValues';
import { ROWS } from '../registry/rows';
import { search } from '../registry/search';
import { EntrySortBody } from './AppearanceBodies';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('the Story Bible entry order setting (parity audit)', () => {
  it('is a row of this window under Look, found by the words a narrator uses, and Changed reads it', () => {
    expect(ROWS.find((row) => row.id === 'look.entrySort')).toMatchObject({ cat: 'appearance', section: 'Look', scope: 'browser', used: ['bible'] });
    for (const query of ['story bible sort', 'entry order', 'sort characters by mentions'])
      expect(search(query).some((hit) => hit.row?.id === 'look.entrySort')).toBe(true);
    expect(BROWSER_CHANGED['look.entrySort']?.()).toBe(false);
    saveEntrySort([{ column: 'mentions', dir: 'desc' }]);
    expect(BROWSER_CHANGED['look.entrySort']?.()).toBe(true);
  });

  it('shows Name, A to Z until it is changed', () => {
    render(<EntrySortBody />);
    expect((screen.getByRole('combobox', { name: 'Story Bible order' }) as HTMLSelectElement).value).toBe('name-asc');
    expect(loadEntrySort()).toEqual(DEFAULT_SORT);
  });

  it('keeps a choice as the one key the Story Bible sorts by, in the key its own Sort menu writes', () => {
    render(<EntrySortBody />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Story Bible order' }), { target: { value: 'mentions-desc' } });
    expect(JSON.parse(localStorage.getItem(ENTRY_SORT_STORAGE_KEY)!)).toEqual([{ column: 'mentions', dir: 'desc' }]);
    expect(loadEntrySort()).toEqual([{ column: 'mentions', dir: 'desc' }]);
  });

  it('shows the first key a header click kept, whatever its direction, and starts from a legacy value', () => {
    saveEntrySort([
      { column: 'kind', dir: 'desc' },
      { column: 'name', dir: 'asc' },
    ]);
    render(<EntrySortBody />);
    expect((screen.getByRole('combobox', { name: 'Story Bible order' }) as HTMLSelectElement).value).toBe('kind-desc');
    cleanup();
    localStorage.setItem(ENTRY_SORT_STORAGE_KEY, 'chapters');
    render(<EntrySortBody />);
    expect((screen.getByRole('combobox', { name: 'Story Bible order' }) as HTMLSelectElement).value).toBe('book-asc');
  });
});
