import type { Meta, StoryObj } from '@storybook/react-vite';
import { WPH } from './estimates';
import { parseIso } from './dates';
import { calc, type ScheduleChapter } from './progress';
import { STORY_TODAY } from './scheduleFixtures';
import { VerdictPill } from './VerdictPill';

const book: ScheduleChapter[] = [{ words: WPH, status: 'not_started', kind: 'narration' }];
const at = (due: string, chapters = book) => ({ k: calc(chapters, STORY_TODAY, parseIso(due)), today: STORY_TODAY, due: parseIso(due) });

const meta = { title: 'Schedule/VerdictPill', component: VerdictPill, args: at('2026-12-01') } satisfies Meta<typeof VerdictPill>;

export default meta;
type Story = StoryObj<typeof meta>;

// The verdict reads as words and a mark (✓, ! or ✕), never colour alone (ADR 0801: the projection can only worsen the tone).
export const OnTrack: Story = {};
export const Tight: Story = { args: at('2026-10-06') };
export const Behind: Story = { args: at('2026-09-28') };
export const Finished: Story = { args: at('2026-09-28', [{ ...book[0], status: 'finalized' }]) };
export const NoDueDate: Story = { args: { k: calc(book, STORY_TODAY, null), today: STORY_TODAY, due: null } };
