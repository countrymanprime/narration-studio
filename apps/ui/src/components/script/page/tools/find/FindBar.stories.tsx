import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { FindBar } from './FindBar';
import { searchManuscript } from './searchManuscript';

// The mock's Find bar (`pages/script/FindBar.tsx`): the box, "3 of 12", previous, next, results and close, with the result list
// under it. Under two characters it searches nothing; with no match it says "No matches".
const PARAGRAPHS = [
  { id: 'p1', chapterId: 'c1', text: 'The queen said nothing for a long while, and the queen watched the garden gate until the light had gone.' },
  { id: 'p2', chapterId: 'c1', text: 'Nobody answered.' },
  { id: 'p3', chapterId: 'c2', text: 'A third queen waited by the river, where the queen of another country had once stood.' },
];
const LOCATIONS: Record<string, string> = { c1: 'Chapter 1', c2: 'Chapter 2' };

const meta = {
  title: 'Script/FindBar',
  component: FindBar,
  args: {
    find: { open: true, q: '', i: 0, list: true },
    nonce: 0,
    matches: [],
    locationOf: (match) => LOCATIONS[match.chapterId] ?? match.chapterId,
    onQuery: fn(),
    onStep: fn(),
    onPick: fn(),
    onToggleList: fn(),
    onClose: fn(),
    returnFocus: fn(),
  },
  render: (args) => (
    <div className="bg-[var(--surface)]">
      <FindBar {...args} />
    </div>
  ),
} satisfies Meta<typeof FindBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const Matches: Story = {
  args: { find: { open: true, q: 'queen', i: 1, list: false }, matches: searchManuscript(PARAGRAPHS, 'queen') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status')).toHaveTextContent('2 of 4');
    await userEvent.click(canvas.getByRole('button', { name: /Next match/ }));
    await expect(args.onStep).toHaveBeenCalledWith(1);
    await userEvent.click(canvas.getByRole('button', { name: /Close search/ }));
    await expect(args.onClose).toHaveBeenCalled();
    await expect(args.returnFocus).toHaveBeenCalled();
  },
};

export const NoMatches: Story = {
  args: { find: { open: true, q: 'zzzz', i: 0, list: true } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('No matches');
  },
};

export const ListOpen: Story = {
  args: { find: { open: true, q: 'queen', i: 2, list: true }, matches: searchManuscript(PARAGRAPHS, 'queen') },
  play: async ({ canvasElement, args }) => {
    const rows = within(canvasElement).getAllByRole('button', { name: /queen/ });
    await expect(rows).toHaveLength(4);
    await expect(rows[2]).toHaveAttribute('aria-current', 'true');
    await userEvent.click(rows[3] as HTMLElement);
    await expect(args.onPick).toHaveBeenCalledWith(3);
  },
};
