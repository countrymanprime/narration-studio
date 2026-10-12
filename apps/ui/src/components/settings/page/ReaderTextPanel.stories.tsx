import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { ReaderTextView } from './ReaderTextPanel';

type Args = Parameters<typeof ReaderTextView>[0];

// The choices are held here, as the saved store holds them.
function Choosing(args: Args) {
  const [size, setSize] = useState(args.size);
  const [lineHeight, setLineHeight] = useState(args.lineHeight);
  const [font, setFont] = useState(args.font);
  return <ReaderTextView size={size} lineHeight={lineHeight} font={font} onSize={setSize} onLineHeight={setLineHeight} onFont={setFont} />;
}

const meta = {
  title: 'Settings/Page/ReaderTextPanel',
  component: ReaderTextView,
  args: { size: 40, lineHeight: 1.8, font: 'Georgia', onSize: fn(), onLineHeight: fn(), onFont: fn() },
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

export const LargeSerif: Story = { args: { size: 64, lineHeight: 2.2, font: 'Merriweather' } };
