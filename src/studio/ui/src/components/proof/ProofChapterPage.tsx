import { headingName } from '../../chapterHeading';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EnginePanelLink } from '../engine/EnginePanelContext';
import { useApi } from '../../api/ApiContext';
import { apiErrorMessage } from '../../api/errorMessage';
import { chapterName } from '../../chapterName';
import { formatWhen } from '../production/recordingCheckText';
import { LoadErrorPanel } from '../layout/LoadError';
import { Button } from '../primitives/Button';
import { Heading } from '../primitives/Heading';
import { Panel } from '../primitives/Panel';
import { LoadingRegion, Skeleton } from '../primitives/Skeleton';
import { SectionLabel } from '../primitives/SectionLabel';
import type { Notify } from '../primitives/Toast';
import type { ManuscriptChapter, TranscriptState } from '../../types';
import { openCheckRecordings } from '../recordingcheck/openCheckRecordings';
import type { WorkspaceAlignmentResult } from '../../api/contracts/workspace';
import { CommandScope } from '../../input/router';
import { CompareRun } from './CompareRun';
import { PreviewPanel } from './PreviewPanel';
import { ProofingStagePanel } from './ProofingStagePanel';
import { NativeTakesPanel } from './NativeTakesPanel';

const CHECK_STATE_LABEL: Record<WorkspaceAlignmentResult['state'], string> = {
  current: 'Check current',
  stale: 'Check stale',
  never: 'Not checked yet',
};

type ChapterViewProps = {
  notify: Notify;
  /** The app-wide Transcript Compare state (App's bootstrap plus the host's transcript event). */
  transcript: TranscriptState;
  /** The compare run and its REAPER actions need a linked project file. */
  dawFileLinked: boolean;
  goToManuscript: (chapter: string, paragraph?: number) => void;
  /** Opens the Editing page at this chapter, on a finding's flagged word (the stage panel's finding links). */
  goToEditing: (chapterId: string, findingId?: string) => void;
  /** Changes after a manuscript import or replacement, so the stage panel reads again. */
  refreshKey: string;
};

/**
 * Proof's chapter view, `/proof/:chapterId`: what the chapter page held besides the workspace, which the Editing page replaced (SN-E9,
 * docs/guides/using-the-app/editing.md). The recording check's state and Check again, the native takes, Transcript Compare's run against this chapter (CompareRun),
 * and the Preview and stage panels; none of them is in the Studio Next mock, so they stay as built (D98). One component per chapter
 * (keyed by the id).
 */
export function ProofChapterPage(props: ChapterViewProps) {
  const { chapterId = '' } = useParams<{ chapterId: string }>();
  return <ChapterView key={chapterId} chapterId={chapterId} {...props} />;
}

