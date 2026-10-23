import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, within } from 'storybook/test';
import type { GuideType } from '../../../types';
import { StoryBibleTypesView } from './StoryBibleTypesPanel';

// The host's default types (SN-B95) with a Story Bible of six Character entries and one Place entry.
const TYPES: GuideType[] = [
  { name: 'Character', colour: 'green', speaks: true },
  { name: 'Place', colour: 'blue', speaks: false },
  { name: 'Organization', colour: 'violet', speaks: false },
  { name: 'Lore', colour: 'amber', speaks: false },
  { name: 'Item', colour: 'teal', speaks: false },
  { name: 'Event', colour: 'rose', speaks: false },
];
const COUNTS = { Character: 6, Place: 1 };

// The list is held here, as the panel holds the host's answer; the colour and Can speak edits are fed back in.
function Editing(props: Parameters<typeof StoryBibleTypesView>[0]) {
  const [types, setTypes] = useState(props.types);
  const change = (name: string, patch: Partial<GuideType>) => setTypes((rows) => rows?.map((row) => (row.name === name ? { ...row, ...patch } : row)));
  return (
    <StoryBibleTypesView
      {...props}
      types={types}
      onColour={(name, colour) => {
        props.onColour(name, colour);
        change(name, { colour });
      }}
      onSpeaks={(name, speaks) => {
        props.onSpeaks(name, speaks);
        change(name, { speaks });
      }}
    />
  );
}

const meta = {
  title: 'Settings/Page/StoryBibleTypesPanel',
  component: StoryBibleTypesView,
  args: {
    types: TYPES,
    counts: COUNTS,
    onRename: fn(async () => true),
    onColour: fn(),
    onSpeaks: fn(),
    onRemove: fn(),
    onAdd: fn(async () => true),
    onRefuse: fn(),
  },
  render: (args) => <Editing {...args} />,
  decorators: [
    (Story) => (
      <div className="max-w-[860px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StoryBibleTypesView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default types: Remove is held on Character and Place, which have entries. */
export const DefaultTypes: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Remove Character' })).toHaveAttribute('aria-disabled', 'true');
    await expect(canvas.getByRole('button', { name: 'Remove Lore' })).not.toHaveAttribute('aria-disabled');
  },
};

/** One type left: it cannot be removed. */
export const LastType: Story = { args: { types: [TYPES[0]], counts: {} } };

/** The types are still being read. */
export const Reading: Story = { args: { types: undefined, counts: undefined } };

/** The host refused a change; its sentence shows under the list. */
export const Refused: Story = { args: { error: "There is a type named 'Character' already; give the type a new name." } };
