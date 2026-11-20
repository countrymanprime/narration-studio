import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { DAW_SETUPS } from '../../fixtures/daw';
import { CapabilityReference } from './CapabilityReferenceDialog';

// The capability reference the audio engine panel and the Settings row open in a dialog: what each recording tool can do, which tools do it and what
// the linked one reports now. The stories draw the table itself, as it sits in the dialog body, for each linked tool and for a failed read.
const meta: Meta<typeof CapabilityReference> = {
  title: 'Engine/CapabilityReference',
  component: CapabilityReference,
  args: { report: DAW_SETUPS.reaper, loadError: '', onRetry: fn() },
};
export default meta;
type Story = StoryObj<typeof CapabilityReference>;

export const Reaper: Story = {
  play: async ({ canvasElement }) => {
    const table = within(canvasElement).getByRole('table', { name: 'What the recording tools can do' });
    await expect(within(table).getByText('Now in REAPER')).toBeTruthy();
    await expect(canvasElement.textContent).not.toMatch(/experimental/i);
  },
};
export const ReaperOff: Story = { args: { report: DAW_SETUPS['reaper-off'] } };
export const Audacity: Story = { args: { report: DAW_SETUPS.audacity } };
export const BuiltIn: Story = { args: { report: DAW_SETUPS.builtin } };
export const NothingLinkedYet: Story = { args: { report: undefined } };
export const ReadFailed: Story = {
  args: { report: undefined, loadError: 'bridge unreadable' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toBeTruthy();
    await expect(within(canvasElement).getByRole('button', { name: 'Retry' })).toBeTruthy();
  },
};
