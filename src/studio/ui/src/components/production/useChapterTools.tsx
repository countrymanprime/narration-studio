import { headingName } from '../../chapterHeading';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { describeApiError } from '../../api/errorMessage';
import { useApi } from '../../api/ApiContext';
import type { ManuscriptContentKind } from '../../api/contracts/manuscript';
import type { ProductionChapter } from '../../api/contracts/production';
import { STATUS_LABELS, STATUS_ORDER } from '../../chapterStatus';
import { registerContextProvider, type ContextProvider } from '../../registries/context';
import type { ChapterStatus, ManuscriptChapter } from '../../types';
import { useChapterTrackState } from '../chapterTracks/ChapterTrackState';
import { EditingCheckPanel } from '../editing/EditingCheckPanel';
import type { ContextMenuItem } from '../primitives/ContextMenu';
import type { Notify } from '../primitives/Toast';
import { creditsCheckKind } from './recordingCheckText';
import { ChapterTrackPanel } from './ChapterTrackPanel';
import { chapterTrackButtonState, followLiveTracks, showableTrackGuid } from './chapterTrackButtonState';
import { showInDaw, showInDawLabel } from '../engine/ShowInDaw';
import { CreditsRowPanel } from './CreditsRowPanel';
import { CHECK_RECORDINGS_LABEL, useCheckRecordingsGate } from '../recordingcheck/CheckRecordingsButton';
import { openCheckRecordings } from '../recordingcheck/openCheckRecordings';
import { RemovedFromRecordingList } from './RemovedFromRecordingList';
import type { CreditsKind, CreditsRow } from '../credits/useCreditsRows';

/** The attribute on the element around the pipeline table; a right click (or the Menu key) on one of its body rows opens the row menu. */
export const PIPELINE_AREA = 'data-pipeline';

const CREDITS_TITLE: Record<CreditsKind, string> = { opening: 'Opening credits', closing: 'Closing credits' };

type Open = { kind: 'track'; chapterId: string } | { kind: 'editing'; chapter: ManuscriptChapter } | { kind: 'credits'; credits: CreditsKind };

/** The pages a row menu item opens; the page maps them to its own navigation. */
type RowGo = { script: (chapterId: string) => void; booth: (chapterId: string) => void; proof: (chapterId: string) => void; master: () => void };

type Options = {
  /** The pipeline's rows in order, the credits chapters among them: the row menu reads a row by its index. */
  rows: readonly ProductionChapter[];
  /** The credits templates' data (`useCreditsRows`), which the credits panel shows; the credits chapters themselves are rows like any other. */
  credits: { rows?: Record<CreditsKind, CreditsRow> };
  notify: Notify;
  go: RowGo;
  /** False while there is no manuscript: nothing is read. */
  active: boolean;
  /** Changes after a manuscript import or replacement, so the chapter list is read again. */
  refreshKey: string;
  /** Reads the overview and the readiness again after a status, a link or a measurement changed. */
  onChanged: () => void;
  /** Hears the chapter a Restore brought back, so its pipeline row can show what changed. */
  onRestored?: (chapterId: string) => void;
  /** The DAW the row menu's "Show in …" names, and why selecting a track there is off (its `track_select` capability). */
  daw: { name: string; unavailable?: string };
};

/**
 * The Production features the research mock has no equivalent for, kept as built (D98; the SN-P40 audit's "Old behaviour to new home"):
 * the chapter track slide-over with Remove from recording, the Restore list, the credits rows' panel and menu, the chapter status override and the
 * recording and editing checks. They hang off the mock's own row menu on the pipeline (the mock's `context.ts`) and two panels under it.
 * Returns the row menu's items for a target, the panels, the opener the page's Edit cell uses, and the track links the chapter-sync
 * toast names a track from.
 */
