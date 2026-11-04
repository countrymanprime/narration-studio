import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { TreeSelect, type TreeSelectRow } from './TreeSelect';

type Item = { id: string; label: string; level: number; parent: string; folder?: boolean };

const ITEMS: Item[] = [
  { id: 'narration', label: 'Narration', level: 1, parent: '', folder: true },
  { id: 'chapters', label: 'Chapters', level: 2, parent: 'narration', folder: true },
  { id: 'ch1', label: 'Chapter 1', level: 3, parent: 'chapters' },
  { id: 'ch4', label: 'Chapter 4: The Rabbit Sends in a Little Bill, read at length', level: 3, parent: 'chapters' },
  { id: 'intro', label: 'Intro', level: 1, parent: '' },
];

const pathOf = (item: Item): string => {
  const parent = ITEMS.find((candidate) => candidate.id === item.parent);
  return parent ? [pathOf(parent), parent.label].filter(Boolean).join(' / ') : '';
};

// The caller's part: it owns the search text and which folders are open, and turns its items into the rows showing.
function Picker({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(new Set(['narration', 'chapters']));
  const toggle = (id: string, wanted: boolean) =>
    setOpen((current) => {
      const next = new Set(current);
      if (wanted) next.add(id);
      else next.delete(id);
      return next;
    });
  const showing = (item: Item): boolean => {
    const parent = ITEMS.find((candidate) => candidate.id === item.parent);
    return !parent || (open.has(parent.id) && showing(parent));
  };
  const needle = query.trim().toLowerCase();
  const rows: TreeSelectRow[] = (needle ? ITEMS.filter((item) => item.label.toLowerCase().includes(needle)) : ITEMS.filter(showing)).map((item, at, list) => ({
    key: item.id,
    id: item.id,
    label: item.label,
    level: needle ? 1 : item.level,
    posInSet: at + 1,
    setSize: list.length,
    flat: needle ? true : undefined,
    note: needle ? pathOf(item) || undefined : undefined,
    folder: item.folder && !needle ? { open: open.has(item.id) } : undefined,
    disabledReason: item.folder ? 'A folder can’t be picked' : undefined,
  }));
  const picked = ITEMS.find((item) => item.id === value);
  return (
    <div className="max-w-sm">
      <TreeSelect
        label="Track for Chapter 4"
        value={value}
        shown={picked ? { path: pathOf(picked) || undefined, name: picked.label } : undefined}
        placeholder="Choose a track"
        searchLabel="Search tracks"
        query={query}
        onQueryChange={setQuery}
        sections={[{ rows }]}
        emptyText={(text) => `No track matches “${text}”`}
        onPick={setValue}
        onToggle={toggle}
        fullWidth
      />
    </div>
  );
}

// `TreeSelect` is the one non-native picker: `Select` stays a native `<select>` (docs/design/design-system.md), and a choice among nested items
// has no native control. Its closed box is `Select`'s (`selectBox.ts`), so the two read as one family.
const meta = { title: 'Primitives/TreeSelect', component: Picker, parameters: { layout: 'padded' } } satisfies Meta<typeof Picker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: () => <Picker />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Track for Chapter 4: Choose a track' })).toBeVisible();
  },
};

// A long name is cut at the caret; the path is capped at 40% of the box and ellipsized, so at 390 px it never shrinks to a bare letter beside the name (ux-reviewer, #2701).
export const PickedWithLongName: Story = {
  render: () => <Picker initial="ch4" />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: /^Track for Chapter 4: Narration \/ Chapters \/ Chapter 4/ })).toBeVisible();
  },
};

// The open tree with its folders, left open for the atlas to capture at 390 px: levels, carets, and a folder that cannot be picked.
export const OpenTree: Story = {
  render: () => <Picker />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^Track for Chapter 4/ }));
    const tree = await within(canvasElement.ownerDocument.body).findByRole('tree', { name: 'Track for Chapter 4' });
    await expect(
      within(tree)
        .getAllByRole('treeitem')
        .map((item) => item.getAttribute('aria-level')),
    ).toEqual(['1', '2', '3', '3', '1']);
    await expect(within(tree).getByRole('treeitem', { name: /^Narration/ })).toHaveAttribute('aria-disabled', 'true');
  },
};

// Open: the tree's levels and carets, a folder that cannot be picked, Right and Left to open and close a folder, a search that flattens the list.
export const OpenedAndSearched: Story = {
  render: () => <Picker />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^Track for Chapter 4/ }));
    const body = within(canvasElement.ownerDocument.body);
    const tree = await body.findByRole('tree', { name: 'Track for Chapter 4' });
    await expect(within(tree).getAllByRole('treeitem')).toHaveLength(5);
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowLeft}');
    await expect(within(tree).getAllByRole('treeitem')).toHaveLength(2);
    await userEvent.type(body.getByRole('textbox', { name: 'Search tracks' }), 'chapter 1');
    await expect(body.getAllByRole('treeitem')).toHaveLength(1);
  },
};
