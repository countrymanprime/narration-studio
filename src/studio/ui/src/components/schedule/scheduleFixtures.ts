import type { ProductionMilestone } from '../../api/contracts/production';
import { WPH } from './estimates';
import type { ScheduleChapter } from './progress';

/** The day the stories' estimates start from, so a status reads the same on every run. */
export const STORY_TODAY = new Date(2026, 9, 1);

/** Two chapters of one finished hour each, none recorded: 3 h of recording is 2 days at the daily pace. */
export const STORY_CHAPTERS: ScheduleChapter[] = [
  { words: WPH, status: 'not_started', kind: 'narration' },
  { words: WPH, status: 'not_started', kind: 'narration' },
];

/** One milestone of each status: done, late, at risk, on track and not estimated. */
export const STORY_MILESTONES: ProductionMilestone[] = [
  { name: 'Contract signed', dueDate: '2026-09-20', done: true },
  { name: 'All recorded', dueDate: '2026-10-01', measure: 'rec' },
  { name: 'First 15 minutes', dueDate: '2026-10-03', measure: 'checkpoint', note: 'Upload for the rights holder to approve.' },
  { name: 'Whole book', dueDate: '2026-11-15', measure: 'all' },
  { name: 'Retail sample', dueDate: '2026-10-12' },
];
