import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { IconButton } from './IconButton';
import { Listbox } from './Listbox';

// A list of choices on the popover surface: the popup of a combobox (the Story Bible alias box), with the active row on
// --surface-2 and a chosen value marked by an --accent check (read-aloud-control-bar/03's device list).
const OPTIONS = [
  { id: 'mv7', label: 'Shure MV7 (USB Audio)' },
  { id: 'array', label: 'Microphone Array (Realtek(R) Audio)' },
  { id: 'jabra', label: 'Headset Microphone (Jabra Evolve2 65)' },
];

const meta = {
  title: 'Primitives/Listbox',
  component: Listbox,
  args: { id: 'story-listbox', label: 'Microphone', options: OPTIONS, onPick: fn() },
  render: (args) => (
    <div className="max-w-[22rem] p-2">
      <Listbox {...args} />
    </div>
  ),
} satisfies Meta<typeof Listbox>;

export default meta;
type Story = StoryObj<typeof meta>;

// The chosen device carries the check, and the row the keyboard is on is highlighted.
export const Chosen: Story = {
  args: { selectedId: 'mv7', activeIndex: 0 },
  play: async ({ canvasElement, args }) => {
    const list = within(canvasElement).getByRole('listbox', { name: 'Microphone' });
    const options = within(list).getAllByRole('option');
    await expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(options[1]);
    await expect(args.onPick).toHaveBeenCalledWith('array');
  },
};

// A combobox's matches, with a second line and a footer of actions outside the listbox role.
export const Matches: Story = {
  args: {
    label: 'Matching Story Bible entries',
    options: [
      { id: 'alice', label: 'Alice', description: 'Character · 41 occurrences' },
      { id: 'rabbit', label: 'White Rabbit', description: 'Character · 9 occurrences' },
    ],
    activeIndex: 1,
    footer: (
      <div className="flex justify-end p-2">
        <IconButton label="Add alias">+</IconButton>
      </div>
    ),
  },
};

// Nothing matches: the message stands in for an empty listbox.
export const Empty: Story = { args: { options: [], empty: 'No matching Story Bible entries.' } };

// The jump menu's palette (D98): a heading before each run of one group, a muted count or key cap at the right.
export const Grouped: Story = {
  args: {
    label: 'Jump menu results',
    activeIndex: 1,
    options: [
      { id: 'storm', label: 'The storm broke', trailing: 'Chapter 2, line 4', group: 'Script' },
      { id: 'zoom', label: 'Zoom in', trailing: '+', group: 'View' },
      { id: 'fit', label: 'Fit to width', trailing: '0', group: 'View' },
    ],
  },
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole('listbox', { name: 'Jump menu results' });
    await expect(within(list).getAllByRole('option')).toHaveLength(3);
    await expect(within(list).getByText('View')).toHaveAttribute('role', 'presentation');
  },
};

// A row with a mouse-only control at its right (the Booth's speaker picker: a play control on a character who has voice samples). The option never
// holds the button; the control is hidden from assistive technology and out of the Tab order, and the row's `hint` tells a screen reader the key that does the same.
export const WithRowAction: Story = {
  args: {
    label: 'Speakers',
    activeIndex: 0,
    options: [
      {
        id: 'queen',
        label: 'The Queen of Hearts',
        trailing: '3 samples',
        hint: 'Has 3 voice samples. Press Control Enter to hear the primary one.',
        action: (
          <IconButton label="Play" tabIndex={-1}>
            ▶
          </IconButton>
        ),
      },
      { id: 'king', label: 'The King of Hearts', trailing: 'no sample' },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const list = within(canvasElement).getByRole('listbox', { name: 'Speakers' });
    const options = within(list).getAllByRole('option');
    await expect(options[0]?.querySelector('button')).toBeNull();
    await userEvent.click(options[0]!);
    await expect(args.onPick).toHaveBeenCalledWith('queen');
  },
};
