import { headingName } from '../../chapterHeading';
import { chapterRecordedDetail } from '../../recordedThrough';
import { useToastSideClearance } from '../../hooks/useToastClearance';
import { useLayoutClass } from '../../hooks/useLayoutClass';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { shownFindingNoteType, type Finding, type FindingNoteType, type FindingsSummary } from '../../api/contracts/findings';
import type { PickupItem } from '../../api/contracts/pickups';
import { describeApiError } from '../../api/errorMessage';
import { footerHints } from '../../input/hints';
import { CommandScope } from '../../input/router';
import { useUserKeymap } from '../../input/useUserKeymap';
import { useOverlay } from '../../overlay/OverlayProvider';
import { usePort } from '../../ports/usePort';
import { useJournal } from '../../studio/StudioProvider';
import { useCapability } from '../../useCapability';
import type { ManuscriptChapter } from '../../types';
import { ALL_CHAPTERS, ChapterStepper } from '../primitives/ChapterStepper';
import { IconButton } from '../primitives/IconButton';
import { KeyHints } from '../primitives/KeyHints';
import { openCheckRecordings } from '../recordingcheck/openCheckRecordings';
import { creditsEntries, creditsKindOfId, ownsOpeningCredits } from '../credits/creditsEntries';
import { useCreditsRows } from '../credits/useCreditsRows';
import { LoadError } from '../layout/LoadError';
import { ProofSkeleton } from './frame/ProofSkeleton';
import { NeedManuscript } from '../layout/NeedManuscript';
import { CheckCard } from './checkcard/CheckCard';
import { SectionLabel } from '../primitives/SectionLabel';
import { ChapterStrip, type StripChapter } from './frame/ChapterStrip';
import type { Band, Pin } from './frame/pins';
import { ProofHeader } from './frame/ProofHeader';
import { WaveformWindow } from './frame/WaveformWindow';
import { FIRST_WINDOW, followSecond, type TimeWindow } from './frame/windowMath';
import { useKeepFocusInside } from './inspector/useKeepFocusInside';
import { Inspector } from './inspector/Inspector';
import { decisionLabel, fixKindOf } from './resolution';
import { TypeSelect } from './inspector/TypeSelect';
import { NotesPanel } from './notes/NotesPanel';
import { kindColour } from '../../kinds/kindMap';
import { inBookOrder, NOTE_KIND, noteRow, queryFor, type NoteSort } from './notes/noteRows';
import { openPickupsBeyondNotes, proofProgress } from './proof.selectors';
import { ProoferSheet } from './ProoferSheet';
import { recallSelection, rememberSelection } from './proofMemory';
import { SurroundingText } from './around/SurroundingText';
import { useParagraphsAround } from './around/useParagraphsAround';
import { SpotTakes } from './spot/SpotTakes';
import { TakeLanes } from './spot/TakeLanes';
import { TakesBadge } from './spot/TakesBadge';
import { useSpotTakes } from './spot/useSpotTakes';
import { useChapterTimeline } from './useChapterTimeline';
import { useProofKeys } from './useProofKeys';
import { useProofPageCommands } from './useProofPageCommands';
import { useNoteContextMenu } from './useNoteContextMenu';
import { hasRecording } from './checkcard/cardSelectors';
import { addressPath } from '../../navigation/address';
import { announcePickupListChanged } from '../pickups/pickupListChanged';

/** A pin's ink is its note type's kind colour (kinds/kindMap.ts); a take comparison has no hue, so it is muted. */
const pinColour = (type: FindingNoteType): string => {
  const kind = NOTE_KIND[type];
  return kind ? `var(${kindColour(kind).line})` : 'var(--text-muted)';
};

// The last chapter the narrator looked at on Proof, per project: stepping out of All chapters opens it. A per-viewer
// convenience in browser storage, never a host field; storage can be missing, full or blocked, so every access is guarded.
const lastChapterKey = (projectFolder: string): string => `narration.proof.lastChapter.${projectFolder}`;

