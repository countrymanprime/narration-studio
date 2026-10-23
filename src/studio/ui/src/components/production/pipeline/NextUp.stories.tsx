import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { Panel } from '../../primitives/Panel';
import { NextUp } from './NextUp';
import { NEXT_UP_BUSY, NEXT_UP_EMPTY } from './pipelineFixtures';

const meta = {
  title: 'Production/NextUp',
  component: NextUp,
  args: { inputs: NEXT_UP_BUSY, record: { ok: true, reason: '' }, onGo: fn(), timer: { running: false, onStart: fn() } },
  render: (args) => (
    <div className="max-w-[26rem]">
      <Panel title="Next up">
        <NextUp {...args} />
      </Panel>
    </div>
  ),
} satisfies Meta<typeof NextUp>;

export default meta;
type Story = StoryObj<typeof meta>;

// Ranked by work-hours at risk; each item has a title, a sub line and one action, and the recording item also starts the stage timer.
export const Ranked: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('button', { name: 'Start timer on Chapter 4' }).click();
    await expect(args.timer.onStart).toHaveBeenCalledWith('c4', 'recording');
  },
};

export const Empty: Story = { args: { inputs: NEXT_UP_EMPTY } };
// The record capability's own sentence sits beside the disabled button.
export const DawCannotRecord: Story = { args: { record: { ok: false, reason: 'Recording needs a connected recorder.' } } };
export const TimerRunning: Story = { args: { timer: { running: true, onStart: fn() } } };
