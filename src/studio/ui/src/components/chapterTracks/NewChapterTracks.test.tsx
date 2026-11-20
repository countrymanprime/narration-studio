// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewChapterTracks, type NewChapterPick } from './NewChapterTracks';

afterEach(cleanup);

const voice = (name: string, checked = true) => ({ name, checked });

function Harness({ initial, onChange }: { initial: NewChapterPick; onChange?: (pick: NewChapterPick) => void }) {
  const [pick, setPick] = useState(initial);
  return (
    <NewChapterTracks
      narrator="Narrator"
      pick={pick}
      onChange={(next) => {
        setPick(next);
        onChange?.(next);
      }}
    />
  );
}

describe('the checklist of a new chapter folder (#3748)', () => {
  it('states the Narrator as always made, with no box to untick, then the voices and Extras in order', () => {
    render(<Harness initial={{ voices: [voice('Mara'), voice('Dragon')], extras: voice('Extras') }} />);
    const group = screen.getByRole('group', { name: 'Tracks in the new folder' });
    expect(within(group).getByText('Narrator (always)')).toBeTruthy();
    expect(within(group).queryByRole('checkbox', { name: /Narrator/ })).toBeNull();
    const boxes = within(group)
      .getAllByRole('checkbox')
      .map((box) => box.closest('label')?.textContent);
    expect(boxes).toEqual(['All 2 voices', 'Mara', 'Dragon', 'Extras']);
  });

  it('has no All box for one voice, and only Extras when the project has no voice', () => {
    render(<Harness initial={{ voices: [voice('Mara')], extras: voice('Extras') }} />);
    expect(screen.queryByRole('checkbox', { name: /All/ })).toBeNull();
    cleanup();
    render(<Harness initial={{ voices: [], extras: voice('Extras') }} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('shows All as mixed while some voices are ticked, and one press ticks or clears every voice', () => {
    const changes = vi.fn();
    render(<Harness initial={{ voices: [voice('Mara'), voice('Dragon', false)], extras: voice('Extras') }} onChange={changes} />);
    const all = screen.getByRole('checkbox', { name: 'All 2 voices' });
    expect(all.getAttribute('aria-checked')).toBe('mixed');
    fireEvent.click(all);
    expect(changes).toHaveBeenLastCalledWith({ voices: [voice('Mara'), voice('Dragon')], extras: voice('Extras') });
    fireEvent.click(screen.getByRole('checkbox', { name: 'All 2 voices' }));
    expect(changes).toHaveBeenLastCalledWith({ voices: [voice('Mara', false), voice('Dragon', false)], extras: voice('Extras') });
  });

  it('unticks one voice and Extras on their own', () => {
    const changes = vi.fn();
    render(<Harness initial={{ voices: [voice('Mara'), voice('Dragon')], extras: voice('Extras') }} onChange={changes} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dragon' }));
    expect(changes).toHaveBeenLastCalledWith({ voices: [voice('Mara'), voice('Dragon', false)], extras: voice('Extras') });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Extras' }));
    expect(changes).toHaveBeenLastCalledWith({ voices: [voice('Mara'), voice('Dragon', false)], extras: voice('Extras', false) });
  });

  it('keeps hostile names whole: emoji, right to left, very long, and many voices in a list that scrolls inside its own cap', () => {
    const long = 'Lady Bracknell of the Very Long Name '.repeat(8).trim();
    const many = Array.from({ length: 80 }, (_, index) => voice(`Voice ${index}`));
    render(<Harness initial={{ voices: [voice('Dragon 🐉'), voice('مرحبا'), voice(long), ...many], extras: voice('Extras') }} />);
    expect(screen.getByRole('checkbox', { name: 'Dragon 🐉' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'مرحبا' })).toBeTruthy();
    expect(screen.getByTitle(long).getAttribute('dir')).toBe('auto');
    const list = screen.getByRole('list');
    expect(list.className).toContain('max-h-32');
    expect(list.className).toContain('overflow-y-auto');
    // The buttons below stay reachable: Extras is outside the scrolling list.
    expect(list.contains(screen.getByRole('checkbox', { name: 'Extras' }))).toBe(false);
  });
});
