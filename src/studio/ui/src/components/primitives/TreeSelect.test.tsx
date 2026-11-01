// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TreeSelect, type TreeSelectRow, type TreeSelectSection } from './TreeSelect';

afterEach(cleanup);

const row = (id: string, level: number, extra: Partial<TreeSelectRow> = {}): TreeSelectRow => ({
  key: id,
  id,
  label: id,
  level,
  posInSet: 1,
  setSize: 1,
  ...extra,
});

const SECTIONS: TreeSelectSection[] = [
  { heading: 'Best match', rows: [row('Ch 4', 1, { note: 'Narration / Chapters' })] },
  {
    heading: 'Other tracks',
    rows: [
      row('Narration', 1, { folder: { open: true }, disabledReason: 'No audio of its own' }),
      row('Ch 1', 2, { note: 'linked to Chapter 1' }),
      row('Ch 4', 2, { key: 'ch4-again' }),
      row('Music', 1, { folder: { open: false }, disabledReason: 'No audio of its own' }),
    ],
  },
];

function setup(extra: Partial<Parameters<typeof TreeSelect>[0]> = {}) {
  const onPick = vi.fn();
  const onToggle = vi.fn();
  const onQueryChange = vi.fn();
  render(
    <TreeSelect
      label="Pick one"
      searchLabel="Search items"
      placeholder="Choose one"
      emptyText={(query) => `Nothing matches “${query}”`}
      value=""
      query=""
      sections={SECTIONS}
      onPick={onPick}
      onToggle={onToggle}
      onQueryChange={onQueryChange}
      {...extra}
    />,
  );
  return { onPick, onToggle, onQueryChange };
}

const openIt = () => userEvent.click(screen.getByRole('button', { name: /^Pick one/ }));

describe('TreeSelect', () => {
  it('shows the placeholder, names the trigger with it, and is a button that opens a popup', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Pick one: Choose one' });
    expect(trigger.textContent).toBe('Choose one');
    await openIt();
    expect(screen.getAllByRole('tree').map((tree) => tree.getAttribute('aria-label'))).toEqual(['Best match', 'Other tracks']);
  });

  it('names the pick with its path in the trigger and marks its row selected', async () => {
    setup({ value: 'Ch 1', shown: { path: 'Narration', name: 'Ch 1' }, sections: [{ rows: SECTIONS[1].rows }] });
    const trigger = screen.getByRole('button', { name: 'Pick one: Narration / Ch 1' });
    expect(trigger.textContent?.replaceAll(' ', ' ')).toBe('Narration / Ch 1');
    await userEvent.click(trigger);
    expect(screen.getByRole('tree', { name: 'Pick one' })).toBeTruthy();
    expect(screen.getByRole('treeitem', { name: /^Ch 1/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('caps the path and keeps the name flexible, so a long path cannot shrink to a bare letter at 390 px', () => {
    setup({ value: 'Ch 1', shown: { path: 'Narration / Chapters', name: 'Ch 1' } });
    const path = screen.getByText(/^Narration \/ Chapters/);
    expect(path.className).toContain('max-w-[40%]');
    expect(path.className).toContain('flex-none');
    expect(path.className).toContain('truncate');
    expect(path.className).not.toMatch(/shrink/);
    expect(screen.getByText('Ch 1').className).toContain('flex-1');
  });

  it('puts each row at its level, place and open state', async () => {
    setup();
    await openIt();
    const other = screen.getByRole('tree', { name: 'Other tracks' });
    const items = within(other).getAllByRole('treeitem');
    expect(items.map((item) => item.getAttribute('aria-level'))).toEqual(['1', '2', '2', '1']);
    expect(items.map((item) => item.getAttribute('aria-expanded'))).toEqual(['true', null, null, 'false']);
    expect(within(other).getByText('linked to Chapter 1')).toBeTruthy();
  });

  it('keeps one tab stop, on the first row until focus moves', async () => {
    setup();
    await openIt();
    const stops = screen.getAllByRole('treeitem').filter((item) => item.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0].textContent).toContain('Ch 4');
  });

  it('shows a disabled row with its reason and toggles its folder instead of picking it', async () => {
    const { onPick, onToggle } = setup();
    await openIt();
    const narration = within(screen.getByRole('tree', { name: 'Other tracks' })).getByRole('treeitem', { name: /Narration/ });
    expect(narration.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(narration);
    expect(onPick).not.toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalledWith('Narration', false);
  });

  it('picks a row on click and closes', async () => {
    const { onPick } = setup();
    await openIt();
    await userEvent.click(within(screen.getByRole('tree', { name: 'Other tracks' })).getByRole('treeitem', { name: /^Ch 1/ }));
    expect(onPick).toHaveBeenCalledWith('Ch 1');
    expect(screen.queryByRole('tree', { name: 'Other tracks' })).toBeNull();
  });

  it('moves from the search box into the tree with Down, and Enter picks', async () => {
    const { onPick } = setup();
    await openIt();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement?.getAttribute('role')).toBe('treeitem');
    await userEvent.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith('Ch 4');
  });

  it('opens and closes a folder with Right and Left', async () => {
    const { onToggle } = setup();
    await openIt();
    within(screen.getByRole('tree', { name: 'Other tracks' }))
      .getByRole('treeitem', { name: /Music/ })
      .focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onToggle).toHaveBeenCalledWith('Music', true);
  });

  it('reports what is typed in the search box and says so when nothing matches', async () => {
    const { onQueryChange } = setup();
    await openIt();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search items' }), 'q');
    expect(onQueryChange).toHaveBeenCalledWith('q');
    cleanup();
    setup({ query: ' zzz ', sections: [] });
    await openIt();
    expect(screen.getByText('Nothing matches “zzz”')).toBeTruthy();
  });

  it('hides the caret and guides of a flat (searching) row', async () => {
    setup({ sections: [{ rows: [row('Ch 1', 1, { flat: true, note: 'Narration' })] }] });
    await openIt();
    expect(screen.queryByRole('button', { name: /^(Open|Close) / })).toBeNull();
  });
});
