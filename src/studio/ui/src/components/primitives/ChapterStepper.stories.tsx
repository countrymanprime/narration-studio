import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ComponentProps } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ALL_CHAPTERS, ChapterStepper } from './ChapterStepper';
import { screen } from './portalScreen';

const chapters = [
  { id: '1', name: 'The ferry at dawn' },
  { id: '2', name: 'A letter from the coast' },
  { id: '3', name: 'What the lighthouse keeper knew' },
  { id: '4', name: 'Coda' },
];

const meta = {
  title: 'Primitives/ChapterStepper',
  component: ChapterStepper,
  args: { chapters, value: '2', stepKeys: ['←', '→'], onChange: fn(), onStep: fn() },
  render: (args) => (
    <div className="p-2">
      <ChapterStepper {...args} />
    </div>
  ),
} satisfies Meta<typeof ChapterStepper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstChapter: Story = { args: { value: '1' } };
export const MiddleChapter: Story = {};
export const LastChapter: Story = { args: { value: '4' } };
export const AllSelected: Story = { args: { allowAll: true, value: ALL_CHAPTERS } };
/** A take is running: the arrows and the picker are off, each says why, and the picker's hint is reachable by keyboard. */
export const OffWhileRecording: Story = { args: { disabled: 'Not while recording. Stop the take first.' } };
export const AltKeys: Story = { args: { stepKeys: ['Alt+↑', 'Alt+↓'] } };
export const VeryLongChapterName: Story = {
  args: { chapters: [...chapters, { id: '5', name: 'An exceedingly long chapter name that goes on well past any sensible width for a picker' }], value: '5' },
  render: (args) => (
    <div className="w-80 p-2">
      <ChapterStepper {...args} />
    </div>
  ),
};

function Controlled(args: ComponentProps<typeof ChapterStepper>) {
  const [value, setValue] = useState(args.value);
  return (
    <div className="p-2">
      <ChapterStepper
        {...args}
        value={value}
        onChange={(id) => {
          args.onChange(id);
          setValue(id);
        }}
      />
    </div>
  );
}

export const ChoosingAChapter: Story = {
  args: { allowAll: true },
  render: (args) => <Controlled {...args} />,
  play: async ({ args, canvasElement }) => {
    const picker = within(canvasElement).getByRole('button', { name: /Change chapter/ });
    await userEvent.click(picker);
    const items = await screen.findAllByRole('menuitemradio');
    await expect(items[0]).toHaveTextContent('All chapters');
    await userEvent.click(items[3]);
    await expect(args.onChange).toHaveBeenCalledWith('3');
    await waitFor(() => expect(picker).toHaveTextContent('What the lighthouse keeper knew'));
  },
};

// Each chapter's note after its name in the list (how far it is recorded): muted, right-aligned, never wrapping; a long name truncates before it.
export const WithChapterDetails: Story = {
  args: {
    chapters: [
      { id: '1', name: 'The ferry at dawn', detail: 'Complete' },
      { id: '2', name: 'A letter from the coast, with a name long enough to have to truncate before its note', detail: '45%' },
      { id: '3', name: 'What the lighthouse keeper knew', detail: '~30%' },
      { id: '4', name: 'Coda' },
    ],
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Change chapter/ }));
    const items = await screen.findAllByRole('menuitemradio');
    await expect(items.map((item) => item.querySelector('[data-chapter-detail]')?.textContent ?? null)).toEqual(['Complete', '45%', '~30%', null]);
  },
};
