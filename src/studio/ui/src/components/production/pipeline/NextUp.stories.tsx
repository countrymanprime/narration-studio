import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { Panel } from '../../primitives/Panel';
import { NextUp } from './NextUp';
import { WPH } from '../../schedule/estimates';
import { NEXT_UP_BUSY, NEXT_UP_EMPTY } from './pipelineFixtures';

const meta = {
  title: 'Production/NextUp',
  component: NextUp,
  args: { inputs: NEXT_UP_BUSY, onGo: fn(), timer: { running: false, onStart: fn() } },
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
export const TimerRunning: Story = { args: { timer: { running: true, onStart: fn() } } };

// #3443: a chapter recorded to 99.5% reads 99% (as its Record cell does, never 100 before it is whole) and the few seconds left read "<0h 01m", never "0h 01m".
export const AlmostRecorded: Story = {
  args: { inputs: { ...NEXT_UP_BUSY, recording: { chapterId: 'c4', stage: 'recording', name: 'Chapter 4', words: WPH, share: 0.9999 } } },
  play: async ({ canvasElement }) => {
    const sub = within(canvasElement).getByText(/recorded · about/);
    await expect(sub.textContent).toMatch(/^99% recorded · about <0h 01m/);
  },
};
