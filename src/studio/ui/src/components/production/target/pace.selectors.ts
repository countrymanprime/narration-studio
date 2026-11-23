// The finished-hour target as pure selectors (the mock's selectors/pace.ts). The standard rate is a fixed input; the narrator's own rate
// is worked out from the chapters that have a measured finished length (SN0-Q4: never from the timer or the hours log). The schedule uses
// the plan's chosen basis and falls back to the standard while nothing is measured. A selector imports no value, so the fixed
// inputs from `schedule/estimates.ts` (`WPH`, `MIN_OWN_RATE_CHAPTERS`) come in as arguments.
import type { ProductionRateBasis } from '../../../api/contracts/production';
import type { Measured } from '../../../api/schemas/base';
import { audibleSeconds } from '../../../recordedThrough';

const HOUR_SECONDS = 3600;

export const NO_LENGTHS = 'No chapter has a measured length yet.';

/**
 * The finished length of the chapters that have been measured, by chapter id, from the shared chapter list (a chapter's `recordedSeconds`), or the reason there is none.
 * One rule for audio: a length under a second is no length (0 s), so the pace and every other reader agree with the board. `undefined` is a list not read yet.
 */
export function chapterLengthsOf(chapters: readonly { id: string; recordedSeconds?: number | null }[] | undefined): Measured<Record<string, number>> {
  if (!chapters) return { ok: false, reason: 'Reading the measured lengths…' };
  const lengths: Record<string, number> = {};
  for (const chapter of chapters) {
    const seconds = audibleSeconds(chapter.recordedSeconds);
    if (seconds !== null) lengths[chapter.id] = seconds;
  }
  return Object.keys(lengths).length ? { ok: true, value: lengths } : { ok: false, reason: NO_LENGTHS };
}

/** A chapter as the pace sees it: its id, the short tag the breakdown names it by, and its words. */
export type PaceChapter = { id: string; tag: string; words: number };

export type OwnRate = {
  /** Words per finished hour, over the measured chapters. */
  wph: number;
  words: number;
  /** Their finished length in seconds. */
  seconds: number;
  /** The chapters it was worked out from, in book order. */
  chapters: PaceChapter[];
};

/**
 * Words per finished hour over the chapters that have words and a measured length, or the reason there is none. A length of 0 is none: the measurements port reads audio under a
 * second as 0 s (`audibleSeconds`), so a chapter the board says has "None yet" does not count here.
 */
export function ownRate(chapters: readonly PaceChapter[], lengths: Measured<Readonly<Record<string, number>>>, minChapters: number): Measured<OwnRate> {
  if (!lengths.ok) return lengths;
  const have = chapters.filter((c) => c.words > 0 && (lengths.value[c.id] ?? 0) > 0);
  if (have.length < minChapters) {
    return { ok: false, reason: `Needs ${minChapters} chapters with a measured length; ${have.length} so far.` };
  }
  const words = have.reduce((sum, c) => sum + c.words, 0);
  const seconds = have.reduce((sum, c) => sum + lengths.value[c.id], 0);
  return { ok: true, value: { wph: Math.round((words / seconds) * HOUR_SECONDS), words, seconds, chapters: have } };
}

/** The basis the schedule really uses: the narrator's own rate only when it was chosen and is measured. */
export function basisOf(chosen: ProductionRateBasis | undefined, own: Measured<OwnRate>): ProductionRateBasis {
  return chosen === 'own' && own.ok ? 'own' : 'standard';
}

/** Words per finished hour under the basis in use. */
export function wphOf(chosen: ProductionRateBasis | undefined, own: Measured<OwnRate>, standardWph: number): number {
  return basisOf(chosen, own) === 'own' && own.ok ? own.value.wph : standardWph;
}

/** The book's finished hours both ways; `own` is null while nothing is measured. */
export function targetHours(chapters: readonly PaceChapter[], own: Measured<OwnRate>, standardWph: number): { standard: number; own: number | null } {
  const words = chapters.reduce((sum, c) => sum + c.words, 0);
  return { standard: words / standardWph, own: own.ok ? words / own.value.wph : null };
}
