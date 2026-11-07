import type { Meta, StoryObj } from '@storybook/react-vite';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { CheckCountsCard } from './CheckCountsCard';
import { COUNTS, nameOf } from './overviewFixtures';

const meta = {
  title: 'Production/CheckCountsCard',
  component: CheckCountsCard,
  args: { counts: COUNTS, nameOf },
  // The card's Check recordings is the shared button (#2833), which reads what the DAW can do.
  decorators: [(Story) => <ApiProvider api={createMockApi()}>{Story()}</ApiProvider>],
} satisfies Meta<typeof CheckCountsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SomeOutOfDate: Story = {};
export const AllChecked: Story = { args: { counts: { current: ['c1', 'c2'], stale: [], never: [] } } };
