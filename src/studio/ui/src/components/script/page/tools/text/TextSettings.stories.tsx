import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { DEFAULT_TEXT_PREFS, type TextPrefs } from './readerText';
import { TextSettings, TextSettingsPopover } from './TextSettings';

// The mock's text settings (`ui/TextSettings.tsx`): font, size, line spacing and column width, each with its current value.
function Controlled({ initial }: { initial: TextPrefs }) {
  const [prefs, setPrefs] = useState(initial);
  return (
    <div className="inline-block rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4">
      <TextSettings prefs={prefs} onChange={(change) => setPrefs((current) => ({ ...current, ...change }))} />
    </div>
  );
}

const meta = {
  title: 'Script/TextSettings',
  component: TextSettings,
  args: { prefs: DEFAULT_TEXT_PREFS, onChange: () => {} },
  render: (args) => <Controlled initial={args.prefs} />,
} satisfies Meta<typeof TextSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Defaults: Story = {};

export const Changed: Story = {
  args: { prefs: { font: 'Verdana', size: 28, spacing: 2.4, width: 100 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('28 px')).toBeVisible();
    await expect(canvas.getByText('Full')).toBeVisible();
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Font' }), 'Arial');
    await expect(canvas.getByRole('combobox', { name: 'Font' })).toHaveValue('Arial');
  },
};

export const InPopover: Story = {
  render: (args) => (
    <div className="flex justify-end p-4">
      <TextSettingsPopover prefs={args.prefs} onChange={() => {}} />
    </div>
  ),
};
