// How the Review page words a finding. The wire values stay the source of truth (docs/architecture/findings-contract.md);
// everything here is display only, and an unknown value (a newer host, a later analyzer) shows as itself rather than
// failing.
import type { Finding, FindingSeverity } from '../../types';
import { deliveryEvidence, deliveryEvidenceRows, deliveryFileName, deliverySummary } from './deliveryFindingFormat';
import { clockTenths } from '../../clock';

const CATEGORY_LABELS: Record<string, string> = {
  transcript_discrepancy: 'Transcript difference',
  pronunciation: 'Pronunciation',
  entity: 'Story Bible entry',
  pickup: 'Pickup',
  duplicate_read: 'Duplicate read',
  take_comparison: 'Take comparison',
  character_continuity: 'Character continuity',
  pacing: 'Pacing',
  audio_quality: 'Audio quality',
  delivery_qc: 'Delivery check',
  silence_cleanup: 'Silence cleanup',
  level_consistency: 'Level consistency',
};

const ANALYZER_LABELS: Record<string, string> = {
  'transcript-compare': 'Local AI compare',
  'story-bible': 'Story Bible',
  'take-review': 'Take review',
  'take-comparison': 'Take comparison',
  measure: 'Delivery measurement',
};

const SEVERITY_LABELS: Record<FindingSeverity, string> = { error: 'Error', warning: 'Warning', info: 'Info' };

// Transcript Compare's evidence.kind (src/studio/desktop/internal/transcript/findings_adapter.go).
const KIND_LABELS: Record<string, string> = { MISREAD: 'Misread', SKIPPED: 'Skipped', EXTRA: 'Extra words' };

// The Story Bible adapter's evidence.condition (src/studio/desktop/internal/guide/findings_adapter.go).
const CONDITION_LABELS: Record<string, string> = {
  needs_review: 'The entry is marked "needs review"',
  low_confidence_pronunciation: 'Its pronunciation is uncertain',
};

/** A wire value with no label reads as words, not as an identifier: "audio_quality" becomes "Audio quality". */
const humanize = (value: string): string => {
  const words = value.replace(/[_-]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : value;
};

export const categoryLabel = (category: string): string => CATEGORY_LABELS[category] ?? humanize(category);
export const analyzerLabel = (analyzer: string): string => ANALYZER_LABELS[analyzer] ?? humanize(analyzer);
export const severityLabel = (severity: FindingSeverity): string => SEVERITY_LABELS[severity] ?? humanize(severity);

/** "90%", or "No score" when the analyzer has no numeric confidence (its reason says why). */
export const confidenceLabel = (confidence: number | null): string => (confidence === null ? 'No score' : `${Math.round(confidence * 100)}%`);

/** A note's time on Proof as the mock writes it: mm:ss.s, minutes always two digits ("02:14.6"). */
export function noteTime(seconds: number): string {
  return clockTenths(seconds, { minuteDigits: 2 });
}

/** The chapter a finding is in; a delivery finding is about a file, not a chapter, so it names its file. */
export const chapterLabel = (finding: Finding): string =>
  finding.manuscript?.chapter_title || finding.manuscript?.chapter_id || (deliveryEvidence(finding) ? deliveryFileName(finding) : undefined) || 'No chapter';

/** The chapter words a duplicate read says again (issue #2251 item 30): Transcript Compare's EXTRA or the recording check's extra gap that
 * repeats the text beside it. Undefined for any other finding. */
export const repeatOf = (finding: Pick<Finding, 'category' | 'evidence'>): string | undefined =>
  finding.category === 'duplicate_read' ? text(finding.evidence?.repeat_of) : undefined;

// evidence.kind of a group the retired take review saved (#2765).
const TAKE_REVIEW_KINDS: Record<string, string> = {
  exact_copy: 'Exact copy',
  restart: 'Restart',
  pickup: 'Partial pickup',
  near_duplicate: 'Near duplicate',
};

/** What a group the retired take review saved was, from its own evidence: its kind, how many reads and the script sentences
 * they covered (counted from 1). Undefined for any other finding, or evidence missing one of them. */
function takeReviewSummary(finding: Finding): string | undefined {
  if (finding.analyzer !== 'take-review') return undefined;
  const { kind, members, matched_span_first: first, matched_span_last: last } = finding.evidence ?? {};
  if (typeof kind !== 'string' || !Array.isArray(members) || typeof first !== 'number' || typeof last !== 'number') return undefined;
  const span = first === last ? `sentence ${first + 1}` : `sentences ${first + 1}–${last + 1}`;
  return `${TAKE_REVIEW_KINDS[kind] ?? humanize(kind)}: ${members.length} read${members.length === 1 ? '' : 's'} of ${span}`;
}

/** One line that says what the finding is about, for the list: what was expected and what was heard, or the entry it names. */
export function findingSummary(finding: Finding): string {
  const group = takeReviewSummary(finding);
  if (group) return group;
  const delivery = deliveryEvidence(finding);
  if (delivery) return deliverySummary(delivery);
  const again = repeatOf(finding);
  if (again) return `Said twice: “${again}”`;
  const expected = finding.manuscript?.expected;
  const recorded = finding.manuscript?.recorded;
  if (expected && recorded) return `“${expected}” read as “${recorded}”`;
  if (expected && finding.category === 'transcript_discrepancy') return `“${expected}” not heard`;
  if (recorded && finding.category === 'transcript_discrepancy') return `“${recorded}” heard, not in the script`;
  if (expected) return `“${expected}”`;
  if (recorded) return `“${recorded}”`;
  return categoryLabel(finding.category);
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined);

/** The analyzer-specific evidence the page knows how to word, as label and value pairs in reading order; unknown keys are left out. */
export function evidenceRows(finding: Finding): Array<{ label: string; value: string }> {
  const delivery = deliveryEvidence(finding);
  if (delivery) return deliveryEvidenceRows(delivery);
  const evidence = finding.evidence ?? {};
  const rows: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: string | undefined) => value && rows.push({ label, value });
  const kind = text(evidence.kind);
  const again = repeatOf(finding);
  add('Kind', again ? 'Said twice' : kind && (KIND_LABELS[kind] ?? humanize(kind.toLowerCase())));
  add('Said again', again);
  const condition = text(evidence.condition);
  add('Why', condition && (CONDITION_LABELS[condition] ?? humanize(condition)));
  add('Pronunciation confidence', text(evidence.pronunciation_confidence));
  add('Script', text(evidence.script_context));
  add('Recording', text(evidence.audio_context));
  add('Excerpt', text(evidence.excerpt));
  if (typeof evidence.timing_gap_seconds === 'number') add('Pause at the boundary', `${evidence.timing_gap_seconds.toFixed(2)} s`);
  add('Existing REAPER marker', text(evidence.existing_marker_name));
  return rows;
}

/** When the decision was recorded, in the narrator's own locale; the raw text when it is not a date. */
export function formatDecidedAt(timestamp: string | undefined): string | undefined {
  if (!timestamp) return undefined;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
