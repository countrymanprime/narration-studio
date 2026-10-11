// The Proof notes list's row view model and the pure selectors over it (Studio Next mock: src/selectors/proof.ts). A row is a
// `Finding` worded for the table; the host filters by status and sorts by `FindingsQuery.sort`, and what the query cannot say
// (the chips that are not one status, the waveform window, find) narrows the page here.
import { FINDING_CATEGORIES, type Finding, type FindingsQuery, type FindingSortKey } from '../../../api/contracts/findings';
import type { StatusTone } from '../../primitives/StatusBadge';
import { analyzerLabel, categoryLabel, evidenceKindLabel, formatTime } from '../findingFormat';
import { fixKindOf, resolutionOf } from '../resolution';
import { proofProgress } from '../proof.selectors';

export type NoteRow = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  /** Project seconds, null when the analyzer gave no time. */
  seconds: number | null;
  time: string;
  type: string;
  script: string;
  heard: string;
  /** The analyzer's name; the Sources line counts by it. */
  from: string;
  confidence: number | null;
  confidenceReason: string;
  resolution: { label: string; tone: StatusTone };
  /** Not dismissed: SN-Q2's "open" (a waive is a dismissal, an accepted or deferred note is decided and still open). */
  open: boolean;
  decided: boolean;
  /** Accepted as a pickup (not an edit). */
  pickup: boolean;
};

/** The resolution words of the mock's table: a decision reads as a word, never a colour alone (ADR 0470). */
function resolutionWords(finding: Finding): { label: string; tone: StatusTone } {
  const { status } = finding.review;
  const base = resolutionOf(finding);
  if (status === 'accepted') return { label: fixKindOf(finding) === 'edit' ? 'Fix in edit' : 'Needs pickup', tone: base.tone };
  return base;
}

export function noteRow(finding: Finding): NoteRow {
  const chapterId = finding.manuscript?.chapter_id ?? '';
  const status = finding.review.status;
  const seconds = finding.time_range?.start ?? null;
  return {
    id: finding.id,
    chapterId,
    chapterTitle: finding.manuscript?.chapter_title || chapterId || 'No chapter',
    seconds,
    time: seconds === null ? '—' : formatTime(seconds),
    type: evidenceKindLabel(finding),
    script: finding.manuscript?.expected ?? '',
    heard: finding.manuscript?.recorded ?? '',
    from: analyzerLabel(finding.analyzer),
    confidence: finding.confidence,
    confidenceReason: finding.confidence_reason,
    resolution: resolutionWords(finding),
    open: status !== 'dismissed',
    decided: status !== 'unreviewed',
    pickup: status === 'accepted' && fixKindOf(finding) === 'pickup',
  };
}

export type NoteChip = 'all' | 'review' | 'open' | 'pickups' | 'decided';

export const NOTE_CHIPS: ReadonlyArray<{ key: NoteChip; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'review', label: 'To review' },
  { key: 'open', label: 'Open' },
  { key: 'pickups', label: 'Pickups' },
  { key: 'decided', label: 'Decided' },
];

const reviewing = (row: NoteRow) => !row.decided;

export function matchesChip(row: NoteRow, chip: NoteChip): boolean {
  switch (chip) {
    case 'review':
      return reviewing(row);
    case 'open':
      return row.open;
    case 'pickups':
      return row.pickup;
    case 'decided':
      return row.decided;
    default:
      return true;
  }
}

/** Each chip's count; Open and Decided come from SN-Q2's `proofProgress` so the chips and the header never disagree. */
export function chipCounts(rows: readonly NoteRow[]): Record<NoteChip, number> {
  const progress = proofProgress({ total: rows.length, decided: rows.filter((r) => r.decided).length, cleared: rows.filter((r) => !r.open).length }, 0);
  return {
    all: rows.length,
    review: rows.filter(reviewing).length,
    open: progress.open,
    pickups: rows.filter((r) => r.pickup).length,
    decided: progress.decided,
  };
}

/** The digits the widest count can take, so a decision never widens a chip. */
export const countDigits = (counts: Record<NoteChip, number>): number => Math.max(1, String(Math.max(...Object.values(counts))).length);

export type NoteWindow = { start: number; len: number; total: number };

/** The "In view" chip exists only while the waveform window is narrower than the chapter. */
export const windowIsNarrow = (window: NoteWindow | undefined): window is NoteWindow => !!window && window.len < window.total;

export const inWindow = (row: NoteRow, window: NoteWindow): boolean =>
  row.seconds !== null && row.seconds >= window.start && row.seconds <= window.start + window.len;

/** Find in notes: what was written (the script) or said (heard), case-insensitive. */
export function matchesFind(row: NoteRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || `${row.script} ${row.heard}`.toLowerCase().includes(q);
}

export type NoteSort = 'time' | 'confidence' | 'severity';

export const NOTE_SORTS: ReadonlyArray<{ value: NoteSort; label: string }> = [
  { value: 'time', label: 'By time' },
  { value: 'confidence', label: 'By confidence' },
  { value: 'severity', label: 'By severity' },
];

/** The sort is the host's: By time, confidence (lowest first, none last) and severity (errors first) are `FindingsQuery.sort` keys. */
export const queryFor = (sort: NoteSort, chapterId?: string): FindingsQuery => ({ sort: sort satisfies FindingSortKey, ...(chapterId ? { chapterId } : {}) });

/** The sources the rows in view come from, each with how many it gave, most first. */
export function sourcesOf(rows: readonly NoteRow[]): Array<{ source: string; n: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.from, (counts.get(row.from) ?? 0) + 1);
  return [...counts].map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n || a.source.localeCompare(b.source));
}

export const sourcesText = (rows: readonly NoteRow[]): string =>
  sourcesOf(rows)
    .map(({ source, n }) => `${source} ${n}`)
    .join(' · ');

export type NoteGroup = { chapterId: string; title: string; rows: NoteRow[]; open: number };

/** One group per chapter that has notes, in the order the chapters first appear; "<n> open" counts notes that are not cleared. */
export function groupByChapter(rows: readonly NoteRow[]): NoteGroup[] {
  const groups = new Map<string, NoteGroup>();
  for (const row of rows) {
    const group = groups.get(row.chapterId) ?? { chapterId: row.chapterId, title: row.chapterTitle, rows: [], open: 0 };
    group.rows.push(row);
    if (row.open) group.open += 1;
    groups.set(row.chapterId, group);
  }
  return [...groups.values()];
}

/** Characters of the longest Type label: every type chip gets this width so a changed type never moves the cells. */
export const TYPE_CHIP_CH = Math.max(...FINDING_CATEGORIES.map((c) => categoryLabel(c).length), 'Extra words'.length);
/** Characters of the longest resolution word. */
export const RESOLUTION_CHIP_CH = Math.max(...['To review', 'Needs pickup', 'Fix in edit', 'Waived', 'Deferred'].map((l) => l.length));
