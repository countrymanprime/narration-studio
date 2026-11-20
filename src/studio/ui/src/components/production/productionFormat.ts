import type { ChapterStatus } from '../../api/contracts/manuscript';
import { STATUS_ORDER } from '../../chapterStatus';
import { hm } from '../schedule/dates';

// The stage timer's figures and a measured length (SN0-Q4: the timer, PFH and the effective rate stay as built). Every figure is measured or logged: an
// undefined one is a dash, never 0 and never an estimate, and nothing here projects a pace from the time logged so far.

const DASH = '—';

/** Hours or seconds as hours and minutes ("5h 40m"), to the nearest minute, through the one hours formatter (`hm`). */
export function formatClock(amount: number, unit: 'hours' | 'seconds'): string {
  return hm(unit === 'hours' ? amount : amount / 3600);
}

/** Hours worked per finished hour, to one decimal. */
export const formatPfh = (pfh: number | null) => (pfh === null ? DASH : pfh.toFixed(1));

/** The effective rate as a bare whole number: the amount is in the narrator's own currency, so no symbol is guessed. */
export const formatRate = (rate: number | null) => (rate === null ? DASH : Math.round(rate).toLocaleString('en-US'));

const STAGE_WORD: Record<ChapterStatus, string> = { not_started: 'prep', recording: 'record', editing: 'edit', proofing: 'proof', finalized: 'final' };

/** "record 5h 40m · edit 3h 55m": the hours logged per stage, in pipeline order. */
export function stageHoursHint(hoursByStage: Partial<Record<ChapterStatus, number>>): string {
  return STATUS_ORDER.flatMap((stage) => {
    const hours = hoursByStage[stage];
    return hours === undefined || hours <= 0 ? [] : [`${STAGE_WORD[stage]} ${formatClock(hours, 'hours')}`];
  }).join(' · ');
}
