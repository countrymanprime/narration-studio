import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { KEY_GLYPHS, KeyCap, KeyChord } from './KeyCap';

const meta = {
  title: 'Primitives/KeyCap',
  component: KeyCap,
  args: { k: 'Enter' },
} satisfies Meta<typeof KeyCap>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Glyph: Story = {};

// Every drawn key, then the text keys that stay text (letters, modifiers, F-keys, Page Up).
export const EveryKey: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <KeyChord keys={Object.keys(KEY_GLYPHS)} />
      <KeyChord keys={['R', 'Ctrl', 'Shift', 'Alt', 'F11', 'Page Up']} />
    </div>
  ),
};

export const BoothSize: Story = {
  render: () => <KeyChord keys={['Space', 'Enter', 'Esc', 'R']} size="md" />,
};

export const OtherSpellings: Story = {
  render: () => <KeyChord keys={['↑', 'Down', 'Return', '↵', '⌫', 'Right-click']} />,
};

export const GlyphKeepsItsName: Story = {
  play: async ({ canvasElement }) => {
    const cap = canvasElement.querySelector('kbd[data-key="Enter"]');
    await expect(cap?.getAttribute('title')).toBe('Enter');
    await expect(within(canvasElement).getByText('Enter')).toBeInTheDocument();
  },
};
