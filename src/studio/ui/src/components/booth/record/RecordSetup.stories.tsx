import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, screen, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { resetOpenOnce } from '../../connection/useOpenOnce';
import { RecordSetup } from './RecordSetup';
import { brand } from '../../../brand.gen';

// The Booth's one-time recording setup, above the footer while Record is unavailable for a reason the narrator can fix from the Booth:
// REAPER not connected or not answering with the launcher steps, and a different project open in REAPER. It is drawn on the footer's surface, as on the page.
const LAUNCHER = `C:\\Users\\narrator\\AppData\\Local\\${brand.identity.dataFolder}\\runtime\\5f2c\\reaper\\${brand.identity.reaperLauncher}`;

const refused = (reason: 'standalone' | 'not_running', message: string): DawCapabilities => ({
  ...DAW_SETUPS.reaper,
  reachable: false,
  capabilities: { ...DAW_SETUPS.reaper.capabilities, record: { level: 'experimental', available: false, reason, message } },
});

type Args = {
  capabilities: DawCapabilities;
  linked: boolean;
  open?: 'same' | 'different';
  say: (sentence: string) => void;
  onSettings: () => void;
  onChanged: () => void;
};

function Strip({ capabilities, linked, open, say, onSettings, onChanged }: Args) {
  // The connect dialog opens by itself once; a story that is played again starts as if the Booth had just opened.
  useState(resetOpenOnce);
  return (
    <ApiProvider api={createMockApi()}>
      <div className="max-w-full bg-[var(--surface)] py-2">
        <RecordSetup
          capabilities={capabilities}
          facts={{ dawFileLinked: linked, launcherPath: LAUNCHER, openProject: open }}
          say={say}
          onSettings={onSettings}
          onChanged={onChanged}
          graceMs={0}
        />
      </div>
    </ApiProvider>
  );
}

const meta = {
  title: 'Booth/RecordSetup',
  component: Strip,
  args: {
    capabilities: refused('standalone', 'REAPER is not connected to this app. Open this app from REAPER to use it.'),
    linked: true,
    say: fn(),
    onSettings: fn(),
    onChanged: fn(),
  },
} satisfies Meta<typeof Strip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** REAPER is not connected: a chip stands in the Booth and a dialog opens by itself once with the launcher steps and Open in REAPER. */
export const ConnectReaper: Story = {
  args: { capabilities: refused('standalone', 'REAPER is not connected to this app. Open this app from REAPER to use it.') },
  play: async () => {
    await expect(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Open in REAPER and connect' })).toBeEnabled();
  },
};

export const ReaperNotAnswering: Story = {
  args: { capabilities: refused('not_running', 'REAPER is not answering. Check that REAPER is open, then try again.') },
  play: async () => {
    await expect(within(await screen.findByRole('dialog')).getByText(/REAPER is not answering/)).toBeVisible();
  },
};

export const NoProjectLinked: Story = {
  args: { capabilities: refused('standalone', 'No DAW is connected to this app. Open this app from your DAW to use it.'), linked: false },
  play: async () => {
    await expect(await screen.findByRole('button', { name: 'Open in REAPER and connect' })).toHaveAttribute('aria-disabled', 'true');
  },
};

/** Record could start, but the DAW has another project open than the one linked: link the open one, or open the linked one and check again. */
export const OtherProjectOpen: Story = {
  args: { capabilities: DAW_SETUPS.reaper, open: 'different' },
  play: async () => {
    // A take would land in the wrong project: the dialog opens by itself.
    const open = await screen.findByRole('dialog', { name: 'REAPER has a different project open' });
    await expect(within(open).getByRole('button', { name: 'Link the open project' })).toBeEnabled();
    await expect(within(open).getByRole('button', { name: 'DAW settings' })).toBeEnabled();
  },
};
