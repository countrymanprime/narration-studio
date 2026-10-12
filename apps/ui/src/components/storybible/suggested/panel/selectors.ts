// The pure selectors behind the Needs verification chip, the entry pill and the scan button (SN-X42), ported from the Studio Next
// mock's Bible page (src/pages/Bible.tsx) and src/selectors/extraction.ts. The counts themselves (`verifyCount`, `verifyOf`,
// `unattached`) are the row's (../row/selectors.ts).

import type { ExtractionScanJob, ExtractionSource, ExtractionSuggestion, SuggestionSource } from '../../../../api/contracts/extraction';
import { verifyOf } from '../row/selectors';

/** The entries with something to verify when the chip is on, all of them when it is off. */
export function filterEntries<E extends { id: string }>(entries: readonly E[], list: readonly ExtractionSuggestion[], verifyOnly: boolean): E[] {
  return verifyOnly ? entries.filter((entry) => verifyOf(list, entry.id) > 0) : [...entries];
}

/** What an entry row's pill says: "Verify · N" while something waits, "Review" when only the entry is flagged, nothing otherwise. */
export function entryPill(verify: number, flagged: boolean): string | null {
  if (verify > 0) return `Verify · ${verify}`;
  return flagged ? 'Review' : null;
}

/** The sources a press of Scan starts: the ones the narrator starts (not an imported file) that can run now, in the host's order. */
export const availableSourceIds = (sources: readonly ExtractionSource[]): SuggestionSource[] => sources.filter((s) => s.runs && s.available).map((s) => s.id);

const SKIPPED = 'Skipped ';

/**
 * The sentences that say what did not run: one per skipped source, from the job's log lines ("Skipped GLiNER: GLiNER is not downloaded."),
 * and the job's own message when the whole scan failed. What the other sources found is kept either way.
 */
export function scanFailures(job: ExtractionScanJob | null): string[] {
  if (!job) return [];
  const skipped = job.logs.filter((line) => line.startsWith(SKIPPED)).map((line) => line.slice(SKIPPED.length));
  return job.phase === 'error' && job.message ? [...skipped, job.message] : skipped;
}
