import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { PageHeader } from './PageHeader';
import { calcFor, FINISHED, MID_BOOK, STORY_TODAY } from './pipelineFixtures';

const meta = {
  title: 'Production/PageHeader',
  component: PageHeader,
  args: {
    chapters: 5,
    words: 46500,
    k: calcFor(MID_BOOK),
    today: STORY_TODAY,
    due: new Date(2026, 9, 31),
    record: { ok: true, reason: '' },
    timerRunning: false,
    onStopTimer: fn(),
    onStartSession: fn(),
    onExport: fn(),
    onOpenSchedule: fn(),
  },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnTrack: Story = {};
// Within a week of the due date the tone is told in a word and a shape as well as colour.
export const DueSoon: Story = { args: { due: new Date(2026, 9, 5), k: calcFor(MID_BOOK, new Date(2026, 9, 5)) } };
export const Finished: Story = { args: { k: calcFor(FINISHED) } };
export const NoDueDate: Story = { args: { due: null, k: calcFor(MID_BOOK, null) } };
export const CannotRecordAndTimerRunning: Story = { args: { record: { ok: false, reason: 'No recorder is connected.' }, timerRunning: true } };
