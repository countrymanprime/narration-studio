import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { FINDING_NOTE_TYPES } from '../../../api/contracts/findings';
import type { FindingNoteType } from '../../../types';
import { inspectorFinding } from './testFinding';
import { TypeSelect } from './TypeSelect';

// The Studio Next Inspector's `#ptype`: the type of finding, one of ten words, shown in the header beside the time.
const meta = {
  title: 'Proof/TypeSelect',
  component: TypeSelect,
  args: { finding: inspectorFinding(), onChange: fn() },
} satisfies Meta<typeof TypeSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AnalyzersWord: Story = {
  play: async ({ canvasElement, args }) => {
    const select = within(canvasElement).getByRole('combobox', { name: 'Type of finding' });
    await expect(select).toHaveValue('misread');
    await userEvent.selectOptions(select, 'pron');
    await expect(args.onChange).toHaveBeenLastCalledWith('pron');
  },
};

const chosen = (type: FindingNoteType): Story => ({ args: { finding: inspectorFinding({ review: { status: 'unreviewed', type } }) } });

export const Misread: Story = chosen('misread');
export const Skip: Story = chosen('skip');
export const Mouth: Story = chosen('mouth');
export const Pron: Story = chosen('pron');
export const Pacing: Story = chosen('pacing');
export const Repeat: Story = chosen('repeat');
export const Plosive: Story = chosen('plosive');
export const Noise: Story = chosen('noise');
export const Takes: Story = chosen('takes');
export const Breath: Story = chosen('breath');

// The evidence-changed banner is up: the select is off and says why.
export const DisabledWhileEvidenceChanged: Story = {
  args: { evidenceChanged: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('combobox', { name: 'Type of finding' })).toBeDisabled();
  },
};

// Every word is offered.
export const TenWords: Story = {
  play: async ({ canvasElement }) => {
    const options = within(canvasElement).getAllByRole('option');
    await expect(options.map((o) => o.getAttribute('value'))).toEqual([...FINDING_NOTE_TYPES]);
  },
};
