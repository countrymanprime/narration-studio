import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ResumeOfferLine } from './ResumeOffer';

// The mock's top bar: the offer sits on the Booth's own bar beside the progress readout.
const onTopBar: Decorator = (Story) => (
  <div className="flex h-13 max-w-full items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5">
    <Story />
  </div>
);

const meta = {
  title: 'Booth/ResumeOffer',
  component: ResumeOfferLine,
  args: { onChoose: fn(), state: { kind: 'none' } },
  decorators: [onTopBar],
} satisfies Meta<typeof ResumeOfferLine>;

export default meta;
type Story = StoryObj<typeof meta>;

// A recording ending in ¶ 4, read from the live project: choosing it only reports the place.
export const Offered: Story = {
  args: { state: { kind: 'offer', offer: { paragraphId: 'p4', word: 12, paragraph: 4, source: 'live', confident: true } } },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Resume at ¶ 4' }));
    await expect(args.onChoose).toHaveBeenCalledWith({ paragraphId: 'p4', word: 12 });
  },
};
// The saved project's estimate says it is not sure.
export const Estimated: Story = {
  args: { state: { kind: 'offer', offer: { paragraphId: 'p4', word: 12, paragraph: 4, source: 'saved', confident: false } } },
};
// Where the last take stopped, kept by the Booth, wins over the DAW.
export const Remembered: Story = {
  args: { state: { kind: 'offer', offer: { paragraphId: 'p7', word: 0, paragraph: 7, source: 'booth', confident: true } } },
};
// Nothing recorded, or a finished chapter: no line at all.
export const None: Story = {};
// The Whisper model is not downloaded: no offer, the reason in the tooltip.
export const NeedsModel: Story = {
  args: {
    state: { kind: 'none', note: 'Finding where you stopped listens to the end of your recording with the Whisper Small model, which is not downloaded yet.' },
  },
};
