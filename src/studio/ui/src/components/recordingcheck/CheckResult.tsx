import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EnginePanelLink } from '../engine/EnginePanelContext';
import { chapterName } from '../../chapterName';
import type { CoverageReason, CoverageResult } from '../../api/contracts/coverage';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import type { Track } from '../../api/contracts/tracks';
import { describeApiError } from '../../api/errorMessage';
import { usePendingAction } from '../../hooks/usePendingAction';
import { usePort } from '../../ports/usePort';
import { keepFocusOnRemoval } from '../layout/keepFocusOnRemoval';
import { MappingConfirm } from '../mapping/MappingConfirm';
import { Button } from '../primitives/Button';
import { InsetCard } from '../primitives/InsetCard';
import { RecordingCheckReport } from '../production/RecordingCheckReport';
import { COVERAGE_REASON_TEXT, LINK_REASONS, REASON_PAGE, formatWhen, recheckLabel } from '../production/recordingCheckText';

/**
 * One chapter's stored recording check, read out in Check recordings after a single chapter's run or from a row's Show result: the
 * saved-project basis, why a result cannot be trusted with the way to fix it, which models made it, and the full report (`RecordingCheckReport`:
 * the verdict, the figures, the pickups with Go to paragraph and Open in Editing). `actions` (Check again) sits with the report's figures.
 */
export function CheckResult({
  chapter,
  result,
  loadError,
  retry,
  goToParagraph,
  openWorkspace,
  actions,
}: {
  chapter: ManuscriptChapter;
  result?: CoverageResult;
  loadError: string;
  retry: () => Promise<void>;
  goToParagraph: (index: number) => void;
  openWorkspace?: () => void;
  actions: ReactNode;
}) {
  if (loadError) {
    return (
      <div role="alert" className="space-y-2">
        <p style={{ color: 'var(--danger-text)' }}>The last check could not be read: {loadError}</p>
        <Button ref={keepFocusOnRemoval} variant="secondary" onClick={() => void retry()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!result) return <p role="status">Reading the last check…</p>;
  return (
    <div className="space-y-4 text-sm">
      {result.basis && (
        <p style={{ color: 'var(--text-muted)' }}>
          Based on the saved REAPER project, file modified {formatWhen(result.basis.modifiedAt)}.
          {result.basis.stale && ' The saved file is older than the recorded audio: save the project in REAPER, then check again.'}
        </p>
      )}
      {result.state === 'never' && (
        <>
          <p>
            Not checked yet. A check transcribes this chapter&rsquo;s audio from the saved project and compares it with the text, so you can see what is still
            to record. It changes nothing in the project.
          </p>
          {result.reasons.length > 0 && <ReasonBlock tone="note" title="Before checking" reasons={result.reasons} chapter={chapter} onLinked={retry} />}
          {actions}
        </>
      )}
      {result.state === 'stale' && (
        <ReasonBlock
          tone="note"
          title="This result is out of date"
          reasons={result.reasons}
          chapter={chapter}
          onLinked={retry}
          footer={result.record ? `Checked ${formatWhen(result.record.completedAt)}. The counts below are from then; check again to update them.` : undefined}
        />
      )}
      {result.state === 'current' && result.record && (
        <p style={{ color: 'var(--text-muted)' }}>
          Checked {formatWhen(result.record.completedAt)}
          {result.result ? ` with the ${result.result.model} Whisper model` : ''}
          {result.result && recheckLabel(result.result) ? `; ${recheckLabel(result.result)}` : ''}.
        </p>
      )}
      {result.result && (
        <RecordingCheckReport
          chapter={chapter}
          report={result.result}
          judgement={result.judgement}
          goToParagraph={goToParagraph}
          actionsSlot={actions}
          openWorkspace={openWorkspace}
        />
      )}
      {result.state === 'stale' && !result.result && actions}
    </div>
  );
}

/** Why a check was refused or a result cannot be trusted, in plain words, with the way to fix it where there is one. */
export function ReasonBlock({
  tone,
  title,
  reasons,
  detail,
  footer,
  chapter,
  onLinked,
  onNavigate,
}: {
  tone: 'alert' | 'note';
  title: string;
  reasons: CoverageReason[];
  /** The host's own sentence, which can name a file or an item; shown small under the plain one. */
  detail?: string;
  footer?: string;
  chapter: ManuscriptChapter;
  onLinked: () => Promise<void>;
  /** Runs as a fix link leaves for its page: Check recordings closes, so the page is not under it. */
  onNavigate?: () => void;
}) {
  const unique = [...new Set(reasons)];
  const link = unique.some((reason) => LINK_REASONS.has(reason));
  const pages = [...new Map(unique.flatMap((reason) => (REASON_PAGE[reason] ? [[REASON_PAGE[reason]!.label, REASON_PAGE[reason]!]] : []))).values()];
  return (
    <InsetCard role={tone === 'alert' ? 'alert' : undefined} tone={tone === 'alert' ? 'danger' : 'neutral'} fill className="space-y-2">
      <p className="font-semibold" style={tone === 'alert' ? { color: 'var(--danger-text)' } : undefined}>
        {title}
      </p>
      <ul className="list-disc space-y-1 pl-5">
        {unique.map((reason) => (
          <li key={reason}>{COVERAGE_REASON_TEXT[reason] ?? reason}</li>
        ))}
      </ul>
      {/* A refusal that only wants the track link says so in the bullet and asks for it right under it; the host's own sentence
          would say it a second time, so it is shown only when some other reason needs its detail (a file, an item). */}
      {detail && !unique.every((reason) => LINK_REASONS.has(reason)) && (
        <p className="text-xs break-words" style={{ color: 'var(--text-muted)' }}>
          Details: {detail}
        </p>
      )}
      {footer && <p style={{ color: 'var(--text-muted)' }}>{footer}</p>}
      {link && <TrackLink chapter={chapter} onLinked={onLinked} onNavigate={onNavigate} />}
      {pages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pages.map((page) =>
            'engine' in page ? (
              <EnginePanelLink key={page.label} className="text-sm font-semibold" onOpen={onNavigate}>
                {page.label}
              </EnginePanelLink>
            ) : (
              <Link key={page.label} to={page.path} onClick={onNavigate} className="text-sm font-semibold underline">
                {page.label}
              </Link>
            ),
          )}
        </div>
      )}
    </InsetCard>
  );
}

