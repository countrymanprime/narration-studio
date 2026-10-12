import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { DAW_SETUPS, type DawSetupId } from '../../../fixtures/daw';
import { createOverlayService } from '../../../overlay/overlayService';
import { createMockDawClient, type DawClient } from '../../../ports/daw';
import { createMockMeasurements } from '../../../ports/measurements';
import { PortOverrides } from '../../../ports/usePort';
import type { NarrationApi } from '../../../types';
import type { PickupItem, PickupList } from '../../../api/contracts/pickups';
import { BoothNextPage } from './BoothNextPage';
import { BoothHost, dawFor, LOCATED, newJournal, pageApi } from './testPage';

// The Booth page (docs/research/mockups/studio-next/src/pages/Booth.tsx) over the mock api and the mock's DAW setups. Each story drives the page to one state; the leave question and the roll confirm are the shell's overlay.
type Args = { setup: DawSetupId | 'destructive'; resume: boolean; pickups?: boolean; roomTone?: number; navigate: (next: string) => void };

const pickup = (id: string, chapterId: string, paragraphId: string, script: string, done = false): PickupItem => ({
  id,
  chapterId,
  paragraphId,
  paragraph: null,
  time: 65,
  at: null,
  type: 'misread',
  script,
  context: '',
  source: 'you',
  confidence: null,
  confReason: '',
  included: true,
  done,
  waiting: false,
});

/** A session of three lines from Pickups: two in Chapter One (one already recorded) and one in Chapter Two. */
const SESSION: PickupList = {
  pickups: [
    pickup('k1', 'c1', 'p3', 'She turned and walked away.'),
    pickup('k2', 'c1', 'p1', 'The Garden was quiet.', true),
    pickup('k3', 'c2', 'q1', 'A new day began in the court.'),
  ],
  leftOut: [],
};

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

function Page({ setup, resume, pickups = false, roomTone, navigate }: Args) {
  const [host] = useState(() => ({
    api: pageApi({
      ...(resume ? { teleprompterLocate: async () => LOCATED } : {}),
      ...(pickups ? { pickupsList: async () => SESSION } : {}),
    } as Partial<NarrationApi>),
    daw: setup === 'destructive' ? destructive() : dawFor(setup),
    journal: newJournal(),
    overlay: createOverlayService(),
    // The microphone's room tone, whichever microphone is chosen; without it the host's port has no reading.
    measurements: roomTone === undefined ? undefined : { ...createMockMeasurements(), roomTone: async () => ({ ok: true as const, value: roomTone }) },
  }));
  return (
    <div className="h-[calc(100vh-2rem)]">
      <BoothHost {...host} search={pickups ? '?chapter=c1&pickups=k1,k2,k3' : undefined}>
        <PortOverrides clients={host.measurements ? { daw: host.daw, measurements: host.measurements } : { daw: host.daw }}>
          <BoothNextPage hasManuscript navigate={navigate} />
        </PortOverrides>
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

// B bookmarks the word being read: the toast offers Undo and a ribbon shows in the margin beside the line.
export const Bookmarked: Story = {
  play: async ({ canvasElement }) => {
    await recordButton(canvasElement);
    await userEvent.keyboard('b');
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-bmk-margin] [data-bm]')).toHaveLength(1));
  },
};

// Opened from Pickups on three lines: the side panel lists them with two open, the reading starts on the first, the text marks the
// lines of this chapter with a bar, and the footer adds N.
export const PickupSession: Story = {
  args: { pickups: true },
  play: async ({ canvasElement }) => {
    await recordButton(canvasElement);
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getAllByText('Pickups · 2 open').length).toBeGreaterThan(0));
    // The panel is a closed drawer at narrow widths, so the line is found by its jump id rather than by its (hidden) role.
    await expect(canvasElement.ownerDocument.querySelector('[data-pj="k1"]')?.getAttribute('aria-current')).toBe('true');
    await expect(canvasElement.querySelector('#bkeys')?.textContent).toContain('Next pickup');
  },
};

// The microphone's room tone measured: the footer shows it beside the level bar, in the ok colour.
export const RoomToneMeasured: Story = {
  args: { roomTone: -58.6 },
  play: async ({ canvasElement }) => {
    await recordButton(canvasElement);
    await expect(await within(canvasElement).findByText('Room −58.6 dB')).toBeTruthy();
  },
};
