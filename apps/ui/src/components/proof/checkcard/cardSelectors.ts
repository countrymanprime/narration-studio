// The pure side of the Proof recording check card (Studio Next mock: src/selectors/checkcard.ts): which of the four states the chapter's
// check is in, the recorded length against the script estimate, the counts by category, and the findings the card lists. Real data only:
// the stored `CoverageResult`, the live `CoverageState`, the gap reviews and the audio analyzers' findings.
import type { CoverageGap, CoverageGapReviews, CoverageReason, CoverageResult, CoverageState } from '../../../api/contracts/coverage';
import type { Finding } from '../../../api/contracts/findings';
import type { RecordedUnavailable } from '../../../api/contracts/manuscript';
import { formatAudioTime, formatWhen, plural } from '../../production/recordingCheckText';
import { WPH } from '../../schedule/estimates';

export type CardState = 'none' | 'checking' | 'current' | 'stale';
export type StaleWhy = 'text' | 'recording' | 'save';
export type ReviewStatus = 'todo' | 'accepted' | 'ignored';

/** The state as a word and a shape (never colour alone): the mock's labels, with a glyph that differs per state. */
export const CARD_LABEL: Record<CardState, string> = { none: 'Not checked', checking: 'Checking', current: 'Up to date', stale: 'Out of date' };
export const CARD_GLYPH: Record<CardState, string> = { none: '○', checking: '◐', current: '✓', stale: '▲' };

export const STALE_TEXT: Record<StaleWhy, string> = {
  text: 'The text changed since this check: check again',
  recording: 'Recording changed since this check: check again',
  save: 'The project was saved again since this check: check again',
};

/** Whether a run for this chapter is going now. A run for another chapter, or one that ended, leaves the stored result's own state. */
export function runningFor(run: CoverageState | undefined, chapterId: string): CoverageState | undefined {
  return run && run.phase === 'running' && run.chapterId === chapterId ? run : undefined;
}

export function cardState(result: CoverageResult | undefined, running: boolean): CardState {
  if (running) return 'checking';
  if (!result || result.state === 'never') return 'none';
  return result.state;
}

const TEXT_REASONS: ReadonlySet<CoverageReason> = new Set(['manuscript_changed', 'credits_changed']);
const SAVE_REASONS: ReadonlySet<CoverageReason> = new Set(['project_unreadable', 'result_missing', 'analyzer_changed', 'params_changed']);

/** Why a stale result is out of date: the text first, then the recording (items, takes, files, the track link), else the saved project. */
export function staleWhy(result: CoverageResult): StaleWhy {
  if (result.reasons.some((reason) => TEXT_REASONS.has(reason))) return 'text';
  if (result.reasons.some((reason) => !SAVE_REASONS.has(reason))) return 'recording';
  return 'save';
}

/** Whether the chapter has a measured recording. Without one a stored check cannot be current: there is nothing for it to be a check of. */
export const hasRecording = (seconds: number | undefined): boolean => seconds !== undefined && seconds > 0;

/** Why a chapter has no measured recording, in the words Production and the engine panel use (ADR 0193), and whether the audio engine panel is where to fix it. */
export const NO_RECORDING_WHY: Record<RecordedUnavailable, { text: string; engine: boolean }> = {
  unlinked: { text: 'No track is linked to it.', engine: true },
  multiple_tracks: { text: 'More than one track is linked to it.', engine: true },
  track_missing: { text: 'Its linked track is not in the saved project.', engine: true },
  no_project: { text: 'No saved project could be read.', engine: false },
};

/** The recorded length from the chapter's measured seconds, "—" when none. */
export const recordedLabel = (seconds: number | undefined): string => (seconds !== undefined && seconds > 0 ? formatAudioTime(seconds) : '—');

/** The script's length at the standard rate (an estimate), "—" when the chapter has no words. */
export const estimateLabel = (wordCount: number): string => (wordCount > 0 ? `~${formatAudioTime(Math.round((wordCount / WPH) * 3600))}` : '—');

/** "Checked against the script: no differences found" / "1 difference found" / "N differences found". */
export const checkSentence = (differences: number): string =>
  `Checked against the script: ${differences === 0 ? 'no differences found' : `${plural(differences, 'difference')} found`}`;

/** "As of last save · Sep 26, 8:40 am": the save the check is as of; nothing when the host sent no basis. */
export const asOfLabel = (result: CoverageResult): string | undefined =>
  result.basis ? `As of last save · ${formatWhen(result.basis.modifiedAt)}` : undefined;

/** An unfinished start or end is a sentence, never a count of pickups (ADR 0830). */
export function unfinishedSentence(result: CoverageResult): string | undefined {
  const unfinished = result.result?.unfinished;
  if (!unfinished) return undefined;
  const parts = [unfinished.start > 0 ? 'Start not recorded' : '', unfinished.end > 0 ? 'Not recorded to the end' : ''].filter(Boolean);
  return parts.length > 0 ? `${parts.join('. ')}.` : undefined;
}

