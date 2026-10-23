import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { NEUTRAL_PROFILE } from '../schedule/profiles';
import { ImportProfileField } from './ImportProfileField';

function Controlled({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <ImportProfileField value={value} onChange={setValue} />;
}

const meta = {
  title: 'Delivery/ImportProfileField',
  component: ImportProfileField,
  args: { value: NEUTRAL_PROFILE, onChange: () => {} },
  render: (args) => <Controlled initial={args.value} />,
} satisfies Meta<typeof ImportProfileField>;

export default meta;
type Story = StoryObj<typeof meta>;

// The field as the import review draws it for a project with no profile chosen.
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('combobox', { name: 'Delivery profile' })).toBeTruthy();
  },
};
