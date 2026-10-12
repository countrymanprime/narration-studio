import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ALL_DONE, CHAPTERS, MIXED } from './pickupFixtures';
import { SessionPanel } from './SessionPanel';

// The mock's "Pickup session" panel. The minutes are sourced (ADR 0015): a figure or "not measured yet", never a guess.
const meta = {
  title: 'Pickups/SessionPanel',
  component: SessionPanel,
  args: {
    pickups: MIXED,
    chapters: CHAPTERS,
    seconds: { ok: true, value: 330 },
    dawName: 'REAPER',
    markers: { available: true },
    onOpenInBooth: fn(),
    onAddMarkers: fn(),
  },
  render: (args) => (
    <div className="max-w-[18rem]">
      <SessionPanel {...args} />
    </div>
  ),
} satisfies Meta<typeof SessionPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IncludedLines: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^Open \d+ in Booth$/ }));
    await expect(args.onOpenInBooth).toHaveBeenCalled();
  },
};
export const NotMeasured: Story = { args: { seconds: { ok: false, reason: 'No measurement yet.' } } };
export const NothingToRecord: Story = { args: { pickups: ALL_DONE } };
export const DawWithoutMarkers: Story = { args: { markers: { available: false, message: 'Markers are turned off for REAPER in Settings.' } } };
