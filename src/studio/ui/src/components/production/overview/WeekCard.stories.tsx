import type { Meta, StoryObj } from '@storybook/react-vite';
import { WeekCard } from './WeekCard';
import { MID_BOOK, NO_TAKE_LOG, overviewFor } from './overviewFixtures';

const meta = { title: 'Production/WeekCard', component: WeekCard, args: { figures: overviewFor(MID_BOOK).week } } satisfies Meta<typeof WeekCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithTakeLog: Story = {};
// No take log (a REAPER recording): both rows say so and there is no bar.
export const NothingMeasured: Story = { args: { figures: overviewFor(MID_BOOK, undefined, NO_TAKE_LOG).week } };
