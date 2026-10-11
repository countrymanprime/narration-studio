import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { describeApiError } from '../../api/errorMessage';
import { useApi } from '../../api/ApiContext';
import type { ManuscriptContentKind } from '../../api/contracts/manuscript';
import type { ProductionChapter } from '../../api/contracts/production';
import { chapterName } from '../../chapterName';
import { STATUS_LABELS, STATUS_ORDER } from '../../chapterStatus';
import { registerContextProvider, type ContextProvider } from '../../registries/context';
import type { ChapterStatus, ChapterTrackLinks, CoverageState, ManuscriptChapter } from '../../types';
import { EditingCheckPanel } from '../editing/EditingCheckPanel';
import { Button } from '../primitives/Button';
import type { ContextMenuItem } from '../primitives/ContextMenu';
import { Panel } from '../primitives/Panel';
import type { Notify } from '../primitives/Toast';
import { ChapterTrackPanel } from './ChapterTrackPanel';
import { CreditsRowPanel } from './CreditsRowPanel';
import { RecordingCheck } from './RecordingCheck';
import { creditsCheckChapter, creditsCheckKind } from './recordingCheckText';
import { RemovedFromRecordingList } from './RemovedFromRecordingList';
import { useCreditsRows, type CreditsKind } from './useCreditsRows';

const CREDITS_LABEL: Record<CreditsKind, string> = { opening: 'Opening credits', closing: 'Closing credits' };

/** The attribute on the element around the pipeline table; a right click (or the Menu key) on one of its body rows opens the row menu. */
export const PIPELINE_AREA = 'data-pipeline';

type Open =
  | { kind: 'track'; chapterId: string }
  | { kind: 'recording'; chapter: ManuscriptChapter }
  | { kind: 'editing'; chapter: ManuscriptChapter }
  | { kind: 'credits'; credits: CreditsKind };

/** The pages a row menu item opens; the page maps them to its own navigation. */
type RowGo = { script: (chapterId: string) => void; booth: (chapterId: string) => void; proof: (chapterId: string) => void; master: () => void };

type Options = {
  /** The overview's chapters in the pipeline's row order: the row menu reads a row by its index. */
  rows: readonly ProductionChapter[];
  notify: Notify;
  go: RowGo;
  goToScript: (chapter: string, paragraph?: number) => void;
  goToProofChapter: (chapterId: string) => void;
  /** False while there is no manuscript: nothing is read. */
  active: boolean;
  /** Changes after a manuscript import or replacement, so the chapter list is read again. */
  refreshKey: string;
  /** Reads the overview and the readiness again after a status, a link or a measurement changed. */
  onChanged: () => void;
};

/**
 * The Production features the Studio Next mock has no equivalent for, kept as built (D98; the SN-P40 audit's "Old behaviour to new home"):
 * the chapter track slide-over with Remove from recording, the Restore list, the credits rows, the chapter status override and the
 * recording and editing checks. They hang off the mock's own row menu on the pipeline (the mock's `context.ts`) and two panels under it.
 * Returns the row menu's items for a target, the panels, the opener the page's Edit cell uses, and the track links the chapter-sync
 * toast names a track from.
 */
