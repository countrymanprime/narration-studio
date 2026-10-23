import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { GuideEntity, GuideType } from '../../../../../api/contracts/storyBible';
import { SpeakerPicker } from './SpeakerPicker';
import { speakerChoices } from './speakerChoices';

// The mock's speaker picker (`ui/SpeakerPicker.tsx`): this chapter's speakers first, everyone when searching, a swatch per name
// with its Story Bible entry beneath, "Confirm “X”" first for a suggestion, and never a Narrator row.
const TYPES: GuideType[] = [
  { name: 'Character', colour: 'green', speaks: true },
  { name: 'Place', colour: 'blue', speaks: false },
];
const entry = (id: string, name: string, extra: Partial<GuideEntity> = {}): GuideEntity =>
  ({ id, canonical_name: name, aliases: [], category: 'Character', ...extra }) as GuideEntity;
const alias = (text: string) => ({ text, pronunciation: {}, occurrences: [] }) as unknown as GuideEntity['aliases'][number];

const duchess = entry('e1', 'The Duchess', { aliases: [alias('Her Grace')], speaker_color: 5 });
const hatter = entry('e2', 'The Hatter');
const gardener = entry('e3', 'Five', { aliases: [alias('The gardeners')] });
const everyone = speakerChoices([duchess, hatter, gardener], TYPES);

const meta = {
  title: 'Script/SpeakerPicker',
  component: SpeakerPicker,
  args: {
    phrase: { speaker: hatter, state: 'suggested' },
    inChapter: everyone.filter((choice) => choice.entryId !== 'e1'),
    everyone,
    onChoose: fn(),
    onClose: fn(),
  },
  render: (args) => (
    <div className="inline-block rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-3">
      <SpeakerPicker {...args} />
    </div>
  ),
} satisfies Meta<typeof SpeakerPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Suggested: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('option', { name: /Confirm “The Hatter”/ }));
    await expect(args.onChoose).toHaveBeenCalledWith('e2');
  },
};

export const Searching: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('combobox', { name: 'Search speakers' }), 'grace');
    await expect(canvas.getByText('Matches')).toBeVisible();
    await expect(canvas.getByRole('option', { name: /^Her Grace/ })).toBeVisible();
  },
};

export const Empty: Story = {
  args: { phrase: { speaker: null, state: 'unknown' }, inChapter: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No speakers match.')).toBeVisible();
  },
};