function ChapterView({ chapterId, notify, transcript, dawFileLinked, goToManuscript, goToEditing, refreshKey }: ChapterViewProps & { chapterId: string }) {
  const api = useApi();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState<ManuscriptChapter>();
  const [linkedTrackGuid, setLinkedTrackGuid] = useState<string>();
  const [alignment, setAlignment] = useState<WorkspaceAlignmentResult>();
  const [loadError, setLoadError] = useState('');
  // False until the chapters and track links have been read, so "no such chapter" is told apart from "still reading".
  const [read, setRead] = useState(false);
  const [lastCompleted, setLastCompleted] = useState<TranscriptState>();
  const [reviewingLast, setReviewingLast] = useState(false);
  const [reload, setReload] = useState(0);
  // Retry after a failed read: counted apart from `reload` (which only re-reads the check's state) so both reads run again.
  const [attempt, setAttempt] = useState(0);

  // The last completed comparison, offered for review without running again (it needs no linked project file).
  useEffect(() => {
    void api
      .transcriptLastCompleted()
      .then(setLastCompleted)
      .catch(() => {});
  }, [api]);

  // The check's state for the header; read again after Check recordings closes.
  useEffect(() => {
    let live = true;
    api
      .workspaceAlignment(chapterId)
      .then((next) => live && setAlignment(next))
      .catch((reason: unknown) => live && setLoadError(apiErrorMessage(reason)));
    return () => {
      live = false;
    };
  }, [api, chapterId, reload, attempt]);

  useEffect(() => {
    let active = true;
    Promise.all([api.manuscriptChapters(), api.chapterTrackMapList()])
      .then(([chapters, mapping]) => {
        if (!active) return;
        setRead(true);
        setChapter(chapters.find((candidate) => candidate.id === chapterId));
        setLinkedTrackGuid(mapping.mappings.find((entry) => entry.chapterId === chapterId)?.trackGuid);
      })
      .catch((reason: unknown) => {
        if (active) setLoadError(apiErrorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [api, chapterId, attempt]);

  // Clears the error and the half-read state first, so the skeleton shows with no stale sentence under it, then both reads run again.
  const retry = () => {
    setLoadError('');
    setRead(false);
    setChapter(undefined);
    setAlignment(undefined);
    setAttempt((n) => n + 1);
  };

  // How many of the compare run's results are this chapter's: the live run's once it succeeds, or the last completed one while the
  // narrator reviews it. A run covers the selected REAPER audio, so rows for other chapters are left out.
  const compareResults = reviewingLast ? lastCompleted : transcript.phase === 'success' ? transcript : undefined;
  const foundHere = useMemo(
    () => (chapter ? (compareResults?.rows ?? []).filter((row) => row.chapter === chapter.title).length : 0),
    [compareResults?.rows, chapter],
  );

  // One frame for every state: the breadcrumb and the title row at the page gutter, full width like Proof (alignment audit XPC-12, XPC-17), so
  // the title does not move between loading, failed and loaded.
  const frame = (title: string, crumb: ReactNode, children: ReactNode, status?: ReactNode) => (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="h-5 truncate text-sm leading-5" style={{ color: 'var(--text-muted)' }}>
        <Link to="/proof">Proof</Link> <span aria-hidden="true">&rsaquo;</span> {crumb}
      </nav>
      {/* The status and its button on the title's centre line (XPC-19); a button's height even without one, so the title sits at one y. */}
      <div className="flex min-h-[var(--control-height)] flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <Heading title={title} />
        </div>
        {status}
      </div>
      {children}
    </div>
  );
  const backToProof = { label: 'Back to Proof', onClick: () => navigate('/proof') };

  let content: ReactNode;
  if (loadError) {
    // A way back beside Retry (R4PC-2).
    content = frame('Proof', 'This chapter', <LoadErrorPanel message={loadError} retry={retry} exit={backToProof} />);
  } else if (chapter === undefined && !read) {
    // Still reading: the frame stays, and the cards are blocks of about their loaded heights (R3PC-13).
    content = frame(
      'Proof',
      <Skeleton className="inline-block h-3 w-48 align-middle" />,
      <LoadingRegion label="Loading the chapter" status="Reading the chapter…" className="flex flex-col gap-4">
        <Skeleton className="h-80" />
        <Skeleton className="h-60" />
        <Skeleton className="h-40" />
      </LoadingRegion>,
    );
  } else if (chapter === undefined) {
    content = frame(
      'Proof',
      'This chapter',
      <Panel title="This chapter is not in the manuscript">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          The address names a chapter the manuscript does not have. <Link to="/proof">Back to Proof</Link>
        </p>
      </Panel>,
    );
  } else {
    // What the title row's status does not say, as one strip of sentences under it rather than a card each (XPC-13); "not checked yet" is the
    // status itself, so it is not said again.
    const notices = [
      alignment?.needsAlignAgain && (
        <p key="align">
          This chapter was last checked before the app could read its word alignment. Run Check again to edit it word by word on the Editing page.
        </p>
      ),
      !linkedTrackGuid && (
        <p key="link">
          <b className="font-semibold" style={{ color: 'var(--text)' }}>
            No linked track.
          </b>{' '}
          This chapter isn&rsquo;t linked to a REAPER track yet. Link one from the Chapter links table in the audio engine panel, then open this chapter again.{' '}
          <EnginePanelLink />
        </p>
      ),
    ].filter(Boolean);
    content = frame(
      `Proof · ${headingName(chapter)}`,
      headingName(chapter),
      <>
        {notices.length > 0 && (
          <div className="space-y-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {notices}
          </div>
        )}
        <NativeTakesPanel chapter={chapter} />
        <CompareRun
          chapterTitle={chapterName(chapter, 'short')}
          state={transcript}
          notify={notify}
          dawFileLinked={dawFileLinked}
          lastCompleted={lastCompleted}
          reviewingLast={reviewingLast}
          onReviewLast={() => setReviewingLast(true)}
          onCloseLast={() => setReviewingLast(false)}
          foundHere={foundHere}
        />
        <PreviewPanel notify={notify} goToManuscript={goToManuscript} />
        <ProofingStagePanel
          notify={notify}
          chapter={chapter}
          goToManuscript={goToManuscript}
          refreshKey={refreshKey}
          onStatusChanged={(status) => setChapter((current) => (current ? { ...current, status } : current))}
          onOpenFinding={(findingId) => goToEditing(chapterId, findingId)}
        />
      </>,
      <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        {alignment && <SectionLabel>{CHECK_STATE_LABEL[alignment.state]}</SectionLabel>}
        {alignment?.basis && <span>as of last save {formatWhen(alignment.basis.modifiedAt)}</span>}
        <Button variant="secondary" onClick={() => openCheckRecordings([chapterId], { onClosed: () => setReload((n) => n + 1) })}>
          Check recordings…
        </Button>
      </div>,
    );
  }

  return <CommandScope kind="page">{content}</CommandScope>;
}
