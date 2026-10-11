import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import { DAW_SETUPS } from '../../fixtures/daw';
import { CapabilityList } from './CapabilitySection';

// Settings draws this list on the panel surface; axe measures the badge tints against it.
function OnSurface({ children }: { children: ReactNode }) {
  return <div className="max-w-[860px] rounded-lg bg-[var(--surface)] p-4 text-sm">{children}</div>;
}

const meta = {
  title: 'Settings/CapabilityList',
  component: CapabilityList,
  args: { report: { daw: 'REAPER', reachable: true, capabilities: {} } },
  decorators: [
    (Story) => (
      <OnSurface>
        <Story />
      </OnSurface>
    ),
  ],
} satisfies Meta<typeof CapabilityList>;

export default meta;
type Story = StoryObj<typeof meta>;

// Every level as a word with its own glyph, the host's sentence for an unavailable one, the warning chip for a destructive
// one and each mode phrase (ADR 0810: `destructive` only when true, `mode` whether or not it is available).
export const EveryLevelAndMode: Story = {
  args: {
    report: {
      daw: 'REAPER',
      reachable: false,
      capabilities: {
        markers: { level: 'supported', available: true, mode: 'native' },
        record: {
          level: 'experimental',
          available: false,
          reason: 'experimental_off',
          message: 'Recording is experimental. Turn it on in the list above.',
          mode: 'app',
        },
        punch: { level: 'experimental', available: true, destructive: true, mode: 'steps' },
        macro_render: { level: 'not_yet_available', available: false, reason: 'not_yet', message: 'This is not built yet.' },
        takes: { level: 'unsupported', available: false, reason: 'unsupported', message: 'This DAW cannot choose the active take.' },
        newer_capability: { level: 'supported', available: true },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('listitem')).toHaveLength(6);
    await expect(canvas.getByText('Replaces audio that cannot be brought back')).toBeTruthy();
    await expect(canvas.getByText('newer_capability')).toBeTruthy();
  },
};

// The edit rows (SND-3) as REAPER reports them today: in the catalogue, not yet available, each with the host's sentence.
const EDIT_ROWS = ['cut_range', 'fx_range', 'stack_takes', 'backups'] as const;

export const EditCapabilitiesNotYetAvailable: Story = {
  args: {
    report: {
      daw: 'REAPER',
      reachable: true,
      capabilities: Object.fromEntries(EDIT_ROWS.map((key) => [key, DAW_SETUPS.reaper.capabilities[key]])),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('listitem')).toHaveLength(4);
    for (const label of ['Cut words and audio', 'Add an effect to words', 'Stack takes', 'Audio backups']) {
      await expect(canvas.getByText(`${label} is not available with REAPER yet.`)).toBeTruthy();
    }
  },
};

export const NoCapabilities: Story = {};
