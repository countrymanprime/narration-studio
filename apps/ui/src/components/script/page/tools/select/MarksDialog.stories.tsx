import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { ApiProvider } from '../../../../../api/ApiContext';
import { createMockApi } from '../../../../../api/mockApi';
import { StudioProvider } from '../../../../../studio/StudioProvider';
import { MarksDialog } from './MarksDialog';

// The mock's "Define how you mark up" (`pages/script/dialogs.tsx`): per type a swatch, its name, colour, line and Asks, and a
// remove button; Add a mark beneath. Each change is saved at once.
const meta = {
  title: 'Script/MarksDialog',
  component: MarksDialog,
  parameters: { layout: 'fullscreen' },
  args: { saveMarkTypes: fn(async () => null), onClose: fn() },
  decorators: [
    (Story) => (
      <ApiProvider api={createMockApi()}>
        <StudioProvider>
          <Story />
        </StudioProvider>
      </ApiProvider>
    ),
  ],
} satisfies Meta<typeof MarksDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Types: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: 'Define how you mark up' });
    await waitFor(() => expect(within(dialog).getAllByLabelText('Mark name').length).toBe(6));
    await expect(within(dialog).getByRole('button', { name: 'Add a mark' })).toBeVisible();
  },
};