export type CountKey = 'misread' | 'missing' | 'extra' | 'noise' | 'breath' | 'click';
export const SPEECH_COUNTS: ReadonlyArray<{ key: CountKey; label: string }> = [
  { key: 'misread', label: 'Misread' },
  { key: 'missing', label: 'Skipped' },
  { key: 'extra', label: 'Extra' },
];
export const AUDIO_COUNTS: ReadonlyArray<{ key: CountKey; label: string }> = [
  { key: 'noise', label: 'Background noise' },
  { key: 'breath', label: 'Breaths' },
  { key: 'click', label: 'Clicks' },
];

/** Which audio count a finding belongs to, by what the analyzer says it heard; undefined for one the card has no count for. */
function audioKind(finding: Finding): 'noise' | 'breath' | 'click' | undefined {
  const kind = typeof finding.evidence?.kind === 'string' ? finding.evidence.kind.toLowerCase() : '';
  if (kind === 'breath') return 'breath';
  if (kind === 'mouth_click' || kind === 'mouth' || kind === 'click' || kind === 'plosive') return 'click';
  return finding.category === 'audio_quality' ? 'noise' : undefined;
}

export type CardFinding = {
  /** The gap id, or the finding id of an audio finding. */
  id: string;
  source: 'gap' | 'audio';
  count: CountKey;
  /** "Misread", "Skipped", "Background noise"... */
  type: string;
  seconds: number | null;
  text: string;
  /** The word the decision would start with: a gap is a pickup, an audio finding an edit. */
  suggested: 'Needs pickup' | 'Fix in edit';
  status: ReviewStatus;
  /** An audio finding, kept to review it with the version of the evidence shown. */
  finding?: Finding;
};

const GAP_TYPE: Record<string, { count: CountKey; type: string }> = {
  misread: { count: 'misread', type: 'Misread' },
  missing: { count: 'missing', type: 'Skipped' },
  extra: { count: 'extra', type: 'Extra' },
};

function gapText(gap: CoverageGap): string {
  if (gap.kind === 'extra') return `“${gap.text ?? gap.firstWord}”`;
  return gap.tokenCount === 1 ? `“${gap.firstWord}”` : `${plural(gap.tokenCount, 'word')}, “${gap.firstWord}” to “${gap.lastWord}”`;
}

const audioStatus = (finding: Finding): ReviewStatus =>
  finding.review.status === 'accepted' ? 'accepted' : finding.review.status === 'dismissed' ? 'ignored' : 'todo';

/** The card's findings: the gaps of the report (kinds the card counts) and the chapter's audio findings, in time order. */
export function cardFindings(result: CoverageResult | undefined, reviews: CoverageGapReviews, audio: readonly Finding[]): CardFinding[] {
  const gaps: CardFinding[] = (result?.result?.gaps ?? []).flatMap((gap) => {
    const kind = GAP_TYPE[gap.kind];
    if (!kind) return [];
    const review = reviews[gap.id];
    return [
      {
        id: gap.id,
        source: 'gap' as const,
        ...kind,
        seconds: gap.position?.sourceTime ?? null,
        text: gapText(gap),
        suggested: 'Needs pickup' as const,
        status: review === 'accepted' ? 'accepted' : review === 'ignored' ? 'ignored' : 'todo',
      },
    ];
  });
  const heard: CardFinding[] = audio.flatMap((finding) => {
    const count = audioKind(finding);
    if (!count) return [];
    return [
      {
        id: finding.id,
        source: 'audio' as const,
        count,
        type: AUDIO_COUNTS.find((entry) => entry.key === count)?.label ?? 'Audio',
        seconds: finding.time_range?.start ?? null,
        text: finding.manuscript?.recorded || finding.confidence_reason || 'Found in the recording',
        suggested: 'Fix in edit' as const,
        status: audioStatus(finding),
        finding,
      },
    ];
  });
  return [...gaps, ...heard].sort((a, b) => (a.seconds ?? Infinity) - (b.seconds ?? Infinity));
}

/** The counts by category, null while there is no result to count. */
export function cardCounts(findings: readonly CardFinding[], hasResult: boolean): Record<CountKey, number> | null {
  if (!hasResult) return null;
  const counts: Record<CountKey, number> = { misread: 0, missing: 0, extra: 0, noise: 0, breath: 0, click: 0 };
  for (const finding of findings) counts[finding.count] += 1;
  return counts;
}

export const cardTally = (findings: readonly CardFinding[]): Record<ReviewStatus, number> => ({
  todo: findings.filter((finding) => finding.status === 'todo').length,
  accepted: findings.filter((finding) => finding.status === 'accepted').length,
  ignored: findings.filter((finding) => finding.status === 'ignored').length,
});
