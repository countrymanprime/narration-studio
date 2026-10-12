import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { RecordingEngine } from '../../../api/contracts/recording';
import { RecordingPanelView, type RecordingPanelViewProps } from './RecordingPanel';

// The choice is held here, as RecordingPanel holds the host's answer.
function Choosing(props: RecordingPanelViewProps) {
  const [engine, setEngine] = useState(props.engine);
  return (
    <RecordingPanelView
      {...props}
      engine={engine}
      onChoose={(next: RecordingEngine) => {
        props.onChoose(next);
        setEngine(next);
      }}
    />
  );
}

const meta = {
  title: 'Settings/Page/RecordingPanel',
  component: RecordingPanelView,
  args: { daw: 'REAPER', engine: 'daw', onChoose: fn() },
  render: (args) => <Choosing {...args} />,
  decorators: [
    (Story) => (
      <div className="max-w-[860px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RecordingPanelView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DawChosen: Story = {};

// The report names REAPER whether or not it is running, and the choice stays on it.
export const DawChosenWhileNotRunning: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement)
        .getByRole('radio', { name: /^REAPER\./ })
        .getAttribute('aria-checked'),
    ).toBe('true');
  },
};

export const BuiltInChosen: Story = { args: { engine: 'builtin' } };

export const ChoosesBuiltIn: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('radio', { name: /^Built-in recorder/ }));
    await expect(args.onChoose).toHaveBeenCalledWith('builtin');
  },
};

export const Refused: Story = { args: { error: 'stop the take before changing how the project records' } };

export const Reading: Story = { args: { daw: undefined, engine: undefined } };