function loadLastChapter(projectFolder: string): string {
  try {
    return window.localStorage.getItem(lastChapterKey(projectFolder)) ?? '';
  } catch {
    return '';
  }
}

function saveLastChapter(projectFolder: string, chapterId: string): void {
  try {
    window.localStorage.setItem(lastChapterKey(projectFolder), chapterId);
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
}

const isNarration = (chapter: ManuscriptChapter) => (chapter.contentKind ?? 'narration') === 'narration';
const chapterOf = (finding: Finding) => finding.manuscript?.chapter_id ?? '';
/** A note as the page holds it: its review copied, so Undo knows the decision before, whatever the client does with the object it returned. */
const held = (finding: Finding): Finding => ({ ...finding, review: { ...finding.review } });

/**
 * Proof (Studio Next mock `pages/Proof.tsx`): the whole book as a strip of chapters and one list of notes, or one chapter with its
 * recording check, its waveform window and its notes; the Inspector for the selected note on the right and the key hints at the foot.
 * The host filters and sorts the notes (`FindingsQuery`); a decision goes through the Inspector's stale-evidence guard and moves on
 * to the next note with an Undo.
 */
export function ProofPage({
  hasManuscript,
  projectFolder,
  goTo,
  goToScript,
  goToBooth,
  goToEditing,
}: {
  hasManuscript: boolean;
  /** Keys the remembered chapter. */
  projectFolder: string;
  goTo: (path: string) => void;
  goToScript: (chapterId: string) => void;
  goToBooth: (chapterId: string) => void;
  /** The takes' "Manage takes in Editing": the Editing page at the note's chapter, its flagged word selected and the passage's takes open. */
  goToEditing: (chapterId: string, findingId?: string, passageId?: string) => void;
}) {
  const findingsApi = usePort('findings');
  const pickupsApi = usePort('pickups');
  const manuscriptApi = usePort('manuscript');
  const overlay = useOverlay();
  const journal = useJournal();
  const keymap = useUserKeymap();
  const review = useCapability('review');
  const [params, setParams] = useSearchParams();
  const [chapters, setChapters] = useState<ManuscriptChapter[]>([]);
  // The credits tiles of the strip: the same entries the Script list draws, the opening left out when the manuscript brought its own.
  const [ownsOpening, setOwnsOpening] = useState(false);
  const credits = useCreditsRows(projectFolder, (error) => overlay.toast(describeApiError(error), { tone: 'error' }));
  const creditsTiles = useMemo(() => creditsEntries(credits.rows, ownsOpening), [credits.rows, ownsOpening]);
  const [listed, setFindings] = useState<Finding[]>([]);
  const [summary, setSummary] = useState<FindingsSummary>();
  const [sort, setSort] = useState<NoteSort>('time');
  const [reload, setReload] = useState(0);
  // The page's data could not be read on opening: the host's sentence for the first failure of the chapters or the notes, and which have
  // been read once (a later failure is a toast, the page stays). Retry bumps `attempt`, which both reads depend on.
  const [chaptersProblem, setChaptersProblem] = useState<string>();
  const [notesProblem, setNotesProblem] = useState<string>();
  const loadProblem = chaptersProblem ?? notesProblem;
  const [attempt, setAttempt] = useState(0);
  const read = useRef({ chapters: false, notes: false });
  // The same two reads as state, so the page can show its skeleton until both have ended once.
  const [firstRead, setFirstRead] = useState({ chapters: false, notes: false });
  // The pickups list, for the open pickups no note stands for: while one is open the head never reads 100.
  const [pickups, setPickups] = useState<readonly PickupItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('finding') ?? recallSelection(projectFolder, params.get('chapter') ?? ALL_CHAPTERS));
  const [current, setCurrent] = useState(() => loadLastChapter(projectFolder));
  const [win, setWin] = useState<TimeWindow>({ start: 0, len: FIRST_WINDOW });
  // The latest selection, set as it happens: the right-click menu reads it in the same event that selected the row.
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  // Set while a row is pressed (it opens the row's chapter) or selected for the right-click menu (it does not).
  const opening = useRef(false);
  // Toasts stay left of the Inspector while it is beside the notes, so a decision's message never covers the next decision button.
  const inspectorPanel = useRef<HTMLDivElement>(null);
  // Under 1180 px the Inspector stacks under the queue, a page or more down: a pressed note brings it into view, so the press shows its
  // result (alignment audit XPF-9). A note stepped to with the keys does not move the page.
  const stacked = useLayoutClass().narrow;
  const revealInspector = useRef(false);
  useToastSideClearance(inspectorPanel);
  useKeepFocusInside(inspectorPanel);
  const selectingForMenu = useRef(false);

  const scope = params.get('chapter') ?? ALL_CHAPTERS;
  const all = scope === ALL_CHAPTERS;
  // The host sorts by a chapter-relative time, so All chapters is put in book order here; the table groups by chapter and J/K must follow it.
  const findings = useMemo(
    () =>
      all
        ? inBookOrder(
            listed,
            chapters.map((c) => c.id),
          )
        : listed,
    [all, listed, chapters],
  );
  const chapter = all ? undefined : chapters.find((c) => c.id === scope);
  const fallback = chapters.find((c) => c.id === current) ?? chapters[0];

  useEffect(() => {
    if (!hasManuscript) return;
    let live = true;
    manuscriptApi
      .manuscriptChapters()
      .then((list) => {
        if (!live) return;
        read.current.chapters = true;
        setFirstRead((now) => (now.chapters ? now : { ...now, chapters: true }));
        setChaptersProblem(undefined);
        setChapters(list.filter(isNarration));
        setOwnsOpening(ownsOpeningCredits(list));
      })
      .catch((error: unknown) => {
        if (!live) return;
        if (read.current.chapters) overlay.toast(describeApiError(error), { tone: 'error' });
        else setChaptersProblem(describeApiError(error));
      });
    return () => {
      live = false;
    };
  }, [manuscriptApi, hasManuscript, overlay, attempt]);

  useEffect(() => {
    if (!hasManuscript) return;
    let live = true;
    pickupsApi.pickupsList().then(
      (list) => live && setPickups(list.pickups),
      () => live && setPickups([]),
    );
    return () => {
      live = false;
    };
  }, [pickupsApi, hasManuscript, reload]);

  // The notes in scope, in the order the sort asked for, and the book's counts for the head; an answer to an older request is dropped.
  useEffect(() => {
    if (!hasManuscript) return;
    let live = true;
    Promise.all([findingsApi.findingsList(queryFor(sort, all ? undefined : scope)), findingsApi.findingsSummary()])
      .then(([page, counts]) => {
        if (!live) return;
        read.current.notes = true;
        setFirstRead((now) => (now.notes ? now : { ...now, notes: true }));
        setNotesProblem(undefined);
        setFindings(page.findings.map(held));
        setSummary(counts);
      })
      .catch((error: unknown) => {
        if (!live) return;
        if (read.current.notes) overlay.toast(describeApiError(error), { tone: 'error' });
        else setNotesProblem(describeApiError(error));
      });
    return () => {
      live = false;
    };
  }, [findingsApi, hasManuscript, sort, scope, all, reload, overlay, attempt]);

  const choose = useCallback(
    (next: string) => {
      if (next !== ALL_CHAPTERS) {
        setCurrent(next);
        saveLastChapter(projectFolder, next);
      }
      setParams(next === ALL_CHAPTERS ? {} : { chapter: next });
    },
    [setParams, projectFolder],
  );
  // From All chapters a step opens the chapter last looked at, as the mock's `stepChapter` does; then it moves along the book.
  const step = useCallback(
    (direction: -1 | 1) => {
      if (all) {
        if (fallback) choose(fallback.id);
        return;
      }
      const at = chapters.findIndex((c) => c.id === scope);
      const next = chapters[at + direction];
      if (next) choose(next.id);
    },
    [all, fallback, chapters, scope, choose],
  );

  const select = useCallback(
    (id: string) => {
      selectedRef.current = id;
      setSelectedId(id);
      rememberSelection(projectFolder, scope, id);
    },
    [projectFolder, scope],
  );
  // The first note is selected while none is (the mock opens on one), so the Inspector is never empty while there are notes.
  useEffect(() => {
    if (findings.length > 0 && !findings.some((f) => f.id === selectedId)) select(findings[0].id);
  }, [findings, selectedId, select]);
  const selected = findings.find((f) => f.id === selectedId) ?? null;
  // The rows the notes list shows (a chip, the find box or the "In view" window can hide some): keys and the step after a decision follow them.
  const [shown, setShown] = useState<readonly string[] | null>(null);
  const order = useMemo(() => {
    const all = findings.map((f) => f.id);
    if (shown === null) return all;
    const visible = new Set(shown);
    return all.filter((id) => visible.has(id));
  }, [findings, shown]);

  const replace = useCallback((next: Finding) => setFindings((list) => list.map((f) => (f.id === next.id ? held(next) : f))), []);
  // A decision is one journal entry, so Ctrl+Z and History take it back as the toast's Undo does (mock `decideNote` over `act`). Undo puts the
  // decision back and the selection with it. The same decision again with nothing typed is no decision: no entry, no toast.
  const listRef = useRef(findings);
  listRef.current = findings;
  const entryOf = useRef(new Map<string, number>());
  const scopeRef = useRef({ all, scope });
  scopeRef.current = { all, scope };
  const journalledReview = useCallback(
    async (request: Parameters<typeof findingsApi.findingsReview>[0]): Promise<Finding> => {
      const before = listRef.current.find((f) => f.id === request.id);
      if (!before || (before.review.status === request.status && (before.review.note ?? '') === request.note)) return findingsApi.findingsReview(request);
      let failure: unknown;
      const result = await journal.act({
        label: `Decision “${decisionLabel(request.status ?? 'unreviewed', fixKindOf(before))}” at ${noteRow(before).time}`,
        touches: [`proof/finding/${request.id}`],
        run: async () => {
          try {
            return { ok: true as const, value: await findingsApi.findingsReview(request) };
          } catch (error) {
            failure = error;
            return { ok: false as const, refusal: { code: 'host_refused', reason: describeApiError(error) } };
          }
        },
        undo: async (decided) => {
          try {
            const back = await findingsApi.findingsReview({
              id: request.id,
              evidenceVersion: decided.evidence_version ?? '',
              status: before.review.status,
              note: before.review.note ?? '',
            });
            replace(back);
            select(request.id);
            announcePickupListChanged();
            // The note may be in a chapter other than the one now open: go back to it, so the decision taken back is the one in view.
            const home = chapterOf(before);
            if (home && !scopeRef.current.all && scopeRef.current.scope !== home) choose(home);
            setReload((n) => n + 1);
            return { ok: true as const, value: back };
          } catch (error) {
            return { ok: false as const, refusal: { code: 'host_refused', reason: describeApiError(error) } };
          }
        },
      });
      // The Inspector tells a stale decision from any other failure by what the host threw, so that is what it gets back.
      if (!result.ok) throw failure ?? new Error(result.refusal.reason);
      entryOf.current.set(request.id, result.value.id);
      return result.value.value;
    },
    [findingsApi, journal, replace, select, choose],
  );
  const inspectorApi = useMemo(() => ({ ...findingsApi, findingsReview: journalledReview }), [findingsApi, journalledReview]);
  // A saved decision moves to the next note and offers Undo: the journal entry's own undo.
  const changed = useCallback(
    (next: Finding, decided: boolean) => {
      const entry = entryOf.current.get(next.id);
      entryOf.current.delete(next.id);
      replace(next);
      setReload((n) => n + 1);
      if (decided && entry !== undefined) {
        const after = order[order.indexOf(next.id) + 1];
        if (after) select(after);
        overlay.toastUndo(`${noteRow(next).time} · ${noteRow(next).resolution.label}`, () => journal.undo(entry), { entry });
      }
      announcePickupListChanged();
    },
    [order, replace, select, overlay, journal],
  );

  const chapterNotes = useMemo(() => (chapter ? findings.filter((f) => chapterOf(f) === chapter.id) : []), [findings, chapter]);
  const timeline = useChapterTimeline(chapter?.id);
  const total = timeline?.total ?? 0;
  const spots = useSpotTakes(chapter?.id ?? '', chapterNotes);
  const spot = selected ? spots.spotFor(selected.id) : null;
  // Show where's text: the selected note's paragraph and its neighbours, its own words marked (research note A5).
  const shownWords = selected?.manuscript?.expected ? { text: selected.manuscript.expected, ordinal: selected.manuscript.span?.ordinal } : undefined;
  const around = useParagraphsAround(manuscriptApi, selected?.manuscript?.chapter_id, selected?.manuscript?.span?.paragraph_id, shownWords);

  // The window follows the selected note (mock `followSelection`).
  const selectedSecond = selected?.time_range && timeline ? timeline.toTimeline(selected.time_range.start) : null;
  useEffect(() => {
    if (selectedSecond === null || total <= 0) return;
    setWin((w) => followSecond({ start: w.start, len: Math.min(w.len, total) }, selectedSecond, total));
  }, [selectedSecond, total]);

  const pins = useMemo<Pin[]>(() => {
    if (!timeline) return [];
    return chapterNotes.flatMap((f) => {
      const sec = f.time_range ? timeline.toTimeline(f.time_range.start) : null;
      if (sec === null) return [];
      const row = noteRow(f);
      return [{ id: f.id, sec, colour: pinColour(row.type), done: row.decided, label: `${row.type} at ${row.time}` }];
    });
  }, [chapterNotes, timeline]);
  // The takes sit in project seconds and the window in seconds into the chapter's recording: `shift` is the one less the other.
  const active = spot?.takes.find((t) => t.active);
  const activeAt = active && timeline ? timeline.toTimeline(active.start) : null;
  const shift = active && activeAt !== null ? active.start - activeAt : 0;
  // The take that plays at the selected spot is a band on the trace; the others sit below in their own lanes.
  const bands = useMemo<Band[]>(
    () =>
      active && activeAt !== null
        ? [{ id: active.id, start: activeAt, end: activeAt + active.len, label: active.label + (active.kept ? ' · Kept' : ''), tone: 'ok' }]
        : [],
    [active, activeAt],
  );

  const strip = useMemo<StripChapter[]>(() => {
    const tile = (id: string, name: string, number: number | null): StripChapter => {
      const rows = findings.filter((f) => chapterOf(f) === id).map(noteRow);
      return { id, name, number, total: rows.length, open: rows.filter((r) => r.open).length };
    };
    return [
      ...(creditsTiles.opening ? [tile(creditsTiles.opening.id, creditsTiles.opening.name, null)] : []),
      ...chapters.map((c, i) => tile(c.id, headingName(c), i + 1)),
      ...(creditsTiles.closing ? [tile(creditsTiles.closing.id, creditsTiles.closing.name, null)] : []),
    ];
  }, [chapters, findings, creditsTiles]);
  // Proof has no chapter view for the credits (its notes and recording are the manuscript chapters'), so their tiles open the credits card on Script.
  const chooseTile = useCallback(
    (id: string) => {
      const kind = creditsKindOfId(id);
      if (kind) goTo(addressPath({ page: 'script', credits: kind }));
      else choose(id);
    },
    [goTo, choose],
  );
  const progress = useMemo(() => {
    if (all) return proofProgress(summary ?? { total: 0, decided: 0, cleared: 0 }, openPickupsBeyondNotes(pickups));
    const rows = findings.map(noteRow);
    return proofProgress(
      { total: rows.length, decided: rows.filter((r) => r.decided).length, cleared: rows.filter((r) => !r.open).length },
      openPickupsBeyondNotes(pickups, scope),
    );
  }, [all, summary, findings, pickups, scope]);

  useEffect(() => {
    if (!revealInspector.current) return;
    revealInspector.current = false;
    requestAnimationFrame(() => inspectorPanel.current?.scrollIntoView?.({ block: 'start' }));
  }, [selectedId, chapter?.id]);

  useProofKeys({ order, selectedId, select, step, allChapters: all, toAllChapters: () => choose(ALL_CHAPTERS) });
  useProofPageCommands({
    chapters,
    scope,
    openIn: (id) => strip.find((tile) => tile.id === id)?.open ?? 0,
    selectedId,
    choose,
    review: { available: review.available, message: review.message },
    onCheck: (ids) => openCheckRecordings(ids),
  });
  useNoteContextMenu({
    findings,
    selectedId: () => selectedRef.current,
    select,
    goToScript,
    goToBooth,
  });

  if (!hasManuscript) return <NeedManuscript title="Proof" onImport={() => goTo('/')} />;
  if (loadProblem !== undefined) return <LoadError title="Proof" message={loadProblem} retry={() => setAttempt((n) => n + 1)} />;
  if (!firstRead.chapters || !firstRead.notes) return <ProofSkeleton />;

  const stepper = (
    <ChapterStepper
      chapters={chapters.map((c) => {
        // How far the chapter is recorded, the value the Booth resumes at (`chapterRecordedDetail`).
        const detail = chapterRecordedDetail(c);
        return { id: c.id, name: headingName(c), ...(detail ? { detail } : {}) };
      })}
      value={chapter ? chapter.id : ALL_CHAPTERS}
      allowAll
      stepKeys={['←', '→']}
      onChange={choose}
      onStep={step}
    />
  );
  const hints = footerHints('proof', keymap, undefined, undefined, new Set(all ? [] : ['chapterView' as const]));

  return (
    <CommandScope kind="page">
      <div className="flex min-h-full flex-col">
        <div
          // `content-start`: in one column the cards keep their own heights and 16 px gaps instead of sharing out the window's spare
          // height (XPF-8); side by side, the notes card fills its row down to the Inspector's end (XPF-7).
          className="grid flex-1 content-start gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_380px] min-[1180px]:grid-rows-[auto_minmax(0,1fr)]"
          // A right click on a row selects it first, so the menu acts on the row under the pointer.
          onContextMenuCapture={(event) => {
            const row = (event.target as Element).closest<HTMLElement>('section[aria-label="Notes"] tr[data-row]');
            if (!row) return;
            selectingForMenu.current = true;
            row.click();
            selectingForMenu.current = false;
          }}
        >
          <section
            aria-label="Proof"
            className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <ProofHeader progress={progress} chapterBar={stepper} />
            {all || !chapter ? (
              <div className="flex flex-col gap-1">
                <SectionLabel>Open notes, by chapter</SectionLabel>
                <ChapterStrip chapters={strip} current={current} onChooseChapter={chooseTile} />
              </div>
            ) : (
              <>
                {/* The check card and the waveform sit under the page's h1 and before the notes' h2: a heading of their own keeps the outline in order. */}
                <h2 className="sr-only">{`Recording of ${headingName(chapter)}`}</h2>
                <CheckCard chapter={chapter} onCheck={(id) => openCheckRecordings([id])} />
                {timeline && total > 0 ? (
                  <>
                    <WaveformWindow
                      total={total}
                      window={{ start: win.start, len: Math.min(win.len, total) }}
                      onWindowChange={setWin}
                      segments={timeline.segments}
                      pins={pins}
                      bands={bands}
                      selectedId={selectedId}
                      onPin={select}
                      noteCount={chapterNotes.length}
                    />
                    <TakeLanes spot={spot} winStart={win.start + shift} winLen={Math.min(win.len, total)} />
                  </>
                ) : !timeline ? (
                  <p className="text-sm text-[var(--text-muted)]">Reading the recording…</p>
                ) : hasRecording(chapter.recordedSeconds) ? (
                  <p className="text-sm text-[var(--text-muted)]">No recording for this chapter yet.</p>
                ) : // The check card above already says there is no recording to check (alignment audit XPF-16).
                null}
              </>
            )}
          </section>
          <div
            className="flex min-h-0 min-w-0 flex-col min-[1180px]:row-start-2"
            // A row pressed (a click or Enter), not stepped to with the keys, opens its chapter from All chapters, as in the mock.
            onClickCapture={(event) => {
              if (!selectingForMenu.current && (event.target as Element).closest('tr[data-row]')) opening.current = true;
            }}
            onKeyDownCapture={(event) => {
              if (event.key === 'Enter' && (event.target as Element).closest('tr[data-row]')) opening.current = true;
            }}
          >
            <NotesPanel
              findings={findings}
              allChapters={all}
              sort={sort}
              onSortChange={setSort}
              selectedId={selectedId}
              onShownChange={setShown}
              onSelect={(id) => {
                const open = opening.current;
                opening.current = false;
                if (open && stacked) revealInspector.current = true;
                select(id);
                const note = findings.find((f) => f.id === id);
                if (open && all && note && chapterOf(note)) choose(chapterOf(note));
              }}
              window={chapter && total > 0 ? { start: win.start, len: Math.min(win.len, total), total } : undefined}
              lead={
                <IconButton
                  action="checkRecordings"
                  label="Check recordings…"
                  aria-haspopup="dialog"
                  disabledReason={review.available ? undefined : review.message || 'The DAW is not reachable.'}
                  onClick={() => openCheckRecordings(chapter ? [chapter.id] : [])}
                />
              }
              actions={<ProoferSheet />}
              badge={(row) => {
                const count = spots.counts.get(row.id);
                return count ? <TakesBadge count={count} /> : null;
              }}
            />
          </div>
          <div
            ref={inspectorPanel}
            // With no note to show it is a placeholder at its own height, not a card the height of the page (XPF-27).
            className={`min-w-0 scroll-mt-[var(--page-gutter)] rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 min-[1180px]:col-start-2 min-[1180px]:row-span-2 min-[1180px]:row-start-1 ${selected ? '' : 'min-[1180px]:self-start'}`}
          >
            {selected ? (
              <Inspector
                key={selected.id}
                finding={selected}
                api={inspectorApi}
                order={order}
                onSelect={select}
                onChanged={changed}
                onOpenScript={goToScript}
                onOpenBooth={goToBooth}
                onOpenEditing={(chapterId, findingId) => goToEditing(chapterId, findingId)}
                typeControl={
                  <TypeSelect
                    finding={selected}
                    onChange={(type) =>
                      void findingsApi
                        .findingsSetType(selected.id, selected.evidence_version ?? '', type)
                        .then(replace)
                        .catch((error: unknown) => overlay.toast(describeApiError(error), { tone: 'error' }))
                    }
                  />
                }
                around={<SurroundingText around={around.around} reason={around.reason} kind={NOTE_KIND[shownFindingNoteType(selected)]} />}
                spot={
                  <SpotTakes spot={spot} refusal={spots.refusalFor(selected.id)} onOpenInEditing={(id, passageId) => goToEditing(id, selected.id, passageId)} />
                }
              />
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                {findings.length ? 'Choose a note to see what was heard.' : 'A note shows here once a check finds one.'}
              </p>
            )}
          </div>
        </div>
        <KeyHints hints={hints} />
      </div>
    </CommandScope>
  );
}
