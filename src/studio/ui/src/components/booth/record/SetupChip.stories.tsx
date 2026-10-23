import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import type { DawChoice } from '../../../api/contracts/daw';
import { setupCapabilities } from './fixtures';
import { SetupChip } from './SetupChip';

// The Booth top bar's setup chip over the project's DAW choice (apps/desktop/bindings_dawchoice.go): the name from the payload,
// the warning tone until the DAW is connected, and the state in its accessible name and tooltip.
const choice = (over: Partial<DawChoice>): DawChoice => ({
  hasProject: true,
  daw: 'REAPER',
  source: 'linked',
  chosen: null,
  state: 'connected',
  reachable: true,
  linkedFile: 'Alice.rpp',
  foundFiles: ['Alice.rpp'],
  launcherAutoStart: false,
  experimental: false,
  options: [],
  ...over,
});

const meta = {
  title: 'Booth/SetupChip',
  component: SetupChip,
  args: { capabilities: setupCapabilities('reaper'), standaloneName: 'Recorder', choice: choice({}), onClick: fn() },
  decorators: [
    (Story) => (
      <div className="flex items-center gap-3 bg-[var(--surface)] px-5 py-2.5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SetupChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

// A folder holding one .rpp that is not linked: the narrator is sent to Recording settings to link it.
export const NotLinked: Story = {
  args: { capabilities: setupCapabilities('reaper-off'), choice: choice({ source: 'found', state: 'not_linked', reachable: false, linkedFile: null }) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Recording setup: REAPER, not linked' })).toBeTruthy();
  },
};

export const LinkedNotStarted: Story = { args: { capabilities: setupCapabilities('reaper-off'), choice: choice({ state: 'linked', reachable: false }) } };

export const NotRunning: Story = { args: { capabilities: setupCapabilities('reaper-off'), choice: choice({ state: 'not_running', reachable: false }) } };

export const RecordsInTheApp: Story = {
  args: { capabilities: setupCapabilities('builtin'), choice: choice({ daw: 'Built-in', source: 'default', state: 'app', linkedFile: null, foundFiles: [] }) },
};
