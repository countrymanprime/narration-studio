import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Button } from '../../../primitives/Button';
import { Icon } from '../../../primitives/Icon';
import { TextField } from '../../../primitives/TextField';
import { RailFieldRow, RailOptionRow } from './RailOptionRow';

// The option rows of the Script page's rail share one grid (label or field left, control right, 32 px tall), so a source menu and a
// field with its Save line up at every width the rail is shown at (380 px rail, 380 px drawer).
const meta = {
  title: 'Script/RailOptionRow',
  component: RailOptionRow,
  args: { label: 'Definitions from', children: null },
  decorators: [(Story) => <div className="w-[356px] space-y-3 rounded-lg bg-[var(--surface)] p-3">{Story()}</div>],
} satisfies Meta<typeof RailOptionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const menu = (text: string) => (
  <Button variant="secondary" size="sm">
    {text}
    <Icon name="openMenu" />
  </Button>
);

export const Default: Story = { render: (args) => <RailOptionRow {...args}>{menu('Web page')}</RailOptionRow> };

export const WithHint: Story = {
  render: (args) => (
    <RailOptionRow {...args} hint="Opens the page in your browser; nothing is read here.">
      {menu('Web page')}
    </RailOptionRow>
  ),
};

export const WordCardOptions: Story = {
  render: () => (
    <>
      <RailOptionRow label="Definitions from">{menu('Source: Web page')}</RailOptionRow>
      <RailOptionRow label="How I will say it">{menu('Manual')}</RailOptionRow>
      <RailFieldRow
        field={<TextField label="How I will say it" mono placeholder="for example: kroh-KAY" value="" onChange={() => {}} />}
        action={<Button variant="secondary">Save</Button>}
      />
    </>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Save' })).toBeVisible();
    const rows = canvasElement.querySelectorAll('[data-rail-row]');
    await expect(rows).toHaveLength(3);
  },
};

export const LongLabelWraps: Story = {
  render: (args) => (
    <RailOptionRow {...args} label="Where the definition for this very long word comes from when the narrator has several sources turned on">
      {menu('Web page')}
    </RailOptionRow>
  ),
};
