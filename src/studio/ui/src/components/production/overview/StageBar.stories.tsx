import type { Meta, StoryObj } from '@storybook/react-vite';
import { StageBar } from './StageBar';
import { FINISHED, MID_BOOK, NOTHING_RECORDED, overviewFor } from './overviewFixtures';

const meta = {
  title: 'Production/StageBar',
  component: StageBar,
  args: { segments: overviewFor(MID_BOOK).segments, wph: 9300 },
} satisfies Meta<typeof StageBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MidWay: Story = {};
export const Finished: Story = { args: { segments: overviewFor(FINISHED).segments } };
export const NothingRecorded: Story = { args: { segments: overviewFor(NOTHING_RECORDED).segments } };
