import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EnginePanelLink } from '../engine/EnginePanelContext';
import { useApi } from '../../api/ApiContext';
import { chapterName } from '../../chapterName';
import { formatWhen } from '../production/recordingCheckText';
import { RecordingCheck } from '../production/RecordingCheck';
import { Button } from '../primitives/Button';
import { Heading } from '../primitives/Heading';
import { Panel } from '../primitives/Panel';
import { SectionLabel } from '../primitives/SectionLabel';
import type { Notify } from '../primitives/Toast';
import type { CoverageState, ManuscriptChapter, TranscriptState } from '../../types';
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
 * ADR 0804). The recording check's state and Check again, the native takes, Transcript Compare's run against this chapter (CompareRun),
 * and the Preview and stage panels; none of them is in the Studio Next mock, so they stay as built (D98). One component per chapter
 * (keyed by the id).
 */
export function ProofChapterPage(props: ChapterViewProps) {
  const { chapterId = '' } = useParams<{ chapterId: string }>();
  return <ChapterView key={chapterId} chapterId={chapterId} {...props} />;
}

function ChapterView({ chapterId, notify, transcript, dawFileLinked, goToManuscript, goToEditing, refreshKey }: ChapterViewProps & { chapterId: string }) {
  const api = useApi();
  const [chapter, setChapter] = useState<ManuscriptChapter>();
  const [linkedTrackGuid, setLinkedTrackGuid] = useState<string>();
  const [alignment, setAlignment] = useState<WorkspaceAlignmentResult>();
  const [loadError, setLoadError] = useState('');
  const [coverage, setCoverage] = useState<CoverageState>({ phase: 'idle', percent: 0, message: '' });
  const [checking, setChecking] = useState(false);
  const [lastCompleted, setLastCompleted] = useState<TranscriptState>();
  const [reviewingLast, setReviewingLast] = useState(false);
  const [reload, setReload] = useState(0);

  // The last completed comparison, offered for review without running again (it needs no linked project file).
  useEffect(() => {
    void api
      .transcriptLastCompleted()
      .then(setLastCompleted)
      .catch(() => {});
  }, [api]);

  useEffect(() => api.subscribeCoverage(setCoverage), [api]);

  // The check's state for the header; read again after Check again closes.
  useEffect(() => {
    api
      .workspaceAlignment(chapterId)
      .then(setAlignment)
      .catch((reason: unknown) => setLoadError(String(reason)));
  }, [api, chapterId, reload]);

  useEffect(() => {
    let active = true;
    Promise.all([api.manuscriptChapters(), api.chapterTrackMapList()])
      .then(([chapters, mapping]) => {
        if (!active) return;
        setChapter(chapters.find((candidate) => candidate.id === chapterId));
        setLinkedTrackGuid(mapping.mappings.find((entry) => entry.chapterId === chapterId)?.trackGuid);
      })
      .catch((reason: unknown) => {
        if (active) setLoadError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [api, chapterId]);

  // How many of the compare run's results are this chapter's: the live run's once it succeeds, or the last completed one while the
  // narrator reviews it. A run covers the selected REAPER audio, so rows for other chapters are left out.
  const compareResults = reviewingLast ? lastCompleted : transcript.phase === 'success' ? transcript : undefined;
  const foundHere = useMemo(
    () => (chapter ? (compareResults?.rows ?? []).filter((row) => row.chapter === chapter.title).length : 0),
    [compareResults?.rows, chapter],
  );

  let content: ReactNode;
  if (loadError) {
    content = (
      <p role="alert" className="text-sm" style={{ color: 'var(--danger-text)' }}>
        {loadError}
      </p>
    );
  } else if (chapter === undefined) {
    content = null; // still loading, or the id doesn't resolve to a chapter
  } else {
    content = (
      <div className="mx-auto max-w-7xl space-y-4">
        <nav aria-label="Breadcrumb" className="text-sm" style={{ color: 'var(--text-muted)' }}>
          <Link to="/proof">Proof</Link> <span aria-hidden="true">&rsaquo;</span> {chapterName(chapter)}
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <Heading title={`Proof · ${chapterName(chapter)}`} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            {alignment && <SectionLabel>{CHECK_STATE_LABEL[alignment.state]}</SectionLabel>}
            {alignment?.basis && <span>as of last save {formatWhen(alignment.basis.modifiedAt)}</span>}
            <Button variant="secondary" onClick={() => setChecking(true)}>
              {alignment?.state === 'never' ? 'Check recording' : 'Check again'}
            </Button>
          </div>
        </div>
        {alignment?.needsAlignAgain && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            This chapter was last checked before the app could read its word alignment. Run Check again to edit it word by word on the Editing page.
          </p>
        )}
        {!linkedTrackGuid && (
          <Panel title="No linked track">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              This chapter isn&rsquo;t linked to a REAPER track yet. Link one from the Chapter links table in the audio engine panel, then open this chapter
              again. <EnginePanelLink />
            </p>
          </Panel>
        )}
        {alignment?.state === 'never' && (
          <Panel>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              This chapter hasn&rsquo;t been checked yet. Run Check recording to see what was heard against the script.
            </p>
          </Panel>
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
        {checking && (
          <RecordingCheck
            chapter={chapter}
            coverage={coverage}
            notify={notify}
            close={() => {
              setChecking(false);
              setReload((n) => n + 1);
            }}
            goToParagraph={(index) => goToManuscript(chapterId, index)}
          />
        )}
      </div>
    );
  }

  return <CommandScope kind="page">{content}</CommandScope>;
}
