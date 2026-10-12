import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test';
import { ApiProvider } from '../../../../api/ApiContext';
import { createMockApi } from '../../../../api/mockApi';
import { StudioProvider } from '../../../../studio/StudioProvider';
import { ImportDialog } from './ImportDialog';

// SN-X522: the body of "Import entries", drawn on the mock host, which plans a pasted text the way the real host does. The mock page is
// pages/bible/ImportDialog.tsx in the Studio Next mock. The dialog shell (title, Close, focus) is the overlay's; the mount is SN-B8's.
const meta = { title: 'Story Bible/Import dialog', component: ImportDialog, args: { onClose: fn() } } satisfies Meta<typeof ImportDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

const api = createMockApi();
const VALID = JSON.stringify({
  entries: [
    { name: 'The Mad Hatter', type: 'Character', confidence: 0.9 },
    { name: 'The Dormouse', type: 'Character', confidence: 0.5 },
    { name: 'Alice', type: 'Character', confidence: 0.8 },
  ],
});
const BAD = 'record,name,type,confidence\nentry,,Item,0.9\nbanana,x,y,0.1\nentry,The March Hare,Character,0.8';

function Surface({ args }: { args: Parameters<typeof ImportDialog>[0] }) {
  return (
    <ApiProvider api={api}>
      <StudioProvider>
        <div className="max-w-3xl rounded-[var(--radius-card)] bg-[var(--surface)] p-4">
          <ImportDialog {...args} />
        </div>
      </StudioProvider>
    </ApiProvider>
  );
}
const paste = (canvasElement: HTMLElement, text: string) =>
  fireEvent.change(within(canvasElement).getByLabelText('Paste JSON or CSV'), { target: { value: text } });

// Nothing pasted: no preview, and Add is off with no count.
export const Empty: Story = {
  render: (args) => <Surface args={args} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Add to the Story Bible' })).toBeDisabled();
  },
};

// A valid blob: the pills, the preview table with what each row becomes, and Add with its count.
export const ValidPreview: Story = {
  render: (args) => <Surface args={args} />,
  play: async ({ canvasElement }) => {
    paste(canvasElement, VALID);
    const view = within(canvasElement);
    await view.findByRole('table', { name: 'What will be added' });
    await waitFor(() => expect(view.getByRole('button', { name: /^Add \d+ to the Story Bible$/ })).toBeEnabled());
  },
};

// Bad rows beside a good one: the error table names each row, where and why; Add still counts the valid row.
export const PreviewWithErrors: Story = {
  render: (args) => <Surface args={args} />,
  play: async ({ canvasElement }) => {
    paste(canvasElement, BAD);
    const view = within(canvasElement);
    await view.findByRole('table', { name: 'Rows with errors' });
    await expect(view.getByText('2 errors')).toBeVisible();
  },
};

// The format example open, in its focusable labelled box, switched to CSV.
export const ExampleOpen: Story = {
  render: (args) => <Surface args={args} />,
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await userEvent.click(view.getByRole('button', { name: 'Show the format example' }));
    await userEvent.click(view.getByRole('button', { name: 'CSV' }));
    const box = await view.findByLabelText('Format example');
    await waitFor(() => expect(box.textContent).toContain('record,name'));
  },
};
