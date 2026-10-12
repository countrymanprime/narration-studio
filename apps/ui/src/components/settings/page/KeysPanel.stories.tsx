import type { Meta, StoryObj } from '@storybook/react-vite';
import { gesture } from '../../../input/gestures';
import { defaultKeymap } from '../../../input/keymap';
import { commandsFor } from '../../../input/surfaces';
import { KeysList } from './KeysPanel';

// The Windows defaults (the app ships on Windows only).
const DEFAULTS = defaultKeymap(undefined, false);
const commands = commandsFor('settings');
const first = commands[0]!;

const meta = {
  title: 'Settings/Page/KeysPanel',
  component: KeysList,
  args: { commands, keymap: DEFAULTS },
  decorators: [
    (Story) => (
      <div className="max-w-[860px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof KeysList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Defaults: Story = {};

// A remap and a second way for the first command, as `Keymap.overrides` gives them.
export const Remapped: Story = {
  args: { keymap: { ...DEFAULTS, [first.id]: [gesture('keyboard', 'F9'), gesture('keyboard', 'KeyK', ['Ctrl', 'Shift'])] } },
};
