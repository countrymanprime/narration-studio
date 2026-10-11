import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { useEffect, useMemo } from 'react';
import { OverlayHost } from '../../../overlay/OverlayHost';
import { createOverlayService } from '../../../overlay/overlayService';
import { rollConfirmSpec } from './rollConfirm';

// The question before a destructive roll or punch-in, drawn by the overlay host in the shell's confirm. The wording names the DAW
// from the capability report, so no story says "REAPER": REAPER keeps the earlier audio as a take and never asks.
type Args = { title: string; confirmLabel: string; dawName: string; recording: boolean };

function Asking({ title, confirmLabel, dawName, recording }: Args) {
  const service = useMemo(() => createOverlayService(), []);
  useEffect(() => {
    void service.confirm(rollConfirmSpec({ title, confirmLabel, dawName, recording }));
  }, [service, title, confirmLabel, dawName, recording]);
  return <OverlayHost service={service} />;
}

const meta = {
  title: 'Booth/RollConfirm',
  component: Asking,
  args: { title: 'Roll again from ¶ 4?', confirmLabel: 'Roll again', dawName: 'Audacity', recording: true },
} satisfies Meta<typeof Asking>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Roll: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole('alertdialog', { name: 'Roll again from ¶ 4?' });
    await expect(dialog).toBeVisible();
    await expect(within(dialog).getByText(/will record over the audio from here/)).toBeVisible();
  },
};
export const PunchIn: Story = { args: { title: 'Punch in at ¶ 2?', confirmLabel: 'Punch in', recording: false } };
export const OwnRecorder: Story = { args: { dawName: 'the built-in recorder' } };