/** The chapter-track link, confirmed right here: the same prompt the audio engine panel lists. */
function TrackLink({ chapter, onLinked, onNavigate }: { chapter: ManuscriptChapter; onLinked: () => Promise<void>; onNavigate?: () => void }) {
  const tracksPort = usePort('tracks');
  const trackMap = usePort('chapterTrackMap');
  const [tracks, setTracks] = useState<Track[]>();
  const [error, setError] = useState('');
  const confirming = usePendingAction();
  useEffect(() => {
    let active = true;
    tracksPort
      .tracksList()
      .then((project) => active && setTracks(project.tracks))
      .catch((reason) => active && setError(describeApiError(reason)));
    return () => {
      active = false;
    };
  }, [tracksPort]);
  if (error)
    return (
      <p style={{ color: 'var(--danger-text)' }}>
        The REAPER tracks could not be listed: {error} <EnginePanelLink onOpen={onNavigate} />
      </p>
    );
  if (!tracks) return <p role="status">Reading the REAPER tracks…</p>;
  return (
    <MappingConfirm
      chapterTitle={chapterName(chapter, 'short')}
      tracks={tracks}
      busy={confirming.isBusy}
      onConfirm={(trackGuid) =>
        void confirming.run('confirm', async () => {
          try {
            await trackMap.chapterTrackMapConfirm(trackGuid, chapter.id);
            setError('');
            await onLinked();
          } catch (reason) {
            setError(describeApiError(reason));
          }
        })
      }
      onClear={() => {}}
    />
  );
}
