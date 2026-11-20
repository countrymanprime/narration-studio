// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewChapterTracks, choiceOf, mergePick, type NewChapterPick } from './NewChapterTracks';

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

  // qa-breaker B9: a list cut at its cap says how many voices it leaves off.
  it('says how many voices are not listed when the list is cut at its cap', () => {
    render(<Harness initial={{ voices: [voice('Mara'), voice('Dragon')], extras: voice('Extras'), omitted: 7 }} />);
    expect(screen.getByText('7 more voices not listed.')).toBeTruthy();
    cleanup();
    render(<Harness initial={{ voices: [voice('Mara'), voice('Dragon')], extras: voice('Extras'), omitted: 1 }} />);
    expect(screen.getByText('1 more voice not listed.')).toBeTruthy();
    cleanup();
    render(<Harness initial={{ voices: [voice('Mara')], extras: voice('Extras') }} />);
    expect(screen.queryByText(/not listed/)).toBeNull();
  });

  // qa-breaker B2: what Create sends is what the list showed: the ticked voices, and the unticked ones as what is left out.
  it('the choice names the ticked voices and the unticked ones the list showed', () => {
    expect(choiceOf({ voices: [voice('Mara'), voice('Dragon', false), voice('King')], extras: voice('Extras', false) })).toEqual({
      voices: ['Mara', 'King'],
      skipped: ['Dragon'],
      extras: false,
    });
  });

  it("a list read again keeps the ticks made and takes the host's for a voice that is new", () => {
    const merged = mergePick(
      { voices: [voice('Mara'), voice('Dragon'), voice('King', false)], extras: voice('Extras') },
      { voices: [voice('Mara', false), voice('Dragon')], extras: voice('Extras', false) },
    );
    expect(merged).toEqual({ voices: [voice('Mara', false), voice('Dragon'), voice('King', false)], extras: voice('Extras', false) });
  });

  // qa-breaker B5: a name with no break in it wraps inside the list instead of widening it.
  it('lets a long unbroken name wrap anywhere, and keeps the label and the list shrinkable', () => {
    const long = 'W'.repeat(200);
    render(<Harness initial={{ voices: [voice(long), voice('Mara')], extras: voice('Extras') }} />);
    const name = screen.getByTitle(long);
    expect(name.className).toContain('[overflow-wrap:anywhere]');
    expect(screen.getByRole('list').className).toContain('min-w-0');
    expect(name.closest('label')?.className).toContain('min-w-0');
    expect(name.parentElement?.className).toContain('min-w-0');
  });

  // Walkthrough: a lone voice is not indented under the Narrator as if it were the Narrator's child; the indent is for the voices under "All N".
  it('indents the voices only under an All box', () => {
    render(<Harness initial={{ voices: [voice('Mara')], extras: voice('Extras') }} />);
    expect(screen.getByRole('list').className).not.toContain('pl-6');
    cleanup();
    render(<Harness initial={{ voices: [voice('Mara'), voice('Dragon')], extras: voice('Extras') }} />);
    expect(screen.getByRole('list').className).toContain('pl-6');
  });
});
