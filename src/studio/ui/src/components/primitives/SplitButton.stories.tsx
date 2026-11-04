import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SplitButton, SplitMain, SplitSide } from './SplitButton';
import { Icon } from './Icon';

const meta = { title: 'Primitives/SplitButton', component: SplitButton, args: { label: 'Recording', children: null } } satisfies Meta<typeof SplitButton>;

export default meta;
type Story = StoryObj<typeof meta>;

const onMain = fn();

// Record with its settings on the side: two parts, the main action and a caret that opens a menu or popover.
export const Default: Story = {
  render: () => (
    <SplitButton label="Recording">
      <SplitMain onClick={onMain}>
        <Icon name="record" />
        Record
      </SplitMain>
      <SplitSide label="Levels" aria-haspopup="dialog" />
    </SplitButton>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Record' }));
    await expect(onMain).toHaveBeenCalledOnce();
    await expect(canvas.getByRole('group', { name: 'Recording' })).toBeInTheDocument();
  },
};

// A cold read: the main button and the side take the recording colour as an outline, never the take's fill; the side's dot says listening needs attention.
export const ColdRead: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <SplitButton label="Recording">
        <SplitMain tone="cold">
          <Icon name="microphone" />
          Cold read
        </SplitMain>
        <SplitSide label="Levels" aria-haspopup="dialog" tone="cold" />
      </SplitButton>
      <SplitButton label="Recording">
        <SplitMain tone="cold">
          <Icon name="stop" />
          Stop
        </SplitMain>
        <SplitSide label="Levels" aria-haspopup="dialog" tone="cold" badge />
      </SplitButton>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Cold read' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  },
};

// Stop is the same button; a main that cannot start keeps `aria-disabled` so it stays focusable and can say why.
export const Stopping: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <SplitButton label="Recording">
        <SplitMain>
          <Icon name="stop" />
          Stop
        </SplitMain>
        <SplitSide label="Levels" aria-haspopup="dialog" />
      </SplitButton>
      <SplitButton label="Recording">
        <SplitMain aria-disabled>
          <Icon name="record" />
          Record
        </SplitMain>
        <SplitSide label="Levels" aria-haspopup="dialog" />
      </SplitButton>
    </div>
  ),
};
