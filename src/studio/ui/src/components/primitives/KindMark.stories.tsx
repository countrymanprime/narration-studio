import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ALL_ENTITY_COLOURS, WARN_COLOUR } from '../../kinds/entityColour';
import { MARKED_KIND_IDS, kindDef } from '../../kinds/kindMap';
import { KindMark } from './KindMark';

const meta = {
  title: 'Primitives/KindMark',
  component: KindMark,
  args: { kind: 'misread', children: 'beginning', colour: undefined, onActivate: undefined },
  argTypes: { kind: { control: 'select', options: MARKED_KIND_IDS } },
} satisfies Meta<typeof KindMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Misread: Story = { args: { kind: 'misread', children: 'beginning', description: 'Heard: begging' } };
export const Missing: Story = { args: { kind: 'missing', children: 'very tired' } };
export const Extra: Story = { args: { kind: 'extra', children: 'tired', label: 'Suspected extra words', description: 'Heard: um' } };
export const Repeat: Story = { args: { kind: 'repeat', children: 'she had peeped into the book' } };
export const LowConfidence: Story = { args: { kind: 'low', children: 'Wonderland' } };
export const Pronunciation: Story = { args: { kind: 'pron', children: 'Cheshire' } };
export const FindHit: Story = { args: { kind: 'search', children: 'rabbit' } };
export const EntityNeedsReview: Story = { args: { kind: 'entity', colour: WARN_COLOUR, children: 'Cheshire' } };

// One row per marked kind, each in its own shape: the reader tells two red kinds apart by the shape, not the colour.
export const EveryMarkedKind: Story = {
  render: () => (
    <ul className="flex max-w-md flex-col gap-2 text-sm leading-7">
      {MARKED_KIND_IDS.filter((kind) => kind !== 'entity').map((kind) => (
        <li key={kind}>
          <KindMark kind={kind}>{kindDef(kind).label}</KindMark> in a sentence the narrator reads aloud
        </li>
      ))}
    </ul>
  ),
};

// An entity is drawn in its entry's colour on every page: the six type hues, the review state and the fallback for a type nobody defines.
export const EveryEntityColour: Story = {
  render: () => (
    <p className="flex max-w-md flex-wrap gap-2 text-sm leading-7">
      {ALL_ENTITY_COLOURS.map((colour) => (
        <KindMark key={colour.hue} kind="entity" colour={colour}>
          {colour.hue}
        </KindMark>
      ))}
    </p>
  ),
};

// A kind with no text mark (a breath, a click) leaves its words unmarked: it is a pin and a chip only.
export const KindWithoutMark: Story = {
  args: { kind: 'breath', children: 'a quiet breath' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('mark')).toBeNull();
  },
};

export const Activatable: Story = {
  args: { kind: 'misread', children: 'beginning', label: 'Misread: beginning', onActivate: fn() },
  play: async ({ canvasElement, args }) => {
    const mark = within(canvasElement).getByRole('button', { name: 'Misread: beginning' });
    await userEvent.click(mark);
    await expect(args.onActivate).toHaveBeenCalledTimes(1);
  },
};
