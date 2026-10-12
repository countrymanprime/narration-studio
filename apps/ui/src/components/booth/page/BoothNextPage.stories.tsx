import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { DAW_SETUPS, type DawSetupId } from '../../../fixtures/daw';
import { createOverlayService } from '../../../overlay/overlayService';
import { createMockDawClient, type DawClient } from '../../../ports/daw';
import type { NarrationApi } from '../../../types';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, LOCATED, newJournal, pageApi } from './testPage';

// The Booth page (docs/research/mockups/studio-next/src/pages/Booth.tsx) over the mock api and the mock's DAW setups. No route yet:
// SN-O10 mounts it. Each story drives the page to one state; the leave question and the roll confirm are the shell's overlay.
type Args = { setup: DawSetupId | 'destructive'; resume: boolean; navigate: (next: string) => void };

/** A DAW whose roll replaces audio, so a roll asks first (the mock's Audacity without backups). */
const destructive = (): DawClient =>
  createMockDawClient(
    {
      ...DAW_SETUPS.reaper,
      daw: 'Audacity',
      capabilities: { ...DAW_SETUPS.reaper.capabilities, punch: { level: 'experimental', available: true, destructive: true } },
    },
    { chapterIds: ['c1'], candidateIds: [], findingIds: [] },
  );

function Page({ setup, resume, navigate }: Args) {
  const [host] = useState(() => ({
    api: pageApi(resume ? ({ teleprompterLocate: async () => LOCATED } as Partial<NarrationApi>) : {}),
    daw: setup === 'destructive' ? destructive() : dawFor(setup),
    journal: newJournal(),
    overlay: createOverlayService(),
  }));
  return (
    <div className="h-[40rem]">
      <BoothHost {...host}>
        <BoothNextPage hasManuscript navigate={navigate} />
      </BoothHost>
    </div>
  );
}

const meta = {
  title: 'Booth/Page',
  component: Page,
  args: { setup: 'reaper', resume: false, navigate: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Page>;

export default meta;
type Story = StoryObj<typeof meta>;

const body = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);
const recordButton = async (canvasElement: HTMLElement) => {
  const button = await within(canvasElement).findByRole('button', { name: /^Record$/ }, { timeout: 4000 });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  return button;
};
const startTake = async (canvasElement: HTMLElement) => {
  await userEvent.click(await recordButton(canvasElement));
  await within(canvasElement).findByRole('button', { name: /^Stop$/ });
  // The router leaves a focused button its own keys, so the keys below go to the page, as they do once the narrator reads on.
  (canvasElement.ownerDocument.activeElement as HTMLElement | null)?.blur();
};

// Ready to record: the chapter bar, progress, the setup chip; Record, the timer, the levels and the key hints in the footer.
export const Ready: Story = {
  play: async ({ canvasElement }) => {
    await recordButton(canvasElement);
    await expect(within(canvasElement).queryByText('REC')).toBeNull();
  },
};

// A take runs: REC, the timer and Stop.
export const Recording: Story = {
  play: async ({ canvasElement }) => {
    await startTake(canvasElement);
    await expect(within(canvasElement).getByText('REC')).toBeTruthy();
  },
};

// The DAW is not running: Record is disabled and says why, in the capability's own sentence.
export const Refusal: Story = {
  args: { setup: 'reaper-off' },
  play: async ({ canvasElement }) => {
    const button = await within(canvasElement).findByRole('button', { name: /^Record$/ }, { timeout: 4000 });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
  },
};

// Leaving during a take asks "Stop recording?" and holds the take while it is open.
export const LeaveDialog: Story = {
  play: async ({ canvasElement }) => {
    await startTake(canvasElement);
    await userEvent.keyboard('{Escape}');
    await expect(await body(canvasElement).findByRole('alertdialog', { name: 'Stop recording?' })).toBeTruthy();
  },
};

// A roll where the DAW would lose the audio asks first, with the take held.
export const RollConfirm: Story = {
  args: { setup: 'destructive' },
  play: async ({ canvasElement }) => {
    await startTake(canvasElement);
    await userEvent.keyboard('r');
    await expect(await body(canvasElement).findByRole('alertdialog', { name: /Roll again from ¶ 1\?/ })).toBeTruthy();
  },
};

// The recording ends in the second paragraph: "Resume at ¶ 2", read from the saved project.
export const Resume: Story = {
  args: { resume: true },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('button', { name: 'Resume at ¶ 2' }, { timeout: 4000 })).toBeTruthy();
  },
};

// The side panel closed (at 1280 and below it is a drawer that starts closed); the toggle opens it over the text.
export const Drawer: Story = {
  play: async ({ canvasElement }) => {
    await recordButton(canvasElement);
    const toggle = within(canvasElement).getByRole('button', { name: /side panel/i });
    const panel = canvasElement.ownerDocument.getElementById('booth-side')!;
    if (!panel.hidden) await userEvent.click(toggle);
    await waitFor(() => expect(panel.hidden).toBe(true));
    await userEvent.click(toggle);
    await waitFor(() => expect(panel.hidden).toBe(false));
  },
};
