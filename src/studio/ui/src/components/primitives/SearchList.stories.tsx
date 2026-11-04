import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SearchList } from './SearchList';

// A search box driving a list of choices, the body of a picker popover: the Booth's voice list and speaker picker.
const VOICES = ['Narrator', 'White Rabbit', 'Extras', 'Queen of Hearts'];

function Picker({ onPick }: { onPick: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const options = VOICES.filter((name) => name.toLowerCase().includes(query.trim().toLowerCase())).map((name) => ({ id: name, label: name }));
  return (
    <div className="max-w-[22rem] p-2">
      <SearchList
        id="story-voices"
        label="Voices"
        searchLabel="Search voices"
        query={query}
        onQueryChange={setQuery}
        options={options}
        onPick={onPick}
        selectedId="Narrator"
        empty="No voice matches."
      />
    </div>
  );
}

const meta = {
  title: 'Primitives/SearchList',
  component: Picker,
  args: { onPick: fn() },
} satisfies Meta<typeof Picker>;

export default meta;
type Story = StoryObj<typeof meta>;

// Typing narrows the list, the first match is highlighted and Enter picks it.
export const Search: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole('combobox', { name: 'Search voices' });
    await userEvent.type(box, 'que');
    await expect(canvas.getAllByRole('option')).toHaveLength(1);
    await userEvent.keyboard('{Enter}');
    await expect(args.onPick).toHaveBeenCalledWith('Queen of Hearts');
  },
};

// No match: the list says so in its place.
export const NoMatch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('combobox', { name: 'Search voices' }), 'zzz');
    await expect(canvas.getByText('No voice matches.')).toBeVisible();
  },
};
