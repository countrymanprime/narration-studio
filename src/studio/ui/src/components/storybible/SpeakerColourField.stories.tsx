import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { SpeakerColourField } from './SpeakerColourField';

const meta = {
  title: 'Story Bible/SpeakerColourField',
  component: SpeakerColourField,
  args: { entity: { id: 'entry-1' }, speaks: true, onChange: () => {} },
} satisfies Meta<typeof SpeakerColourField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Automatic: Story = {
  play: async ({ canvasElement }) => {
    const group = within(canvasElement).getByRole('radiogroup', { name: 'Speaker colour' });
    await expect(within(group).getByRole('radio', { name: /^Automatic \(/ })).toHaveAttribute('aria-checked', 'true');
  },
};

export const Chosen: Story = {
  args: { entity: { id: 'entry-1', speaker_color: 4 } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('radio', { name: 'Red' })).toHaveAttribute('aria-checked', 'true');
  },
};

export const DisabledWhileSaving: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('radiogroup', { name: 'Speaker colour' })).toHaveAttribute('aria-busy', 'true');
  },
};

export const ReadOnly: Story = {
  args: { entity: { id: 'entry-1', speaker_color: 4 }, readOnly: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Red')).toBeVisible();
    await expect(within(canvasElement).queryByRole('radiogroup')).toBeNull();
  },
};
