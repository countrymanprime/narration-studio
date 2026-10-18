// The Delivery page's "Before you build" rows: one per chapter, judged by the host's per-file results (MeasureFileResult, docs/guides/using-the-app/master-and-qc.md#exporting-a-report, never
// recomputed against retyped numbers). A chapter's file is the measured file whose name carries its title or its number ("Chapter 04.wav");
// a chapter with no file, or a file the host did not judge, is "Not mastered". A row names its chapter with `chapterName`, so it
// reads in the manuscript's own heading style ("CHAPTER IV. — The Rabbit Sends in a Little Bill"), as Script's list does.
import { chapterName } from '../../../chapterName';
import type { DeliveryProfile, ManuscriptChapter, MeasureFileResult } from '../../../types';
import { CREDITS_ID, CREDITS_NAME, type CreditsEntry } from '../../credits/creditsEntries';
import { fileOf } from '../../master/chapterFile';
import { fileVerdict, missesWithLimit } from '../../master/fileVerdict';

export type ChapterState = { id: string; name: string; kind: 'ok' | 'bad' | 'wait'; text: string };

type Listed = Pick<ManuscriptChapter, 'id' | 'title' | 'subtitle' | 'index'>;

/**
 * The rows' chapters in the mock's order: the opening credits, the chapters, then the closing credits. A credits file is judged like a
 * chapter's, paired with its measured file by name ("Opening credits.wav"); a manuscript's own opening-credits chapter is already in
 * `chapters` and stands in for the opening entry (`creditsEntries` leaves that one out).
 */
export function listedChapters(chapters: readonly ManuscriptChapter[], credits: { opening?: CreditsEntry; closing?: CreditsEntry }): Listed[] {
  const credit = (entry: CreditsEntry): Listed => ({ id: CREDITS_ID[entry.kind], title: CREDITS_NAME[entry.kind], index: -2 });
  return [...(credits.opening ? [credit(credits.opening)] : []), ...chapters, ...(credits.closing ? [credit(credits.closing)] : [])];
}

export function chapterStates(chapters: readonly Listed[], files: readonly MeasureFileResult[]): ChapterState[] {
  return chapters.map((chapter) => stateOf({ id: chapter.id, name: chapterName(chapter) }, fileOf(chapter, files)));
}

/**
 * The first chapter in the rows' order whose file misses a rule, as "Chapter 8: noise floor −57.8 dBFS (limit ≤ −60 dBFS)" (and how many
 * more rules it misses), so the reason Build is off is on the page and not behind Master & QC. Nothing when no chapter fails.
 */
export function firstFailure(chapters: readonly Listed[], files: readonly MeasureFileResult[], profile: DeliveryProfile): string | undefined {
  for (const chapter of chapters) {
    const file = fileOf(chapter, files);
    if (!file || fileVerdict(file) !== 'fail') continue;
    const [first, ...rest] = missesWithLimit(file, profile);
    if (first === undefined) continue;
    return `${chapterName(chapter)}: ${first}${rest.length > 0 ? `, and ${rest.length} more ${rest.length === 1 ? 'rule' : 'rules'}` : ''}.`;
  }
  return undefined;
}

/**
 * When no chapter fails but some are not ready, the first of them in the rows' order and why: "Chapter 8: no measured file yet." (no file
 * matches), "Chapter 8: not measured yet." / "could not be read." (its file is pending, cancelled or failed), or "Chapter 8: part of its file could not
 * be measured." (a silent render). Nothing when every chapter has a verdict, or when no file was measured at all: the count beside Build
 * already says that, and a red first chapter on an untouched book would only repeat it.
 */
export function firstNotReady(chapters: readonly Listed[], files: readonly MeasureFileResult[]): string | undefined {
  if (files.length === 0) return undefined;
  for (const chapter of chapters) {
    const file = fileOf(chapter, files);
    if (file && fileVerdict(file) !== 'none') continue;
    return `${chapterName(chapter)}: ${notReadyWhy(file)}.`;
  }
  return undefined;
}

function notReadyWhy(file: MeasureFileResult | undefined): string {
  if (!file) return 'no measured file yet';
  if (file.status === 'failed') return 'its file could not be read';
  if (file.status !== 'measured') return 'its file is not measured yet';
  // The line says "measured" and fileVerdict said "none": either a rule could not be measured, or nothing was judged at all.
  return file.rules.some((rule) => rule.status === 'not_measurable') ? 'part of its file could not be measured' : 'the app judged nothing about its file';
}

/** One row's state from its file: no file, or a file the host did not judge, is "Not mastered". */
export function stateOf(base: { id: string; name: string }, file: MeasureFileResult | undefined): ChapterState {
  const verdict = file ? fileVerdict(file) : 'none';
  if (!file || verdict === 'none') return { ...base, kind: 'wait', text: 'Not mastered' };
  if (verdict === 'pass') return { ...base, kind: 'ok', text: 'Pass' };
  const failing = file.rules.filter((rule) => rule.status === 'not_met').length;
  return { ...base, kind: 'bad', text: `Fails ${failing} ${failing === 1 ? 'check' : 'checks'}` };
}

/** How many rows fail and how many are not ready: the two numbers Delivery's button and Master & QC's package card both say. */
export function readinessCounts(states: readonly ChapterState[]): { bad: number; wait: number } {
  return { bad: states.filter((state) => state.kind === 'bad').length, wait: states.filter((state) => state.kind === 'wait').length };
}

/** What the build button says it is waiting on: "2 failing, 1 not ready", or that every chapter passes. */
export function readiness(states: readonly ChapterState[]): { ready: boolean; text: string } {
  const { bad, wait } = readinessCounts(states);
  if (states.length === 0) return { ready: false, text: 'There are no chapters to check.' };
  return bad + wait === 0 ? { ready: true, text: 'Every chapter passes.' } : { ready: false, text: `${bad} failing, ${wait} not ready` };
}
