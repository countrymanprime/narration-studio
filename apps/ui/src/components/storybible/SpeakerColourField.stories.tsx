import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { SpeakerColourField } from './SpeakerColourField';

const meta = {
  title: 'Story Bible/SpeakerColourField',
  component: SpeakerColourField,
  args: { entity: { id: 'entry-1', category: 'Character' }, onChange: () => {} },
} satisfies Meta<typeof SpeakerColourField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Automatic: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('combobox', { name: 'Speaker colour' })).toHaveValue('auto');
  },
};

export const Chosen: Story = {
  args: { entity: { id: 'entry-1', category: 'Character', speaker_color: 4 } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('combobox', { name: 'Speaker colour' })).toHaveValue('4');
  },
};

export const DisabledWhileSaving: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('combobox', { name: 'Speaker colour' })).toBeDisabled();
  },
};
