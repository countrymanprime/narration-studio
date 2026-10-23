import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SamplePlayButton, SamplePlayerAnnouncement, spokenLength } from './SamplePlayButton';

// The play control of one voice sample (docs/prds/character-voice-samples.prd.md, Keyboard and accessibility), drawn from props: the hook that
// drives it (useSamplePlayer) has its own tests, and no page draws it until phases 3 to 5. These stories pin the name in each state.
const meta = {
  title: 'Voice samples/SamplePlayButton',
  component: SamplePlayButton,
  args: { label: 'angry, to the Duke', durationMs: 7400, status: 'idle', progress: 0, onPlay: fn(), onStop: fn() },
} satisfies Meta<typeof SamplePlayButton>;

export default meta;
type Story = StoryObj<typeof meta>;

// The name says what it plays and for how long; a press asks to play.
export const Idle: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Play voice sample: angry, to the Duke, 7.4 seconds' });
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).not.toHaveAttribute('aria-keyshortcuts');
    await userEvent.click(button);
    await expect(args.onPlay).toHaveBeenCalledTimes(1);
  },
};

// Loading and playing look the same to the narrator: Stop, with the bar at the real position.
export const Loading: Story = {
  args: { status: 'loading', progress: 0 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Stop' })).toHaveAttribute('aria-pressed', 'true');
  },
};

export const Playing: Story = {
  args: { status: 'playing', progress: 0.4 },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('progressbar', { name: 'Voice sample: angry, to the Duke' })).toHaveAttribute('aria-valuenow', '40');
    await userEvent.click(canvas.getByRole('button', { name: 'Stop' }));
    await expect(args.onStop).toHaveBeenCalledTimes(1);
  },
};

// A take is recording: the control stays focusable and its hint is the reason, and a press does nothing.
export const RefusedWhileRecording: Story = {
  args: { disabledReason: 'Not while recording. Stop the take first.' },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Play voice sample: angry, to the Duke, 7.4 seconds' });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(button);
    await expect(args.onPlay).not.toHaveBeenCalled();
  },
};

// Right-to-left text, an emoji and a label of the longest length (60 units) stay one control.
export const LongRightToLeftAndEmoji: Story = {
  args: { label: 'שלום 🦎 ' + 'ארוך'.repeat(13), durationMs: 500 },
  decorators: [
    (Story) => (
      <div className="w-40" dir="auto">
        <Story />
      </div>
    ),
  ],
};

// The live region is polite and says what the shared player is doing.
export const Announcement: StoryObj<typeof SamplePlayerAnnouncement> = {
  render: () => <SamplePlayerAnnouncement text="Playing voice sample for Hatter" />,
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByText('Playing voice sample for Hatter');
    await expect(region).toHaveAttribute('aria-live', 'polite');
  },
};

// The length as spoken: one decimal, a singular for exactly one second.
export const SpokenLengths: Story = {
  render: () => <p>{[500, 1000, 7400, 30000].map(spokenLength).join('; ')}</p>,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('0.5 seconds; 1 second; 7.4 seconds; 30 seconds')).toBeInTheDocument();
  },
};
