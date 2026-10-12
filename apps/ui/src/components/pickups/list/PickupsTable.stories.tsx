import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ALL_DONE, CHAPTERS, MIXED, SPEECH } from './pickupFixtures';
import { PickupsTable } from './PickupsTable';
import { SessionPanel } from './SessionPanel';

// The mock's Pickups page (Pickups.tsx): the list on the left, the session panel on the right. The page that wires the host is SN-Q9's.
const meta = {
  title: 'Pickups/PickupsTable',
  component: PickupsTable,
  args: {
    pickups: MIXED,
    chapters: CHAPTERS,
    scope: 'all',
    currentChapterId: 'c1',
    chaptersToCheck: ['c2'],
    daw: { available: true },
    onScope: fn(),
    onStep: fn(),
    onCheck: fn(),
    onAdd: fn(),
    onSetIncluded: fn(),
    onSetDone: fn(),
    onRemove: fn(),
    onOpenInBooth: fn(),
    onOpenInScript: fn(),
    onGoToProof: fn(),
  },
  render: (args) => (
    <div className="grid grid-cols-1 items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_18rem]">
      <PickupsTable {...args} />
      <SessionPanel
        pickups={args.scope === 'all' ? args.pickups : args.pickups.filter((p) => p.chapterId === args.scope)}
        chapters={args.chapters}
        seconds={{ ok: true, value: 330 }}
        dawName="REAPER"
        markers={{ available: args.daw.available }}
        onOpenInBooth={args.onOpenInBooth}
        onAddMarkers={fn()}
      />
    </div>
  ),
} satisfies Meta<typeof PickupsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

// Several chapters, every source: speech with and without a score, audio, a proof note, and a line added by hand.
export const SeveralChapters: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByRole('button', { name: 'Open in Booth at this line' })[0]);
    await expect(args.onOpenInBooth).toHaveBeenCalledWith([SPEECH]);
  },
};
export const AllRecorded: Story = { args: { pickups: ALL_DONE } };
export const ScopedToOneChapter: Story = { args: { scope: 'c2' } };
export const NothingQueued: Story = { args: { pickups: [] } };
export const NoneInThisChapter: Story = { args: { pickups: [SPEECH], scope: 'c3' } };
// Without the DAW the recording check and the markers are off.
export const DawWithoutMarkers: Story = { args: { daw: { available: false, message: 'REAPER is not open.' } } };
