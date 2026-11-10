import type { Meta, StoryObj } from '@storybook/react-vite';
import { CheckedStamp } from './CheckedStamp';

const meta = {
  title: 'Primitives/CheckedStamp',
  component: CheckedStamp,
  args: { at: new Date(2026, 10, 10, 15, 42, 7).getTime() },
} satisfies Meta<typeof CheckedStamp>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Checked: Story = {};
// Nothing is drawn until a read has finished, so the row beside a Check again button does not reserve a gap.
export const NotYetChecked: Story = { args: { at: null } };
