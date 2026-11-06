import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { IndentGuides, TREE_INDENT, TreeCaret } from './TreeCaret';

// The parts of a tree row that the Tracks table and `TreeSelect` share: the caret of a folder and the guides of the levels above a row.
const meta = { title: 'Primitives/TreeCaret', component: TreeCaret, parameters: { layout: 'padded' } } satisfies Meta<typeof TreeCaret>;
export default meta;
type Story = StoryObj<typeof meta>;

// An open and a closed folder, and a row that is no folder (a blank of the same width, so the names line up), under two levels of guides.
export const Rows: Story = {
  render: () => (
    <div className={`max-w-sm ${TREE_INDENT}`}>
      {[
        { name: 'Narration', open: true, level: 1 },
        { name: 'Music', open: false, level: 2 },
        { name: undefined, open: false, level: 3 },
      ].map(({ name, open, level }) => (
        <div key={level} className="flex min-h-9 items-center gap-1.5 text-sm">
          <IndentGuides level={level} />
          <TreeCaret folderName={name} open={open} onToggle={() => undefined} />
          <span>{name ?? 'Chapter 1'}</span>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Close Narration' })).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByRole('button', { name: 'Open Music' })).toHaveAttribute('aria-expanded', 'false');
  },
};