export function useChapterTools({ rows, credits, notify, go, active, refreshKey, onChanged, onRestored, daw }: Options) {
  const api = useApi();
  const [chapters, setChapters] = useState<ManuscriptChapter[]>();
  // Each chapter's link state is the app's one chapter-track state, not a read of this board's own: a chapter linked or created in the Engine
  // panel shows here at once (#3355), and a change made here shows there.
  const { details: savedLinks, refreshLinks } = useChapterTrackState({ enabled: true, tracks: false, detail: true, when: active });
  // The links are read from the saved project; the tracks the Engine list and the Booth show are REAPER's now. A chapter linked to a track deleted or
  // renamed in REAPER since the save reads Track missing / the new name here too, on the board, in the row menu and in the track panel (#3415).
  const liveTracks = useChapterTrackState({ enabled: true, when: active }).project?.tracks;
  const trackLinks = useMemo(
    () => (savedLinks && liveTracks ? { ...savedLinks, chapters: savedLinks.chapters.map((link) => followLiveTracks(link, liveTracks)) } : savedLinks),
    [savedLinks, liveTracks],
  );
  const [open, setOpen] = useState<Open>();
  const [restoringId, setRestoringId] = useState('');
  const creditsRows = credits.rows;

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
      await refreshLinks();
    } catch (error) {
      notify(describeApiError(error), 'error');
    }
  }, [notify, refreshLinks]);
  const reload = useCallback(() => {
    if (!active) return;
    void loadChapters();
    void loadTrackLinks();
  }, [active, loadChapters, loadTrackLinks]);

  useEffect(() => reload(), [reload, refreshKey]);
  // A check that completes changes the chapter's measured length, so the overview is read again, once per run.
  // It follows each event, not the latest state: checks of several chapters can end together, and each is one run.
  const completed = useRef(new Set<string>());
  useEffect(
    () =>
      api.subscribeCoverage((state) => {
        if (state.phase !== 'complete' || !state.runId || completed.current.has(state.runId)) return;
        completed.current.add(state.runId);
        reload();
        onChanged();
      }),
    [api, reload, onChanged],
  );

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

  // The row menu's "Show in <DAW>" (#2826): selects the chapter's linked track there, the chapter track panel's Select call.
  // One select at a time: Enter held or pressed three times asks REAPER once, as the panel's button does on a double click.
  const selecting = useRef(false);
  const selectTrack = useCallback(
    async (trackGuid: string, dawName: string) => {
      if (selecting.current) return;
      selecting.current = true;
      try {
        const result = await showInDaw({ workspace: api, findings: api, chapterTrackMap: api }, { kind: 'chapter', trackGuid }, dawName);
        if (result?.failed) notify(result.message, 'error');
        else if (result) notify(result.message);
      } catch (error) {
        notify(describeApiError(error), 'error');
      } finally {
        selecting.current = false;
      }
    },
    [api, notify],
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
      onRestored?.(chapterId);
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

  // The row menu's Check recordings (#2833): the shared label and gate, with the chapter ticked, in the dialog every page opens. The board reads its
  // checks again as each one completes (above).
  const checkGate = useCheckRecordingsGate();

  // The items close over the latest state, read when the menu opens.
  const latest = useRef({ rows, go, manuscriptChapter, trackLinks, setStatus, daw, selectTrack, checkGate, loadTrackLinks });
  latest.current = { rows, go, manuscriptChapter, trackLinks, setStatus, daw, selectTrack, checkGate, loadTrackLinks };
  const provider = useMemo<ContextProvider>(
    () => ({
      match: (target) => target.closest(`[${PIPELINE_AREA}] tbody tr`) !== null,
      items: (target): ContextMenuItem[] => {
        const { rows: list, go: open_, manuscriptChapter: find, trackLinks: links, setStatus: set, daw: dawTarget, selectTrack: select } = latest.current;
        const tr = target.closest('tr');
        // The row is named by the chapter it draws: a windowed list draws only some of its rows, so the place in the body is not the place in the list.
        const row = list.find((entry) => entry.id === tr?.dataset.chapterId);
        if (!row) return [];
        // The credits are chapters: the same items, and the template's panel besides.
        const credits = creditsCheckKind(row.id);
        const chapter = find(row.id);
        const missing = chapter ? undefined : 'The chapter list is still loading';
        const linked = links?.chapters.some((entry) => entry.chapterId === row.id);
        const entry = links?.chapters.find((candidate) => candidate.chapterId === row.id);
        const trackGuid = showableTrackGuid(entry);
        // A linked track REAPER no longer has is said to be missing, not "not linked" (the panel and the Engine row say so).
        const noTrack =
          entry && chapterTrackButtonState(entry).kind === 'missing'
            ? 'The track linked to this chapter is missing from the project: choose another from the audio engine panel'
            : 'No chapter track is linked to this chapter yet: link one from the audio engine panel';
        return [
          // The primitive draws no heading yet, so the chapter's name is a disabled row.
          { key: 'heading', label: headingName(row), unavailable: '', onSelect: () => {} },
          { key: 'script', label: 'Open prep in Script', onSelect: () => open_.script(row.id) },
          { key: 'booth', label: 'Open in Booth', onSelect: () => open_.booth(row.id) },
          { key: 'proof', label: 'Open Proof', onSelect: () => open_.proof(row.id) },
          { key: 'master', label: 'Open Master & QC', onSelect: () => open_.master() },
          {
            key: 'goto',
            label: showInDawLabel(dawTarget.name),
            unavailable: dawTarget.unavailable ?? (trackGuid ? undefined : noTrack),
            onSelect: () => trackGuid && void select(trackGuid, dawTarget.name),
          },
          {
            key: 'track',
            label: 'Chapter track…',
            unavailable: linked ? undefined : 'No chapter track is known yet: link one from the audio engine panel',
            onSelect: () => setOpen({ kind: 'track', chapterId: row.id }),
          },
          ...(credits ? [{ key: 'credits', label: 'Credits…', onSelect: () => setOpen({ kind: 'credits' as const, credits }) }] : []),
          {
            key: 'recording',
            label: CHECK_RECORDINGS_LABEL,
            unavailable: missing ?? latest.current.checkGate,
            // The dialog can link the chapter's track (its unmapped refusal), so the board reads the links again when it closes.
            onSelect: () => chapter && void openCheckRecordings([chapter.id], { onClosed: () => void latest.current.loadTrackLinks() }),
          },
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
  // The Editing check can link the chapter's track (its unmapped refusal) and does not tell the board, so the board reads the links again when it closes.
  const closeEditing = () => {
    close();
    void loadTrackLinks();
  };
  const trackOpen = open?.kind === 'track' ? open : undefined;
  const link = trackOpen ? trackLinks?.chapters.find((entry) => entry.chapterId === trackOpen.chapterId) : undefined;

  const panels: ReactNode = (
    <>
      {chapters && <RemovedFromRecordingList chapters={chapters} restoringId={restoringId} onRestore={(chapterId) => void restore(chapterId)} />}
      {open?.kind === 'editing' && <EditingCheckPanel key={open.chapter.id} chapter={open.chapter} notify={notify} close={closeEditing} />}
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
          row={{ ...creditsRows[open.credits], status: manuscriptChapter(`credits-${open.credits}`)?.status ?? creditsRows[open.credits].status }}
          label={CREDITS_TITLE[open.credits]}
          onStatus={(status) => void setStatus(`credits-${open.credits}`, status)}
          // Close this slide-over, then open the check, never nested over it.
          onClose={close}
        />
      )}
    </>
  );

  return { panels, trackLinks, reload, openEditingCheck };
}
