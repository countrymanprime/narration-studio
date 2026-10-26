import type { CoverageEngine, CoverageResult } from '../../api/contracts/coverage';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';

/**
 * The chapters the dialog offers: the ones with a recording. A length the host measured counts; so does a stored share when no length is known.
 * A chapter the opener asked for (`asked`: a chapter's own Check recordings) is offered too while nothing has measured its recording, since
 * not measured is not empty; a recording measured as empty is still left out.
 */
export function recordedChapters(chapters: readonly ManuscriptChapter[], asked: readonly string[] = []): ManuscriptChapter[] {
  return chapters.filter((chapter) => {
    if (chapter.removedFromRecording) return false;
    if (chapter.recordedSeconds !== undefined) return chapter.recordedSeconds > 0;
    return (chapter.recordedFraction ?? 0) > 0 || asked.includes(chapter.id);
  });
}

/** The ticked ids that are still offered, in the chapter list's order. */
export function selectedIds(chapters: readonly ManuscriptChapter[], ticked: ReadonlySet<string>): string[] {
  return chapters.filter((chapter) => ticked.has(chapter.id)).map((chapter) => chapter.id);
}

/** The recorded length of the ticked chapters. A chapter without a measured length adds nothing and is counted in `unmeasured`. */
export function audioToCheck(chapters: readonly ManuscriptChapter[], ticked: ReadonlySet<string>): { seconds: number; unmeasured: number } {
  let seconds = 0;
  let unmeasured = 0;
  for (const chapter of chapters) {
    if (!ticked.has(chapter.id)) continue;
    if (chapter.recordedSeconds === undefined) unmeasured += 1;
    else seconds += chapter.recordedSeconds;
  }
  return { seconds, unmeasured };
}

/** A length in the narrator's words: "1 h 12 min", "42 min", "0 min". */
export function formatAudio(seconds: number): string {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

/** The "Audio to check" line's note on chapters whose length was not measured, or '' when none were left out. */
export function unmeasuredNote(unmeasured: number): string {
  if (unmeasured === 0) return '';
  return `${unmeasured} ${unmeasured === 1 ? 'chapter' : 'chapters'} left out: length not measured`;
}

const STATE_LABEL: Record<CoverageResult['state'], string> = { current: 'Checked, as of last save', stale: 'Out of date', never: 'Not checked yet' };

export const checkStateLabel = (result: CoverageResult | undefined): string => STATE_LABEL[result?.state ?? 'never'];

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** The unfinished paragraphs of a stored report, at the start and end. */
const unfinishedCount = (result: CoverageResult): number => (result.result?.unfinished?.start ?? 0) + (result.result?.unfinished?.end ?? 0);

/** What a stored check says: "<engine> · N lines to redo · read 4 of 6 paragraphs". '' when the chapter has no stored report. */
export function lastResultSentence(result: CoverageResult | undefined): string {
  const report = result?.result;
  if (!result || !report) return '';
  const bits = [report.model];
  if (report.gaps) bits.push(plural(report.gaps.length, 'line to redo', 'lines to redo'));
  const unfinished = unfinishedCount(result);
  if (unfinished > 0) bits.push(`read ${Math.max(0, report.paragraphs.length - unfinished)} of ${report.paragraphs.length} paragraphs`);
  return bits.join(' · ');
}

/** What a finished run found, counted from the stored results: gaps are the lines to redo, and an unfinished start or end is a chapter not recorded to the end, never a line to redo. */
export function runTotals(checked: readonly CoverageResult[]): { chapters: number; linesToRedo: number; notToTheEnd: number } {
  return {
    chapters: checked.length,
    linesToRedo: checked.reduce((sum, result) => sum + (result.result?.gaps?.length ?? 0), 0),
    notToTheEnd: checked.filter((result) => unfinishedCount(result) > 0).length,
  };
}

export function finishedToast(totals: ReturnType<typeof runTotals>): string {
  return `Checked ${plural(totals.chapters, 'chapter', 'chapters')} · ${plural(totals.linesToRedo, 'line', 'lines')} to redo · ${totals.notToTheEnd} not recorded to the end`;
}

export function stoppedToast(finished: number, interrupted = 1): string {
  const left = interrupted === 1 ? 'the one in progress stored nothing' : `the ${interrupted} in progress stored nothing`;
  return finished === 0 ? 'Stopped. Nothing was stored.' : `Stopped. ${plural(finished, 'chapter', 'chapters')} finished and kept; ${left}.`;
}

export const engineOptionLabel = (engine: CoverageEngine): string => (engine.installState === 'installed' ? engine.label : `${engine.label} (not installed)`);
