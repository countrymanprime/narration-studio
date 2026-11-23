import type { ProductionMilestone } from '../../api/contracts/production';
import { farDateProblem, isIsoDate, MAX_DATE_YEAR } from './dates';
import { chaptersOf, measOf, minutesOf } from './measures';
import { plural, formatCount } from '../../plural';

/** Everything the milestone dialog edits. `measure` is an id from the measure list; `chapters` and `minutes` are the N of "first N" as typed, so a bad one can be refused, not rewritten. */
export type MilestoneDraft = { name: string; date: string; measure: string; chapters: string; minutes: string; note: string; done: boolean };

/** A draft that shows an existing milestone. */
export const draftOf = (m: ProductionMilestone): MilestoneDraft => ({
  name: m.name,
  date: m.dueDate,
  measure: measOf(m.measure),
  chapters: String(chaptersOf(m.measure)),
  minutes: String(minutesOf(m.measure)),
  note: m.note ?? '',
  done: Boolean(m.done),
});

/** A draft for a new milestone. */
export const blankDraft = (): MilestoneDraft => ({
  name: '',
  date: '',
  measure: 'custom',
  chapters: String(chaptersOf(undefined)),
  minutes: String(minutesOf(undefined)),
  note: '',
  done: false,
});

export const MISSING_NAME = 'Give the milestone a name.';
export const MISSING_DATE = 'Give the milestone a due date.';
/** The most the host keeps of a milestone's name and note (the mock mirrors them), counted in characters. */
const MAX_NAME = 200;
const MAX_NOTE = 2000;

/** Why a typed date cannot be a milestone's: nothing written, or something that is not a real date. */
const badDate = (text: string): string => {
  const t = text.trim();
  if (t === '') return MISSING_DATE;
  // A real day in a year the plan cannot use is told its range, not that it is not a date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(t) && Number(t.slice(0, 4)) < 1000) return `${t} is too early. Write a date from the year 1000 to ${MAX_DATE_YEAR}.`;
  return `${t} is not a real date. Write it YYYY-MM-DD.`;
};

/** How far an N may go: the chapters the book has and the finished minutes it runs. */
export type DraftBounds = { chapters: number; minutes: number };

/** The N a narrator typed, or why it cannot be one: whole digits only, from 1 to `max`. */
function readN(text: string, max: number, noun: 'chapter' | 'minute'): { n: number } | { refusal: string } {
  const t = text.trim();
  if (noun === 'chapter' && max < 1) return { refusal: 'The book has no chapters yet.' };
  const whole = `Write a whole number of ${noun}s from 1 to ${formatCount(max)}.`;
  if (!/^\d+$/.test(t) || Number(t) < 1) return { refusal: whole };
  if (Number(t) > max) return { refusal: noun === 'chapter' ? `The book has ${plural(max, 'chapter')}. Write a number from 1 to ${formatCount(max)}.` : whole };
  return { n: Number(t) };
}

/** The measure as stored: "first N" takes the N the draft holds, or the refusal saying why it cannot. */
function storedMeasure(draft: MilestoneDraft, bounds: DraftBounds): { measure: string } | { refusal: string } {
  if (draft.measure === 'chN' || draft.measure === 'minN') {
    const read = draft.measure === 'chN' ? readN(draft.chapters, bounds.chapters, 'chapter') : readN(draft.minutes, bounds.minutes, 'minute');
    return 'refusal' in read ? read : { measure: `${draft.measure === 'chN' ? 'ch' : 'min'}${read.n}` };
  }
  return { measure: draft.measure };
}

/**
 * The milestone a draft saves as, or why it cannot be: a name and a real date are needed, and the refusal says which is missing. A custom milestone has no estimate,
 * so a stored one is kept only while the measure stays what it was; the template it came from is kept.
 */
export function milestoneFromDraft(
  draft: MilestoneDraft,
  existing: ProductionMilestone | undefined,
  bounds: DraftBounds,
): { milestone: ProductionMilestone } | { refusal: string } {
  const name = draft.name.trim();
  if (!name) return { refusal: MISSING_NAME };
  if ([...name].length > MAX_NAME) return { refusal: `The name is ${plural([...name].length, 'character')}; the most is ${formatCount(MAX_NAME)}.` };
  const date = draft.date.trim();
  if (!isIsoDate(date)) return { refusal: badDate(date) };
  const far = farDateProblem(date);
  if (far) return { refusal: far };
  const stored = storedMeasure(draft, bounds);
  if ('refusal' in stored) return stored;
  const { measure } = stored;
  const keepEstimate = existing?.estimate !== undefined && measOf(measure) !== 'custom' && existing.measure === measure;
  const note = draft.note.trim();
  if ([...note].length > MAX_NOTE) return { refusal: `The note is ${plural([...note].length, 'character')}; the most is ${formatCount(MAX_NOTE)}.` };
  return {
    milestone: {
      name,
      dueDate: date,
      ...(measure === 'custom' ? {} : { measure }),
      ...(note ? { note } : {}),
      ...(draft.done ? { done: true } : {}),
      ...(keepEstimate ? { estimate: existing.estimate } : {}),
      ...(existing?.template ? { template: existing.template } : {}),
    },
  };
}
