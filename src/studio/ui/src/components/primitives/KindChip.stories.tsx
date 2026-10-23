import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ALL_ENTITY_COLOURS } from '../../kinds/entityColour';
import { KIND_IDS, kindDef } from '../../kinds/kindMap';
import { KindChip } from './KindChip';

// A chip's fill is opaque and checked against its text on the card (paletteContrast.test.ts), so a story draws it on a card, as a page does.
const onSurface: Decorator = (Story) => (
  <div className="rounded-lg bg-[var(--surface)] p-6">
    <Story />
  </div>
);

const meta = {
  title: 'Primitives/KindChip',
  component: KindChip,
  args: { kind: 'misread', label: undefined, colour: undefined, shape: undefined, onClick: undefined },
  argTypes: { kind: { control: 'select', options: KIND_IDS } },
  decorators: [onSurface],
} satisfies Meta<typeof KindChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Misread: Story = {};
export const LongSilence: Story = { args: { kind: 'pacing' } };
export const Breath: Story = { args: { kind: 'breath' } };
export const Pronunciation: Story = { args: { kind: 'pron' } };
export const UnknownSpeaker: Story = { args: { kind: 'speaker-unknown', label: '?' } };

// Every registered kind, in the shape it has by default: the legend a page shows is this row.
export const EveryKind: Story = {
  render: () => (
    <ul className="flex flex-wrap items-center gap-2">
      {KIND_IDS.filter((kind) => kindDef(kind).family !== 'entity' && kindDef(kind).family !== 'speaker').map((kind) => (
        <li key={kind}>
          <KindChip kind={kind} />
        </li>
      ))}
    </ul>
  ),
};

// An entry's chip wears its own colour: the six type hues, the review state and the fallback; a suggested speaker is dashed.
export const EveryEntityColour: Story = {
  render: () => (
    <ul className="flex flex-wrap items-center gap-2">
      {ALL_ENTITY_COLOURS.map((colour) => (
        <li key={colour.hue} className="flex gap-1">
          <KindChip kind="entity" colour={colour} label={colour.hue} />
          <KindChip kind="speaker-suggested" colour={colour} label={`${colour.hue}?`} />
        </li>
      ))}
    </ul>
  ),
};

export const Clickable: Story = {
  args: { kind: 'extra', label: '3 extra', onClick: fn() },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: '3 extra' }));
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};
