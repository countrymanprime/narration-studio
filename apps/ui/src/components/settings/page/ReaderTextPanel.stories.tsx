import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { ReaderTextView } from './ReaderTextPanel';

type Args = Parameters<typeof ReaderTextView>[0];

// The choices are held here, as the saved store holds them.
function Choosing(args: Args) {
  const [prefs, setPrefs] = useState(args.prefs);
  return <ReaderTextView prefs={prefs} onChange={(change) => setPrefs((current) => ({ ...current, ...change }))} />;
}

const meta = {
  title: 'Settings/Page/ReaderTextPanel',
  component: ReaderTextView,
  args: { prefs: { font: 'Georgia', size: 20, spacing: 1.8, width: 64 }, onChange: fn() },
  render: (args) => <Choosing {...args} />,
  decorators: [
    (Story) => (
      <div className="max-w-[860px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReaderTextView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Defaults: Story = {};

export const LargeSerif: Story = { args: { prefs: { font: 'Merriweather', size: 32, spacing: 2.2, width: 100 } } };
