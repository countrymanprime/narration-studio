// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SORT, ENTRY_SORT_STORAGE_KEY, loadEntrySort, saveEntrySort } from '../../storybible/entryTable';
import { BROWSER_CHANGED } from '../data/browserValues';
import { ROWS } from '../registry/rows';
import { search } from '../registry/search';
import { SettingsHostProvider, type SettingsHost } from '../row/SettingsHost';
import { EntrySortBody } from './AppearanceBodies';

const notify = vi.fn();
const host = { notify } as unknown as SettingsHost;
const body = () => render(<SettingsHostProvider value={host}>{<EntrySortBody />}</SettingsHostProvider>);
const order = () => (screen.getByRole('combobox', { name: 'Story Bible order' }) as HTMLSelectElement).value;

beforeEach(() => {
  localStorage.clear();
  notify.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the Story Bible entry order setting (parity audit)', () => {
  it('is a row of this window under Look, found by the words a narrator uses, and Changed reads it', () => {
    expect(ROWS.find((row) => row.id === 'look.entrySort')).toMatchObject({ cat: 'appearance', section: 'Look', scope: 'browser', used: ['bible'] });
    for (const query of ['story bible sort', 'entry order', 'sort characters by mentions'])
      expect(search(query).some((hit) => hit.row?.id === 'look.entrySort')).toBe(true);
    expect(BROWSER_CHANGED['look.entrySort']?.()).toBe(false);
    saveEntrySort([{ column: 'mentions', dir: 'desc' }]);
    expect(BROWSER_CHANGED['look.entrySort']?.()).toBe(true);
  });

  it('counts a tie-break a header click kept as a change, since the Story Bible sorts differently for it', () => {
    saveEntrySort([
      { column: 'name', dir: 'asc' },
      { column: 'kind', dir: 'asc' },
    ]);
    expect(BROWSER_CHANGED['look.entrySort']?.()).toBe(true);
    body();
    expect(screen.getByRole('button', { name: 'Reset Story Bible order to Name, A to Z' })).toBeTruthy();
  });

  it('shows Name, A to Z until it is changed', () => {
    body();
    expect(order()).toBe('name-asc');
    expect(loadEntrySort()).toEqual(DEFAULT_SORT);
    expect(screen.queryByRole('button', { name: /^Reset Story Bible order/ })).toBeNull();
  });

  it('keeps a choice as the one key the Story Bible sorts by, in the key its own Sort menu writes, and Reset puts the default back', () => {
    body();
    fireEvent.change(screen.getByRole('combobox', { name: 'Story Bible order' }), { target: { value: 'mentions-desc' } });
    expect(JSON.parse(localStorage.getItem(ENTRY_SORT_STORAGE_KEY)!)).toEqual([{ column: 'mentions', dir: 'desc' }]);
    expect(order()).toBe('mentions-desc');
    fireEvent.click(screen.getByRole('button', { name: 'Reset Story Bible order to Name, A to Z' }));
    expect(order()).toBe('name-asc');
    expect(loadEntrySort()).toEqual(DEFAULT_SORT);
  });

  it('shows the first key a header click kept, whatever its direction, and starts from a legacy value', () => {
    saveEntrySort([
      { column: 'kind', dir: 'desc' },
      { column: 'name', dir: 'asc' },
    ]);
    body();
    expect(order()).toBe('kind-desc');
    cleanup();
    localStorage.setItem(ENTRY_SORT_STORAGE_KEY, 'chapters');
    body();
    expect(order()).toBe('book-asc');
  });

  it('follows a header click or Sort menu choice made while it is shown, and another window’s change', () => {
    body();
    act(() => saveEntrySort([{ column: 'mentions', dir: 'desc' }]));
    expect(order()).toBe('mentions-desc');
    act(() => {
      localStorage.setItem(ENTRY_SORT_STORAGE_KEY, JSON.stringify([{ column: 'kind', dir: 'desc' }]));
      window.dispatchEvent(new StorageEvent('storage', { key: ENTRY_SORT_STORAGE_KEY }));
    });
    expect(order()).toBe('kind-desc');
    expect(screen.getByRole('button', { name: 'Reset Story Bible order to Name, A to Z' })).toBeTruthy();
  });

  it('does not claim a choice it could not keep: the order stays and a toast says why', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    body();
    fireEvent.change(screen.getByRole('combobox', { name: 'Story Bible order' }), { target: { value: 'mentions-desc' } });
    expect(order()).toBe('name-asc');
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/Story Bible order.*not saved/i), 'error');
  });
});
