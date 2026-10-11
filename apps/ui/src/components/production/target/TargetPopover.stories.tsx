import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { MIN_OWN_RATE_CHAPTERS, WPH } from '../../schedule/estimates';
import { ownRate, targetHours, type PaceChapter } from './pace.selectors';
import { TargetPopover } from './TargetPopover';

const CHAPTERS: PaceChapter[] = [
  { id: '1', tag: 'Ch 1', words: 2000 },
  { id: '2', tag: 'Ch 2', words: 2500 },
  { id: '3', tag: 'Ch 3', words: 4000 },
  { id: '4', tag: 'Ch 4', words: 2351 },
];
const MEASURED = ownRate(CHAPTERS, { ok: true, value: { '1': 685, '2': 670, '4': 868 } }, MIN_OWN_RATE_CHAPTERS);
const UNMEASURED = ownRate(CHAPTERS, { ok: true, value: { '1': 685, '2': 670 } }, MIN_OWN_RATE_CHAPTERS);

const meta = {
  title: 'Production/TargetPopover',
  component: TargetPopover,
  args: { own: MEASURED, hours: targetHours(CHAPTERS, MEASURED, WPH), basis: 'standard', onBasis: fn() },
  // The popover draws on the surface, so axe measures contrast against it and not the page background.
  decorators: [
    (Story) => (
      <div className="w-fit rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TargetPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

// The mock's popover when the narrator's rate is not measured yet: a dash, the reason, and no "Your pace".
export const NotMeasured: Story = {
  args: { own: UNMEASURED, hours: targetHours(CHAPTERS, UNMEASURED, WPH) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: 'Your pace' })).toBeNull();
  },
};

export const MeasuredOwnChosen: Story = {
  args: { basis: 'own' },
  play: async ({ canvasElement, args }) => {
    const view = within(canvasElement);
    await expect(view.getByRole('button', { name: 'Your pace' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(view.getByRole('button', { name: 'Standard' }));
    await expect(args.onBasis).toHaveBeenCalledWith('standard');
  },
};

export const MeasuredStandardChosen: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Your pace' }));
    await expect(args.onBasis).toHaveBeenCalledWith('own');
  },
};
