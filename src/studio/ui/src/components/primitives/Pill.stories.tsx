import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Pill } from './Pill';

const meta = {
  title: 'Primitives/Pill',
  component: Pill,
  args: { label: '10m', active: false, onClick: fn() },
} satisfies Meta<typeof Pill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inactive: Story = {};
// The selected pill: accent fill, so its label must use the contrast colour.
export const Active: Story = { args: { active: true } };
export const Disabled: Story = { args: { disabled: true } };
// Off with a reason: the chip stays focusable and hoverable (a native `disabled` takes neither), says why on focus, and a press does nothing.
export const DisabledWithReason: Story = {
  args: { disabledReason: 'Open a project to see what it sets' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const chip = canvas.getByRole('button', { name: '10m' });
    await expect(chip.getAttribute('aria-disabled')).toBe('true');
    await expect(chip.hasAttribute('disabled')).toBe(false);
    await expect(document.getElementById(chip.getAttribute('aria-describedby')!)?.textContent).toBe('Open a project to see what it sets');
    await userEvent.tab();
    await expect(chip).toHaveFocus();
    await waitFor(() => expect(within(document.body).getByRole('tooltip')).toHaveTextContent('Open a project to see what it sets'));
    await userEvent.click(chip);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
export const WithTooltip: Story = { args: { title: 'Jump ten minutes ahead' } };

export const ClickSelects: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '10m' }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

// Base UI's Toggle gives the chip aria-pressed, so a screen reader hears which chip is selected.
export const AnnouncesItsPressedState: Story = {
  render: (args) => (
    <div className="flex gap-2">
      <Pill {...args} label="small" active={false} />
      <Pill {...args} label="medium" active />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'small', pressed: false })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'medium', pressed: true })).toBeVisible();
  },
};

// The list filter: 28 px, a round pill in sentence case, the ink fill when pressed.
export const FilterInactive: Story = { args: { look: 'filter', label: 'To review 5' } };
export const FilterActive: Story = { args: { look: 'filter', label: 'All 14', active: true } };
