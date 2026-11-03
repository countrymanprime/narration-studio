// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchList } from './SearchList';

afterEach(cleanup);

const NAMES = ['Narrator', 'White Rabbit', 'Extras'];

function Harness({ onPick, onKey }: { onPick: (id: string) => void; onKey?: Parameters<typeof SearchList>[0]['onKey'] }) {
  const [query, setQuery] = useState('');
  const options = NAMES.filter((name) => name.toLowerCase().includes(query.toLowerCase())).map((name) => ({ id: name, label: name }));
  return (
    <SearchList
      id="t"
      label="Voices"
      searchLabel="Search voices"
      query={query}
      onQueryChange={setQuery}
      options={options}
      onPick={onPick}
      onKey={onKey}
      empty="No voice matches."
    />
  );
}

describe('SearchList', () => {
  it('the box drives the list: arrows move the highlight and Enter picks it', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    const box = screen.getByRole('combobox', { name: 'Search voices' });
    expect(document.activeElement).toBe(box);
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box.getAttribute('aria-activedescendant')).toBe('t-option-Extras');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('Extras');
  });

  it('a new query highlights the first match, and no match says so', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    const box = screen.getByRole('combobox', { name: 'Search voices' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.change(box, { target: { value: 'rab' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('White Rabbit');
    fireEvent.change(box, { target: { value: 'zzz' } });
    expect(screen.getByText('No voice matches.')).toBeTruthy();
    onPick.mockClear();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onPick).not.toHaveBeenCalled();
  });

  it('a key the caller handles is not handled again', () => {
    const onPick = vi.fn();
    const onKey = vi.fn((event: { key: string; ctrlKey: boolean }) => event.key === 'Enter' && event.ctrlKey);
    render(<Harness onPick={onPick} onKey={onKey} />);
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search voices' }), { key: 'Enter', ctrlKey: true });
    expect(onKey).toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });
});
