import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SplitButton, SplitMain, SplitSide, SplitToggle } from './SplitButton';
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

// A switch between the main action and the side: off it is a secondary button, on it takes the recording colour as an outline.
export const WithSwitch: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {[false, true].map((pressed) => (
        <SplitButton key={String(pressed)} label="Recording">
          <SplitMain>
            <Icon name="record" />
            Record
          </SplitMain>
          <SplitToggle pressed={pressed} hint="Follow your voice without recording">
            Cold read
          </SplitToggle>
          <SplitSide label="Levels" aria-haspopup="dialog" badge={pressed} />
        </SplitButton>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const toggles = within(canvasElement).getAllByRole('button', { name: 'Cold read' });
    await expect(toggles[0]).toHaveAttribute('aria-pressed', 'false');
    await expect(toggles[1]).toHaveAttribute('aria-pressed', 'true');
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
