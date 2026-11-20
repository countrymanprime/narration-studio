import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { Panel } from '../../primitives/Panel';
import { NextUp } from './NextUp';
import { WPH } from '../../schedule/estimates';
import { NEXT_UP_BUSY, NEXT_UP_EMPTY } from './pipelineFixtures';

/** What is drawn: the text without the hidden spoken copies of the figures. */
const drawn = (el: Element): string => {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('.sr-only').forEach((hidden) => hidden.remove());
  return copy.textContent ?? '';
};

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
    // "about" stays before an ordinary figure (it is dropped only before "<0h 01m").
    await expect(drawn(canvas.getByText(/% recorded · about /))).toMatch(/50% recorded · about 0h 30m of finished audio left/);
    canvas.getByRole('button', { name: 'Start timer on Chapter 4' }).click();
    await expect(args.timer.onStart).toHaveBeenCalledWith('c4', 'recording');
  },
};

export const Empty: Story = { args: { inputs: NEXT_UP_EMPTY } };
export const TimerRunning: Story = { args: { timer: { running: true, onStart: fn() } } };

// #3443: a chapter recorded to 99.5% reads 99% (as its Record cell does, never 100 before it is whole) and the few seconds left read "<0h 01m", never "0h 01m".
export const AlmostRecorded: Story = {
  args: { inputs: { ...NEXT_UP_BUSY, recording: { chapterId: 'c4', stage: 'recording', name: 'Chapter 4', words: WPH, share: 0.9999, percent: 99 } } },
  play: async ({ canvasElement }) => {
    const sub = within(canvasElement).getByText(/% recorded · /);
    await expect(drawn(sub)).toMatch(/^99% recorded · <0h 01m of finished audio left/);
    await expect(drawn(sub)).not.toMatch(/about <0h/);
  },
};
