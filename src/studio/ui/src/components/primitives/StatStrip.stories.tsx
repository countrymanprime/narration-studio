import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { StatStrip } from './StatStrip';

// The benchmark's one-card KPI strip (mock B01): six StatTiles divided by a rule instead of six separate cards.
const meta = {
  title: 'Primitives/StatStrip',
  component: StatStrip,
  args: {
    items: [
      { key: 'finished', label: 'Finished audio', value: '1:52 / 3:08', progress: 0.61 },
      { key: 'logged', label: 'Work time logged', value: '11:20', hint: 'record 5:40 · edit 3:55 · proof 1:45' },
      { key: 'pfh', label: 'Hours per finished hr', value: '6.1', unit: ': 1', hint: 'your last 5 books avg 6.4' },
      { key: 'rate', label: 'Effective rate', value: '$37', unit: '/hr', hint: 'at $225 PFH' },
      { key: 'pickups', label: 'Open pickups', value: '9', tone: 'warning', hint: '≈ 6 min booth time' },
      { key: 'delivery', label: 'Delivery check', value: '7', unit: '/ 12', hint: 'pass ACX · 1 fail · 4 pending', tone: 'danger' },
    ],
  },
} satisfies Meta<typeof StatStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('list', { name: 'Figures' })).toBeVisible();
    await expect(canvas.getByText('Finished audio')).toBeVisible();
    await expect(canvas.getByText('Open pickups')).toBeVisible();
  },
};

export const ThreeTiles: Story = {
  args: {
    items: [
      { key: 'recorded', label: 'Recorded', value: '97%' },
      { key: 'length', label: 'Length', value: '11:48' },
      { key: 'saved', label: 'Saved', value: '10:02', hint: 'current for the project' },
    ],
  },
};

// Production's work-time strip in a narrow card (the two-column step): the long label wraps and its neighbour's value stays on its line, and the
// odd third tile takes the whole row rather than sitting beside a blank half (alignment audit XPR2-16, R4TA-6).
const TIMER_FIGURES = [
  { key: 'logged', label: 'Work time logged', value: '20:00', hint: 'record 8:00 · edit 7:00' },
  { key: 'pfh', label: 'Hours per finished hour', value: '12.3', unit: ': 1', hint: 'this book' },
  { key: 'rate', label: 'Effective rate', value: '$18', unit: '/hr', hint: 'at $225 PFH' },
];

export const OddCountNarrow: Story = {
  args: { items: TIMER_FIGURES, label: 'Stage timer figures', className: 'w-[23rem]' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole('list', { name: 'Stage timer figures' });
    const [first, second, third] = Array.from(list.querySelectorAll('li'));
    await expect(Math.round(canvas.getByText('20:00').getBoundingClientRect().top)).toBe(Math.round(canvas.getByText('12.3').getBoundingClientRect().top));
    await expect(Math.round(first!.getBoundingClientRect().top)).toBe(Math.round(second!.getBoundingClientRect().top));
    await expect(Math.round(third!.getBoundingClientRect().width)).toBe(Math.round(list.getBoundingClientRect().width));
  },
};

// The half step (36 to 64 rem) draws three tiles as one row of three, not two and a lone one.
export const OddCountHalfStep: Story = {
  args: { items: TIMER_FIGURES, label: 'Stage timer figures', className: 'w-[44rem]' },
  play: async ({ canvasElement }) => {
    const items = Array.from(within(canvasElement).getByRole('list', { name: 'Stage timer figures' }).querySelectorAll('li'));
    const tops = items.map((item) => Math.round(item.getBoundingClientRect().top));
    await expect(new Set(tops).size).toBe(1);
  },
};
