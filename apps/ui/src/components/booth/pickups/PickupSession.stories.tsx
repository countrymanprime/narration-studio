import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { PickupItem } from '../../../api/contracts/pickups';
import { PickupSession } from './PickupSession';
import type { PickupSessionModel } from './usePickupSession';

const line = (id: string, chapterId: string, script: string, time: number, extra: Partial<PickupItem> = {}): PickupItem => ({
  id,
  chapterId,
  paragraphId: `${id}-p`,
  paragraph: null,
  time,
  at: null,
  type: 'misread',
  script,
  context: '',
  source: 'you',
  confidence: null,
  confReason: '',
  included: true,
  done: false,
  waiting: false,
  ...extra,
});

const LINES = [
  line('a', 'c3', 'Off with her head, said the Queen.', 65, { done: true }),
  line('b', 'c3', 'The roses watched her go.', 142),
  line('c', 'c5', 'A new day began in the court, and nobody could say why the clocks had stopped at noon.', 18),
];

const session = (over: Partial<PickupSessionModel> = {}): PickupSessionModel => ({
  active: true,
  lines: LINES,
  open: LINES.filter((item) => !item.done).length,
  at: 'b',
  bars: [],
  jump: fn(),
  step: fn(),
  dismiss: fn(async () => undefined),
  takeStopped: fn(async () => 0),
  ...over,
});

const meta = {
  title: 'Booth/PickupSession',
  component: PickupSession,
  args: { session: session(), chapterLabel: (id: string) => `Ch ${id.slice(1)}` },
  decorators: [
    (Story) => (
      <div className="w-80 max-w-full bg-[var(--surface)] p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PickupSession>;

export default meta;
type Story = StoryObj<typeof meta>;

// Three lines, one recorded: two open, the second is the current one, and a click jumps.
export const ThreeLinesOneDone: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Pickups · 2 open')).toBeTruthy();
    await expect(canvas.getByRole('button', { name: /The roses watched her go/ }).getAttribute('aria-current')).toBe('true');
    await expect(canvas.getByText('Recorded')).toBeTruthy();
    await userEvent.click(canvas.getByRole('button', { name: /A new day began/ }));
    await expect(args.session.jump).toHaveBeenCalledWith('c');
  },
};

// A line the speech check found: tagged, and dismissible.
export const AutomaticLine: Story = {
  args: {
    session: session({
      lines: [...LINES, line('s', 'c3', 'down the hole', 90, { source: 'speech', gap: 'missing' })],
      open: 3,
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Automatic')).toBeTruthy();
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss: down the hole' }));
    await expect(args.session.dismiss).toHaveBeenCalledWith('s');
  },
};

// Every line recorded.
export const AllRecorded: Story = {
  args: { session: session({ lines: LINES.map((item) => ({ ...item, done: true })), open: 0, at: null }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Pickups · 0 open')).toBeTruthy();
  },
};

// Outside a session the section draws nothing.
export const NoSession: Story = {
  args: { session: session({ active: false, lines: [], open: 0, at: null }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('section')).toBeNull();
  },
};
