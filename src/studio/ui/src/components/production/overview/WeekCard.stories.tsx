import type { Meta, StoryObj } from '@storybook/react-vite';
import { WeekCard } from './WeekCard';
import { MID_BOOK, NO_TAKE_LOG, overviewFor } from './overviewFixtures';

const meta = { title: 'Production/WeekCard', component: WeekCard, args: { figures: overviewFor(MID_BOOK).week } } satisfies Meta<typeof WeekCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithTakeLog: Story = {};
// No take log (a REAPER recording): both rows say so and there is no bar.
export const NothingMeasured: Story = { args: { figures: overviewFor(MID_BOOK, undefined, NO_TAKE_LOG).week } };

// #3443: under a minute recorded this week, against a target of under a minute, and in the last 24 hours.
export const UnderAMinute: Story = { args: { figures: { week: { ok: true, value: 50 }, target: 59.79, last24h: { ok: true, value: 30 } } } };