export function useChapterTools({ rows, notify, go, goToScript, goToProofChapter, active, refreshKey, onChanged }: Options) {
  const api = useApi();
  const [chapters, setChapters] = useState<ManuscriptChapter[]>();
  const [trackLinks, setTrackLinks] = useState<ChapterTrackLinks>();
  const [coverage, setCoverage] = useState<CoverageState>({ phase: 'idle', percent: 0, message: '' });
  const [open, setOpen] = useState<Open>();
  const [restoringId, setRestoringId] = useState('');
  const { rows: creditsRows, setStatus: setCreditsStatus } = useCreditsRows(api, refreshKey, (error) => notify(describeApiError(error), 'error'));

  const loadChapters = useCallback(async () => {
    try {
      setChapters(await api.manuscriptChapters());
    } catch (error) {
      setChapters([]);
      notify(describeApiError(error), 'error');
    }
  }, [api, notify]);
  const loadTrackLinks = useCallback(async () => {
    try {
      setTrackLinks(await api.chapterTrackLinks());
    } catch (error) {
      notify(describeApiError(error), 'error');
    }
  }, [api, notify]);
  const reload = useCallback(() => {
    if (!active) return;
    void loadChapters();
    void loadTrackLinks();
  }, [active, loadChapters, loadTrackLinks]);

  useEffect(() => reload(), [reload, refreshKey]);
  useEffect(() => api.subscribeCoverage(setCoverage), [api]);
  // A check that completes changes the chapter's measured length, so the overview is read again, once per run.
  const lastCompleted = useRef<string>(undefined);
  useEffect(() => {
    if (coverage.phase !== 'complete' || !coverage.runId || lastCompleted.current === coverage.runId) return;
    lastCompleted.current = coverage.runId;
    reload();
    onChanged();
  }, [coverage.phase, coverage.runId, reload, onChanged]);

  const manuscriptChapter = useCallback((chapterId: string) => chapters?.find((chapter) => chapter.id === chapterId), [chapters]);

  const setStatus = useCallback(
    async (chapterId: string, status: ChapterStatus) => {
      try {
        const updated = await api.manuscriptSetChapterStatus(chapterId, status);
        setChapters((current) => current?.map((c) => (c.id === chapterId ? { ...c, status: updated.status } : c)));
        onChanged();
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    },
    [api, notify, onChanged],
  );

  // Remove rethrows on failure so the slide-over's confirm stays open for a retry.
  const afterKind = async () => {
    await loadChapters();
    await loadTrackLinks();
    onChanged();
  };
  const removeFromRecording = async (chapterId: string, kind: ManuscriptContentKind) => {
    try {
      const result = await api.manuscriptSetChapterKind(chapterId, kind);
      notify(`${result.chapter.title} removed from recording.`);
      await afterKind();
    } catch (error) {
      notify(describeApiError(error), 'error');
      throw error;
    }
  };
  const restore = async (chapterId: string) => {
    setRestoringId(chapterId);
    try {
      const result = await api.manuscriptSetChapterKind(chapterId, 'narration');
      notify(`${result.chapter.title} restored.`);
      await afterKind();
    } catch (error) {
      notify(describeApiError(error), 'error');
    } finally {
      setRestoringId('');
    }
  };

  const openEditingCheck = useCallback(
    (chapterId: string) => {
      const chapter = manuscriptChapter(chapterId);
      if (chapter) setOpen({ kind: 'editing', chapter });
    },
    [manuscriptChapter],
  );

  // The items close over the latest state, read when the menu opens.
  const latest = useRef({ rows, go, manuscriptChapter, trackLinks, setStatus });
  latest.current = { rows, go, manuscriptChapter, trackLinks, setStatus };
  const provider = useMemo<ContextProvider>(
    () => ({
      match: (target) => target.closest(`[${PIPELINE_AREA}] tbody tr`) !== null,
      items: (target): ContextMenuItem[] => {
        const { rows: list, go: open_, manuscriptChapter: find, trackLinks: links, setStatus: set } = latest.current;
        const tr = target.closest('tr');
        const index = tr ? Array.from(tr.parentElement?.children ?? []).indexOf(tr) : -1;
        const row = list[index];
        if (!row) return [];
        const chapter = find(row.id);
        const missing = chapter ? undefined : 'The chapter list is still loading';
        const linked = links?.chapters.some((entry) => entry.chapterId === row.id);
        return [
          // The primitive draws no heading yet, so the chapter's name is a disabled row.
          { key: 'heading', label: chapterName(row), unavailable: '', onSelect: () => {} },
          { key: 'script', label: 'Open prep in Script', onSelect: () => open_.script(row.id) },
          { key: 'booth', label: 'Open in Booth', onSelect: () => open_.booth(row.id) },
          { key: 'proof', label: 'Open Proof', onSelect: () => open_.proof(row.id) },
          { key: 'master', label: 'Open Master & QC', onSelect: () => open_.master() },
          {
            key: 'track',
            label: 'Chapter track…',
            unavailable: linked ? undefined : 'No chapter track is known yet: link one from the audio engine panel',
            onSelect: () => setOpen({ kind: 'track', chapterId: row.id }),
          },
          { key: 'recording', label: 'Recording check…', unavailable: missing, onSelect: () => chapter && setOpen({ kind: 'recording', chapter }) },
          { key: 'editing', label: 'Editing check…', unavailable: missing, onSelect: () => chapter && setOpen({ kind: 'editing', chapter }) },
          ...STATUS_ORDER.filter((status) => status !== row.status).map((status) => ({
            key: `status-${status}`,
            label: `Set status: ${STATUS_LABELS[status]}`,
            onSelect: () => void set(row.id, status),
          })),
        ];
      },
    }),
    [],
  );
  useEffect(() => registerContextProvider(provider), [provider]);

  const close = () => setOpen(undefined);
  const trackOpen = open?.kind === 'track' ? open : undefined;
  const link = trackOpen ? trackLinks?.chapters.find((entry) => entry.chapterId === trackOpen.chapterId) : undefined;
  const checkingCredits = open?.kind === 'recording' ? creditsCheckKind(open.chapter.id) : undefined;

  const panels: ReactNode = (
    <>
      {creditsRows && (
        <Panel title="Credits" className="min-w-0">
          <ul className="flex flex-col gap-2">
            {(['opening', 'closing'] as const).map((kind) => (
              <li key={kind} className="flex items-center justify-between gap-3 text-[0.875rem]">
                <span>
                  {CREDITS_LABEL[kind]}{' '}
                  <span className="text-[var(--text-muted)]">· {creditsRows[kind].template ? STATUS_LABELS[creditsRows[kind].status] : 'Not set up'}</span>
                </span>
                <Button variant="secondary" size="sm" aria-label={`Open ${CREDITS_LABEL[kind]}`} onClick={() => setOpen({ kind: 'credits', credits: kind })}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {chapters && <RemovedFromRecordingList chapters={chapters} restoringId={restoringId} onRestore={(chapterId) => void restore(chapterId)} />}
      {open?.kind === 'recording' && (
        <RecordingCheck
          key={open.chapter.id}
          chapter={open.chapter}
          coverage={coverage}
          notify={notify}
          close={close}
          // A credits row's synthetic chapter (ADR 0333) opens the Manuscript credits entry, never a Proof workspace or a paragraph.
          goToParagraph={checkingCredits ? () => goToScript(`credits-${checkingCredits}`) : (paragraph) => goToScript(open.chapter.id, paragraph)}
          openWorkspace={checkingCredits ? undefined : () => goToProofChapter(open.chapter.id)}
        />
      )}
      {open?.kind === 'editing' && <EditingCheckPanel key={open.chapter.id} chapter={open.chapter} notify={notify} close={close} />}
      {trackOpen && (
        <ChapterTrackPanel
          open
          chapterId={trackOpen.chapterId}
          chapterTitle={manuscriptChapter(trackOpen.chapterId)?.title ?? ''}
          subtitle={manuscriptChapter(trackOpen.chapterId)?.subtitle}
          link={link}
          trackSummary={link?.track?.trackGuid ? trackLinks?.tracks.find((track) => track.guid === link.track?.trackGuid) : undefined}
          recordedSeconds={rows.find((chapter) => chapter.id === trackOpen.chapterId)?.recordedSeconds ?? undefined}
          savedAt={trackLinks?.savedAt ?? ''}
          notify={notify}
          onClose={close}
          onChanged={async () => {
            await loadTrackLinks();
            onChanged();
          }}
          onRemoveFromRecording={(kind) => removeFromRecording(trackOpen.chapterId, kind)}
        />
      )}
      {open?.kind === 'credits' && creditsRows && (
        <CreditsRowPanel
          open
          row={creditsRows[open.credits]}
          label={CREDITS_LABEL[open.credits]}
          onStatus={(status) => void setCreditsStatus(open.credits, status)}
          // Close this slide-over, then open the check as a sibling, never nested.
          onCheck={() => setOpen({ kind: 'recording', chapter: creditsCheckChapter(open.credits, creditsRows[open.credits].status) })}
          onClose={close}
        />
      )}
    </>
  );

  return { panels, trackLinks, reload, openEditingCheck };
}
