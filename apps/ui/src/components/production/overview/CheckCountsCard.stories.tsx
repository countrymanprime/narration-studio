import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { CheckCountsCard } from './CheckCountsCard';
import { COUNTS, nameOf } from './overviewFixtures';

const meta = { title: 'Production/CheckCountsCard', component: CheckCountsCard, args: { counts: COUNTS, nameOf, onCheck: fn() } } satisfies Meta<
  typeof CheckCountsCard
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SomeOutOfDate: Story = {};
export const DawUnreachable: Story = { args: { unavailable: 'REAPER is not running.' } };
export const AllChecked: Story = { args: { counts: { current: ['c1', 'c2'], stale: [], never: [] } } };
