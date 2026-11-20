import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { NewChapterTracks, type NewChapterPick } from './NewChapterTracks';

// The tracks a new chapter folder is made with besides the Narrator (#3748): controlled, like the create dialog and the Settings row that hold it.
function Controlled({ initial }: { initial: NewChapterPick }) {
  const [pick, setPick] = useState(initial);
  return (
    <div style={{ maxWidth: '24rem' }}>
      <NewChapterTracks narrator="Narrator" pick={pick} onChange={setPick} />
    </div>
  );
}

const voice = (name: string, checked = true) => ({ name, checked });
const extras = voice('Extras');

const meta = {
  title: 'Chapter tracks/New chapter tracks',
  component: Controlled,
  args: { initial: { voices: [voice('Mara'), voice('Dragon 🐉'), voice('مرحبا', false)], extras } },
} satisfies Meta<typeof Controlled>;

export default meta;
type Story = StoryObj<typeof meta>;

export const VoicesAndExtras: Story = {};
export const OneVoice: Story = { args: { initial: { voices: [voice('Mara')], extras } } };
export const ExtrasOnly: Story = { args: { initial: { voices: [], extras } } };
export const ManyVoices: Story = {
  args: { initial: { voices: Array.from({ length: 40 }, (_, index) => voice(`Voice ${index + 1} of the whole cast`)), extras } },
};
export const LongName: Story = { args: { initial: { voices: [voice('Lady Bracknell of the Very Long Name '.repeat(6).trim()), voice('Mara')], extras } } };

// One press on the All box clears every voice and a second ticks them all again; the Narrator has no box.
export const AllClearsAndTicks: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('checkbox', { name: /Narrator/ })).toBeNull();
    await expect(canvas.getByRole('checkbox', { name: 'All 3 voices' })).toHaveAttribute('aria-checked', 'mixed');
    await userEvent.click(canvas.getByRole('checkbox', { name: 'All 3 voices' }));
    await expect(canvas.getByRole('checkbox', { name: 'All 3 voices' })).toBeChecked();
    await userEvent.click(canvas.getByRole('checkbox', { name: 'All 3 voices' }));
    await expect(canvas.getByRole('checkbox', { name: 'Mara' })).not.toBeChecked();
  },
};
