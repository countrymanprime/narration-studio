// What the import dialog works out for itself. Every number in the preview comes from the host (SNX-Q2); this only chooses the format
// hint, words the size refusal and counts the lines the host returned.

import type { ExtractionImportLine, ExtractionImportPlan, ImportFormat } from '../../../../api/contracts/extraction';
import { pct } from '../row/selectors';

/** How long typing pauses before the text goes to the host for a preview (D72: the text leaves the page only then). */
export const PREVIEW_DEBOUNCE_MS = 250;

/** Rows drawn per table. The host caps a file at 5000 rows; the rest are counted, not drawn ("and N more"). */
export const LIST_CAP = 200;

/** The format a chosen file's extension names; anything else lets the host work it out from the text. */
export function hintFromName(name: string): ImportFormat | undefined {
  if (/\.json$/i.test(name)) return 'json';
  if (/\.csv$/i.test(name)) return 'csv';
  return undefined;
}

/** The sentence for a file over the host's limit. */
export function tooBigSentence(maxBytes: number): string {
  const mb = maxBytes / (1 << 20);
  return `That file is too big to import (limit ${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB).`;
}

export type ImportCounts = { add: number; merge: number; skip: number; verify: number; errors: number };

/** Counts over every line the host returned, not only the ones drawn. */
export function countsOf(plan: ExtractionImportPlan): ImportCounts {
  const counts: ImportCounts = { add: 0, merge: 0, skip: 0, verify: 0, errors: plan.errors.length };
  for (const line of plan.lines) {
    counts[line.action] += 1;
    if (line.status === 'needs-verification') counts.verify += 1;
  }
  return counts;
}

/** The "Becomes" cell: the status the 75% rule gave the line and its score ("To verify · 40%", "Accepted · no score"). */
export function becomes(line: ExtractionImportLine): string {
  if (!line.status) return '—';
  const status = line.status === 'needs-verification' ? 'To verify' : 'Accepted';
  return `${status} · ${line.confidence == null ? 'no score' : `${pct(line.confidence)}%`}`;
}

export const ACTION_LABEL = { add: 'Add', merge: 'Merge', skip: 'Skip' } as const satisfies Record<ExtractionImportLine['action'], string>;

/** "Add 3 to the Story Bible", or no count while nothing would be added. */
export const addLabel = (offered: number): string => `Add${offered > 0 ? ` ${offered}` : ''} to the Story Bible`;
