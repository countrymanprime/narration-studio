import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProgressChart } from './ProgressChart';
import { MID_BOOK, NO_TAKE_LOG, NOTHING_RECORDED, STORY_TODAY, overviewFor } from './overviewFixtures';

const figures = overviewFor(MID_BOOK);
const meta = {
  title: 'Production/ProgressChart',
  component: ProgressChart,
  args: {
    k: figures.k,
    wph: 9300,
    start: figures.start,
    today: STORY_TODAY,
    due: figures.kpi.due,
    recordedHours: figures.recordedHours,
    series: figures.series,
  },
} satisfies Meta<typeof ProgressChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MidWay: Story = {};
// Late: the due date is before the projected finish.
export const Late: Story = {
  args: (() => {
    const late = overviewFor(MID_BOOK, new Date(2026, 9, 3));
    return { k: late.k, due: late.kpi.due };
  })(),
};
export const NoTakeLog: Story = { args: { series: overviewFor(MID_BOOK, undefined, NO_TAKE_LOG).series } };
export const NothingRecorded: Story = {
  args: (() => {
    const none = overviewFor(NOTHING_RECORDED, undefined, NO_TAKE_LOG);
    return { k: none.k, recordedHours: 0, series: none.series };
  })(),
};
