import type { ProductionMilestone } from '../../api/contracts/production';
import { farDateProblem, isIsoDate, MAX_DATE_YEAR } from './dates';
import { chaptersOf, measOf, minutesOf } from './measures';
import { plural, formatCount } from '../../plural';
import { numberProblem } from '../settings/numberSetting';

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

/** The field of the dialog a refusal is about, when it is about one: where focus goes. */
export type RefusedField = 'name' | 'date' | 'n';

/** How far an N may go: the chapters the book has and the finished minutes it runs. */
export type DraftBounds = { chapters: number; minutes: number };

/** The most the host keeps of an N (its measure pattern allows four digits: ch9999, min9999). */
export const MAX_N = 9999;

/** The range an N may be in: whole numbers from 1 to what the book has, and no more than the host keeps. */
const nRange = (max: number) => ({ min: 1, max: Math.min(max, MAX_N), step: 1, unit: '' });

/** The N a narrator typed, or why it cannot be one. The check is the settings' `numberProblem`; the words say how much the book has. */
function readN(text: string, max: number, noun: 'chapter' | 'finished minute'): { n: number } | { refusal: string } {
  const t = text.trim();
  if (max < 1) return { refusal: `The book has no ${noun}s yet.` };
  // `numberProblem` allows a hair of rounding on a step ("3.000000001"); a count is exactly whole.
  if (t !== '' && numberProblem(nRange(max), t) === undefined && Number.isInteger(Number(t))) return { n: Number(t) };
  const has = noun === 'chapter' ? `The book has ${plural(max, noun)}.` : `The book runs ${plural(max, noun)}.`;
  return { refusal: `${has} ${Math.min(max, MAX_N) === 1 ? 'Write 1.' : `Write a whole number from 1 to ${formatCount(Math.min(max, MAX_N))}.`}` };
}

const N_MEASURES = { chN: ['chapters', 'chapter', 'ch'], minN: ['minutes', 'finished minute', 'min'] } as const;

/** The measure as stored: "first N" takes the N the draft holds, or the refusal saying why it cannot. An N left as the milestone has it is kept, whatever the book now has. */
function storedMeasure(draft: MilestoneDraft, bounds: DraftBounds, existing?: ProductionMilestone): { measure: string } | { refusal: string } {
  if (draft.measure !== 'chN' && draft.measure !== 'minN') return { measure: draft.measure };
  const [field, noun, prefix] = N_MEASURES[draft.measure];
  if (existing?.measure && measOf(existing.measure) === draft.measure && /^\d+$/.test(draft[field].trim())) {
    const held = (draft.measure === 'chN' ? chaptersOf : minutesOf)(existing.measure);
    if (held === Number(draft[field].trim())) return { measure: existing.measure };
  }
  const read = readN(draft[field], bounds[field], noun);
  return 'refusal' in read ? read : { measure: `${prefix}${read.n}` };
}

/**
 * The milestone a draft saves as, or why it cannot be: a name and a real date are needed, and the refusal says which is missing. A custom milestone has no estimate,
 * so a stored one is kept only while the measure stays what it was; the template it came from is kept.
 */
export function milestoneFromDraft(
  draft: MilestoneDraft,
  existing: ProductionMilestone | undefined,
  bounds: DraftBounds,
): { milestone: ProductionMilestone } | { refusal: string; field?: RefusedField } {
  const name = draft.name.trim();
  if (!name) return { refusal: MISSING_NAME, field: 'name' };
  if ([...name].length > MAX_NAME)
    return { refusal: `The name is ${plural([...name].length, 'character')}; the most is ${formatCount(MAX_NAME)}.`, field: 'name' };
  const date = draft.date.trim();
  if (!isIsoDate(date)) return { refusal: badDate(date), field: 'date' };
  const far = farDateProblem(date);
  if (far) return { refusal: far, field: 'date' };
  const stored = storedMeasure(draft, bounds, existing);
  if ('refusal' in stored) return { ...stored, field: 'n' };
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
