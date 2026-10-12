import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ApiProvider } from '../../../../../api/ApiContext';
import { createMockApi } from '../../../../../api/mockApi';
import { StudioProvider } from '../../../../../studio/StudioProvider';
import { SELECTION } from './fixtures';
import { MarkComposer, QUERY_NEEDED } from './MarkComposer';

// The mock's composer (`pages/script/dialogs.tsx`): titled with the selected words, a Type select, "Note (optional)" or, for a
// type that asks, "Your query", and Cancel and Save. An empty query is refused with a sentence.
const meta = {
  title: 'Script/MarkComposer',
  component: MarkComposer,
  parameters: { layout: 'fullscreen' },
  args: { type: 'stress', selection: SELECTION, onClose: fn() },
  decorators: [
    (Story) => (
      <ApiProvider api={createMockApi()}>
        <StudioProvider>
          <Story />
        </StudioProvider>
      </ApiProvider>
    ),
  ],
} satisfies Meta<typeof MarkComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Note: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Alice' });
    await expect(within(dialog).getByLabelText('Note (optional)')).toBeVisible();
  },
};

export const Query: Story = {
  args: { type: 'ask' },
  play: async ({ canvasElement }) => {
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Alice' });
    // The types arrive from the host after the first paint; only then does the field ask for a query.
    await within(dialog).findByLabelText('Your query');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await expect(within(dialog).getByText(QUERY_NEEDED)).toBeVisible();
  },
};

export const LongSelectionIsShortened: Story = {
  args: { selection: { ...SELECTION, quote: 'It was the best of times, it was the worst of times, it was the age of wisdom' } },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: /…$/ })).toBeVisible();
  },
};
