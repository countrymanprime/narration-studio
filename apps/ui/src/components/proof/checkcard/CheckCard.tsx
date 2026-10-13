import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoverageGapReviews, CoverageResult, CoverageState } from '../../../api/contracts/coverage';
import type { Finding } from '../../../api/contracts/findings';
import { describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { useCapability } from '../../../useCapability';
import type { ManuscriptChapter } from '../../../types';
import { EnginePanelLink } from '../../engine/EnginePanelContext';
import { Button } from '../../primitives/Button';
import { Dot, StatusBadge, type StatusTone } from '../../primitives/StatusBadge';
import { Icon } from '../../primitives/Icon';
import { IconButton } from '../../primitives/IconButton';
import { Pill } from '../../primitives/Pill';
import { ProgressBar } from '../../primitives/ProgressBar';
import {
  asOfLabel,
  AUDIO_COUNTS,
  CARD_GLYPH,
  CARD_LABEL,
  cardCounts,
  cardFindings,
  cardState,
  cardTally,
  checkSentence,
  estimateLabel,
  hasRecording,
  NO_RECORDING_WHY,
  recordedLabel,
  runningFor,
  SPEECH_COUNTS,
  STALE_TEXT,
  staleWhy,
  unfinishedSentence,
  type CountKey,
  type ReviewStatus,
} from './cardSelectors';
import { FindingRow } from './FindingRow';

const STATE_TONE: Record<'none' | 'checking' | 'current' | 'stale', StatusTone> = { none: 'neutral', checking: 'info', current: 'success', stale: 'warning' };
const COUNT_COLOUR: Record<CountKey, string> = {
  misread: 'var(--danger)',
  missing: 'var(--warn)',
  extra: 'var(--info)',
  noise: 'var(--text-muted)',
  breath: 'var(--text-muted)',
  click: 'var(--text-muted)',
};
const FILTERS: ReadonlyArray<{ key: ReviewStatus; label: string }> = [
  { key: 'todo', label: 'To decide' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'ignored', label: 'Ignored' },
];
const AUDIO_CATEGORIES = ['audio_quality', 'silence_cleanup'] as const;

type Loaded = { result: CoverageResult; reviews: CoverageGapReviews; audio: Finding[] };

/**
 * The recording check for the chapter in view (Studio Next mock: pages/proof/CheckCard.tsx): the check's state, the recorded length against
 * the script estimate, what the check found by category, and its findings with Accept and Ignore. It decides nothing by itself: a run
 * and a load only read. "Check recordings" hands the chapter to `onCheck` (the dialog is the caller's).
 */
export function CheckCard({ chapter, onCheck }: { chapter: ManuscriptChapter; onCheck: (chapterId: string) => void }) {
  const coverage = usePort('coverage');
  const findings = usePort('findings');
  const dawReview = useCapability('review');
  const [loaded, setLoaded] = useState<Loaded>();
  const [run, setRun] = useState<CoverageState>();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<ReviewStatus>('todo');
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(0);
  const chapterId = chapter.id;

  const load = useCallback(async () => {
    const ticket = ++latest.current;
    try {
      const [result, reviews, ...audio] = await Promise.all([
        coverage.coverageResult(chapterId),
        coverage.coverageGapReviews(chapterId),
        ...AUDIO_CATEGORIES.map((category) => findings.findingsList({ chapterId, category })),
      ]);
      if (ticket === latest.current) setLoaded({ result, reviews, audio: audio.flatMap((page) => page.findings) });
    } catch (cause) {
      if (ticket === latest.current) setError(describeApiError(cause));
    }
  }, [coverage, findings, chapterId]);

  useEffect(() => {
    setLoaded(undefined);
    setResolved({});
    setError('');
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    let sawRunning = false;
    const apply = (state: CoverageState) => {
      if (!active) return;
      const mine = runningFor(state, chapterId);
      setRun(mine);
      if (mine) sawRunning = true;
      else if (sawRunning && state.chapterId === chapterId) {
        sawRunning = false;
        void load();
      }
    };
    const unsubscribe = coverage.subscribeCoverage(apply);
    coverage
      .coverageState()
      .then(apply)
      // A failed seed leaves the card on the stored result until the next coverage:state event.
      .catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [coverage, chapterId, load]);

  // A stored result is shown only for a recording that is measured: a check cannot be "up to date" against nothing.
  const stored = hasRecording(chapter.recordedSeconds) ? loaded?.result : undefined;
  const state = cardState(stored, run !== undefined);
  const hasResult = stored?.result !== undefined && (state === 'current' || state === 'stale');
  const all = cardFindings(hasResult ? loaded?.result : undefined, loaded?.reviews ?? {}, hasResult ? (loaded?.audio ?? []) : []);
  const counts = cardCounts(all, hasResult);
  const differences = hasResult ? (loaded?.result.result?.gaps ?? []).length : undefined;
  const tally = cardTally(all);
  const stale = state === 'stale' && loaded ? staleWhy(loaded.result) : undefined;
  const dim = state === 'stale';
  const unfinished = hasResult && loaded ? unfinishedSentence(loaded.result) : undefined;
  const asOf = hasResult && loaded ? asOfLabel(loaded.result) : undefined;
  const listed = state === 'current' && all.length > 0;
  const shown = all.filter((finding) => finding.status === filter);

  const whyNot =
    chapter.recordedSeconds === undefined || chapter.recordedSeconds <= 0
      ? 'This chapter has no recording to check.'
      : chapter.wordCount <= 0
        ? 'This chapter has no text to check against.'
        : !dawReview.available
          ? 'The DAW is not reachable.'
          : '';

  const noRecording = !hasRecording(chapter.recordedSeconds) && chapter.recordedUnavailable ? NO_RECORDING_WHY[chapter.recordedUnavailable] : undefined;

  const decide = async (id: string, action: () => Promise<string | void>) => {
    setBusy(true);
    setError('');
    try {
      const word = await action();
      if (word) setResolved((current) => ({ ...current, [id]: word }));
      await load();
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setBusy(false);
    }
  };
  const accept = (id: string) => {
    const finding = all.find((entry) => entry.id === id);
    if (!finding) return;
    void decide(id, async () => {
      if (finding.source === 'gap') {
        await coverage.coverageGapAccept(chapterId, id);
        return finding.suggested;
      }
      await findings.findingsReview({ id, evidenceVersion: finding.finding?.evidence_version ?? '', status: 'accepted', note: '' });
      return finding.suggested;
    });
  };
  const ignore = (id: string) => {
    const finding = all.find((entry) => entry.id === id);
    if (!finding) return;
    void decide(id, async () => {
      if (finding.source === 'gap') await coverage.coverageGapIgnore(chapterId, id);
      else await findings.findingsReview({ id, evidenceVersion: finding.finding?.evidence_version ?? '', status: 'dismissed', note: '' });
    });
  };

  const group = (label: string, entries: ReadonlyArray<{ key: CountKey; label: string }>) => (
    <div className={`flex flex-col gap-1.5 ${dim ? 'text-[var(--text-muted)]' : ''}`}>
      <span className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">{label}</span>
      <ul className="flex flex-wrap gap-2">
        {entries.map((entry) => (
          <li
            key={entry.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-0.5 text-sm"
            data-count={entry.key}
          >
            <Dot color={COUNT_COLOUR[entry.key]} />
            {entry.label}
            <b className="font-mono">{counts ? counts[entry.key] : '—'}</b>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section
      aria-label="Recording check"
      data-check-state={state}
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Recording check</h3>
        <StatusBadge tone={STATE_TONE[state]} label={CARD_LABEL[state]} icon={CARD_GLYPH[state]} />
        <span className="flex-1" />
        {listed && (
          <IconButton label={open ? 'Hide the findings' : 'Show the findings'} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <Icon name={open ? 'previous' : 'next'} />
          </IconButton>
        )}
        {state === 'checking' ? (
          <Button variant="secondary" onClick={() => void coverage.coverageCancel()}>
            Cancel
          </Button>
        ) : (
          <Button
            variant={state === 'current' ? 'secondary' : 'primary'}
            disabled={whyNot !== ''}
            aria-describedby={whyNot ? 'check-why-not' : undefined}
            onClick={() => onCheck(chapterId)}
          >
            Check recordings
          </Button>
        )}
      </div>
      {whyNot && state !== 'checking' && (
        <p id="check-why-not" className="text-sm text-[var(--text-muted)]">
          {whyNot}
          {noRecording ? (
            <>
              {' '}
              <span>{noRecording.text}</span>
              {noRecording.engine ? (
                <>
                  {' '}
                  <EnginePanelLink />
                </>
              ) : null}
            </>
          ) : null}
        </p>
      )}
      <div className={`grid gap-4 sm:grid-cols-[auto_auto_1fr] ${dim ? 'text-[var(--text-muted)]' : ''}`}>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Recorded</span>
          <b className="font-mono text-xl" data-cc-recorded>
            {recordedLabel(chapter.recordedSeconds)}
          </b>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Script estimate</span>
          <b className="font-mono text-xl" data-cc-estimate title="Estimated from the word count at the standard rate">
            {estimateLabel(chapter.wordCount)}
          </b>
        </div>
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          {state === 'none' && <span>Not checked yet</span>}
          {state === 'checking' && run && (
            <>
              <span>Checking the recording against the script…</span>
              <div className="flex items-center gap-2.5">
                <ProgressBar className="flex-1" label="Checking" value={run.percent} running />
                <span className="font-mono text-[var(--text-muted)]">{Math.round(run.percent)}%</span>
              </div>
            </>
          )}
          {differences !== undefined && <span data-cc-sentence>{checkSentence(differences)}</span>}
          {unfinished && <span data-cc-unfinished>{unfinished}</span>}
          {asOf && (
            <span className="text-[var(--text-muted)]" data-cc-asof>
              {asOf}
            </span>
          )}
        </div>
      </div>
      {stale && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-[var(--radius-button)] border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm text-[var(--warn-text)]"
          data-stale={stale}
        >
          <span aria-hidden="true">{CARD_GLYPH.stale}</span> {STALE_TEXT[stale]}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-[var(--danger-text)]">
          {error}
        </p>
      )}
      {group('Against the script', SPEECH_COUNTS)}
      {group('In the audio', AUDIO_COUNTS)}
      {listed && open && (
        <div className="flex flex-col gap-2" data-findings>
          <div className="flex flex-wrap items-center gap-2">
            <b>Check findings · {all.length}</b>
            <div role="group" aria-label="Filter findings" className="flex gap-1.5">
              {FILTERS.map(({ key, label }) => (
                <Pill key={key} label={`${label} ${tally[key]}`} active={filter === key} onClick={() => setFilter(key)} />
              ))}
            </div>
          </div>
          {shown.length > 0 ? (
            <ul>
              {shown.map((finding) => (
                <FindingRow
                  key={finding.id}
                  finding={finding}
                  resolved={resolved[finding.id]}
                  busy={busy}
                  onAccept={() => accept(finding.id)}
                  onIgnore={() => ignore(finding.id)}
                />
              ))}
            </ul>
          ) : (
            <span className="text-sm text-[var(--text-muted)]">Nothing here.</span>
          )}
        </div>
      )}
    </section>
  );
}
