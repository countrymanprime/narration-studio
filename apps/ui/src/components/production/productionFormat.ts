import type { ChapterStatus } from '../../api/contracts/manuscript';
import { STATUS_ORDER } from '../../chapterStatus';

// The stage timer's figures and a measured length (SN0-Q4: the timer, PFH and the effective rate stay as built). Every figure is measured or logged (ADR 0320): an
// undefined one is a dash, never 0 and never an estimate, and nothing here projects a pace from the time logged so far.

const DASH = '—';

/** Hours or seconds as h:mm, to the nearest minute. */
export function formatClock(amount: number, unit: 'hours' | 'seconds'): string {
  const minutes = Math.round(unit === 'hours' ? amount * 60 : amount / 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** A chapter's length as m:ss, to the nearest second. */
export function formatLength(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Hours worked per finished hour, to one decimal. */
export const formatPfh = (pfh: number | null) => (pfh === null ? DASH : pfh.toFixed(1));

/** The effective rate as a bare whole number: the amount is in the narrator's own currency, so no symbol is guessed. */
export const formatRate = (rate: number | null) => (rate === null ? DASH : Math.round(rate).toLocaleString('en-US'));

const STAGE_WORD: Record<ChapterStatus, string> = { not_started: 'prep', recording: 'record', editing: 'edit', proofing: 'proof', finalized: 'final' };

/** "record 5:40 · edit 3:55": the hours logged per stage, in pipeline order. */
export function stageHoursHint(hoursByStage: Partial<Record<ChapterStatus, number>>): string {
  return STATUS_ORDER.flatMap((stage) => {
    const hours = hoursByStage[stage];
    return hours === undefined || hours <= 0 ? [] : [`${STAGE_WORD[stage]} ${formatClock(hours, 'hours')}`];
  }).join(' · ');
}
