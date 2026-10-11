import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { evidenceChange } from './evidenceChange';
import { EvidenceChangedBanner } from './EvidenceChangedBanner';
import { inspectorFinding } from './testFinding';

const was = (heard: string) => inspectorFinding({ heard });
const now = (heard: string) => inspectorFinding({ version: 'v2', heard });

// The Studio Next Inspector's `#evchanged` banner (D98): "Before" and "Now" with the words that left struck and the words that
// arrived underlined, and the one button that takes the new evidence. The Inspector column is about 24 rem wide.
const meta = {
  title: 'Proof/EvidenceChangedBanner',
  component: EvidenceChangedBanner,
  args: { onUseNewEvidence: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-sm bg-[var(--surface)] p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EvidenceChangedBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneWordChanged: Story = {
  args: { change: evidenceChange(was('I could not help myself'), now('I could not help it'))! },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toBeTruthy();
    await userEvent.click(canvas.getByRole('button', { name: 'Use the new evidence' }));
    await expect(args.onUseNewEvidence).toHaveBeenCalledTimes(1);
  },
};

export const ManyWordsChanged: Story = {
  args: { change: evidenceChange(was('She walked slowly down to the old harbour wall'), now('He ran quickly up to the new market square'))! },
};

// The re-check heard more than before and nothing in "Before" is struck.
export const NoneRemoved: Story = {
  args: { change: evidenceChange(was('I could not'), now('I could not help it at all'))! },
};
