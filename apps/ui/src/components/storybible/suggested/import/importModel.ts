// What the import dialog works out for itself. Every number in the preview comes from the host (SNX-Q2); this only chooses the format
// hint, words the size refusal and counts the lines the host returned.

import type { ExtractionImportLine, ExtractionImportPlan, ImportFormat } from '../../../../api/contracts/extraction';
import { apiErrorMessage } from '../../../../api/errorMessage';
import { pct } from '../row/selectors';

/** The host's file limit (storybible-import format: 2 MiB), used until the host's own `maxBytes` has been read. */
export const IMPORT_MAX_BYTES = 2 << 20;

/** A failed host call as one sentence a narrator can read: the host's own words, or `fallback` when it gave none. Never "Error: ...". */
export function readableFailure(error: unknown, fallback: string): string {
  const text = apiErrorMessage(error)
    .replace(/^(?:\w*Error:\s*)+/, '')
    .trim();
  return text && text !== '[object Object]' && text !== 'undefined' && text !== 'null' ? text : fallback;
}

/** A chosen file's name as drawn: control and bidi-override characters out, so a name cannot read as another extension. */
export function displayName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
}

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
