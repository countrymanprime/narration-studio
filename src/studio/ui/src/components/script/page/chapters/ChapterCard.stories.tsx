import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { ApiProvider } from '../../../../api/ApiContext';
import { StudioProvider } from '../../../../studio/StudioProvider';
import { CREDITS, ONE, TWO, chapterHost } from './chapterFixtures';
import { ChapterCard } from './ChapterCard';

// The mock's chapter boundary in the reader (`Reader.tsx` 200-232): "End of …", the card with Record in Booth, the facts and the
// "My prep" control. The host is the browser mock, as the Delivery stories use it.
const meta = {
  title: 'Script/ChapterCard',
  component: ChapterCard,
  args: { chapter: TWO, previous: ONE, onRecord: fn() },
  decorators: [
    (Story, { parameters }) => (
      <ApiProvider api={parameters.api ?? chapterHost()}>
        <StudioProvider>
          <div className="max-w-2xl">
            <Story />
          </div>
        </StudioProvider>
      </ApiProvider>
    ),
  ],
} satisfies Meta<typeof ChapterCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotStarted: Story = {
  play: async ({ canvasElement }) => {
    const group = await within(canvasElement).findByRole('group', { name: /Prep state for/ });
    await expect(await within(group).findByRole('button', { name: 'Not started' })).toHaveAttribute('aria-pressed', 'true');
  },
};
export const InProgress: Story = { parameters: { api: chapterHost({ c2: 'progress' }) } };
export const Prepped: Story = { parameters: { api: chapterHost({ c2: 'prepped' }) } };
export const Credits: Story = { args: { chapter: CREDITS, previous: undefined } };
// A chapter that is not narration has no Record in Booth.
export const NoRecordButton: Story = { args: { onRecord: undefined } };
