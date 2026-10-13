import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Finding, FindingsSummary } from '../../api/contracts/findings';
import { describeApiError } from '../../api/errorMessage';
import { chapterName } from '../../chapterName';
import { footerHints } from '../../input/hints';
import { CommandScope } from '../../input/router';
import { useUserKeymap } from '../../input/useUserKeymap';
import { useOverlay } from '../../overlay/OverlayProvider';
import { usePort } from '../../ports/usePort';
import { useCapability } from '../../useCapability';
import type { ManuscriptChapter } from '../../types';
import { ALL_CHAPTERS, ChapterStepper } from '../primitives/ChapterStepper';
import { IconButton } from '../primitives/IconButton';
import { KeyHints } from '../primitives/KeyHints';
import { openCheckRecordings } from '../recordingcheck/openCheckRecordings';
import { creditsEntries, creditsKindOfId } from '../credits/creditsEntries';
import { useCreditsRows } from '../credits/useCreditsRows';
import { NeedManuscript } from '../layout/NeedManuscript';
import { CheckCard } from './checkcard/CheckCard';
import { ChapterStrip, type StripChapter } from './frame/ChapterStrip';
import type { Band, Pin } from './frame/pins';
import { ProofHeader } from './frame/ProofHeader';
import { WaveformWindow } from './frame/WaveformWindow';
import { followSecond, MIN_WINDOW, type TimeWindow } from './frame/windowMath';
import { Inspector } from './inspector/Inspector';
import { TypeSelect } from './inspector/TypeSelect';
import { NotesPanel } from './notes/NotesPanel';
import { noteRow, queryFor, type NoteSort } from './notes/noteRows';
import { proofProgress } from './proof.selectors';
import { ProoferSheet } from './ProoferSheet';
import { SpotTakes } from './spot/SpotTakes';
import { TakeLanes } from './spot/TakeLanes';
import { TakesBadge } from './spot/TakesBadge';
import { useSpotTakes } from './spot/useSpotTakes';
import { useChapterTimeline } from './useChapterTimeline';
import { useProofKeys } from './useProofKeys';
import { useNoteContextMenu } from './useNoteContextMenu';

/** A pin's ink by the kind of note: a misread or a skip in red, a pickup or a repeat in amber, a name in blue, the rest muted. */
const PIN_COLOUR: Record<string, string> = {
  transcript_discrepancy: 'var(--danger)',
  pickup: 'var(--warn)',
  duplicate_read: 'var(--warn)',
  pronunciation: 'var(--info)',
  entity: 'var(--info)',
};

// The last chapter the narrator looked at on Proof, per project (ADR 0750): stepping out of All chapters opens it. A per-viewer
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
  const manuscriptApi = usePort('manuscript');
  const overlay = useOverlay();
  const keymap = useUserKeymap();
  const review = useCapability('review');
  const [params, setParams] = useSearchParams();
  const [chapters, setChapters] = useState<ManuscriptChapter[]>([]);
  // The credits tiles of the strip: the same entries the Script list draws, the opening left out when the manuscript brought its own.
  const [ownsOpening, setOwnsOpening] = useState(false);
  const credits = useCreditsRows(projectFolder, (error) => overlay.toast(describeApiError(error), { tone: 'error' }));
  const creditsTiles = useMemo(() => creditsEntries(credits.rows, ownsOpening), [credits.rows, ownsOpening]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [summary, setSummary] = useState<FindingsSummary>();
  const [sort, setSort] = useState<NoteSort>('time');
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('finding'));
  const [current, setCurrent] = useState(() => loadLastChapter(projectFolder));
  const [win, setWin] = useState<TimeWindow>({ start: 0, len: MIN_WINDOW });
  // The latest selection, set as it happens: the right-click menu reads it in the same event that selected the row.
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  // Set while a row is pressed (it opens the row's chapter) or selected for the right-click menu (it does not).
  const opening = useRef(false);
  const selectingForMenu = useRef(false);

  const scope = params.get('chapter') ?? ALL_CHAPTERS;
  const all = scope === ALL_CHAPTERS;
  const chapter = all ? undefined : chapters.find((c) => c.id === scope);
  const fallback = chapters.find((c) => c.id === current) ?? chapters[0];

  useEffect(() => {
    if (!hasManuscript) return;
    let live = true;
    manuscriptApi
      .manuscriptChapters()
      .then((list) => {
        if (!live) return;
        setChapters(list.filter(isNarration));
        setOwnsOpening(list.some((c) => c.contentKind === 'opening'));
      })
      .catch((error: unknown) => overlay.toast(describeApiError(error), { tone: 'error' }));
    return () => {
      live = false;
    };
  }, [manuscriptApi, hasManuscript, overlay]);

  // The notes in scope, in the order the sort asked for, and the book's counts for the head; an answer to an older request is dropped.
  useEffect(() => {
    if (!hasManuscript) return;
    let live = true;
    Promise.all([findingsApi.findingsList(queryFor(sort, all ? undefined : scope)), findingsApi.findingsSummary()])
      .then(([page, counts]) => {
        if (!live) return;
        setFindings(page.findings.map(held));
        setSummary(counts);
      })
      .catch((error: unknown) => live && overlay.toast(describeApiError(error), { tone: 'error' }));
    return () => {
      live = false;
    };
  }, [findingsApi, hasManuscript, sort, scope, all, reload, overlay]);

  const choose = useCallback(
    (next: string) => {
      if (next !== ALL_CHAPTERS) {
        setCurrent(next);
        saveLastChapter(projectFolder, next);
      }
      setParams(next === ALL_CHAPTERS ? {} : { chapter: next }, { replace: true });
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

  const select = useCallback((id: string) => {
    selectedRef.current = id;
    setSelectedId(id);
  }, []);
  // The first note is selected while none is (the mock opens on one), so the Inspector is never empty while there are notes.
  useEffect(() => {
    if (findings.length > 0 && !findings.some((f) => f.id === selectedId)) select(findings[0].id);
  }, [findings, selectedId, select]);
  const selected = findings.find((f) => f.id === selectedId) ?? null;
  const order = useMemo(() => findings.map((f) => f.id), [findings]);

  const replace = useCallback((next: Finding) => setFindings((list) => list.map((f) => (f.id === next.id ? held(next) : f))), []);
  // A saved decision moves to the next note and offers Undo, which puts the decision back and the selection with it (mock `decideNote`).
  const changed = useCallback(
    (next: Finding, decided: boolean) => {
      const before = findings.find((f) => f.id === next.id);
      replace(next);
      setReload((n) => n + 1);
      if (!decided || !before) return;
      const after = order[order.indexOf(next.id) + 1];
      if (after) select(after);
      overlay.toastUndo(`${noteRow(next).resolution.label} · ${noteRow(next).time}`, async () => {
        try {
          const back = await findingsApi.findingsReview({
            id: next.id,
            evidenceVersion: next.evidence_version ?? '',
            status: before.review.status,
            note: before.review.note ?? '',
          });
          replace(back);
          select(next.id);
          setReload((n) => n + 1);
          return { ok: true };
        } catch (error) {
          return { ok: false, refusal: { reason: describeApiError(error) } };
        }
      });
    },
    [findings, order, replace, select, overlay, findingsApi],
  );

  const chapterNotes = useMemo(() => (chapter ? findings.filter((f) => chapterOf(f) === chapter.id) : []), [findings, chapter]);
  const timeline = useChapterTimeline(chapter?.id);
  const total = timeline?.total ?? 0;
  const spots = useSpotTakes(chapter?.id ?? '', chapterNotes);
  const spot = selected ? spots.spotFor(selected.id) : null;

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
      return [{ id: f.id, sec, colour: PIN_COLOUR[f.category] ?? 'var(--text-muted)', done: row.decided, label: `${row.type} at ${row.time}` }];
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
      ...chapters.map((c, i) => tile(c.id, chapterName(c), i + 1)),
      ...(creditsTiles.closing ? [tile(creditsTiles.closing.id, creditsTiles.closing.name, null)] : []),
    ];
  }, [chapters, findings, creditsTiles]);
  // Proof has no chapter view for the credits (its notes and recording are the manuscript chapters'), so their tiles open the credits card on Script.
  const chooseTile = useCallback(
    (id: string) => {
      const kind = creditsKindOfId(id);
      if (kind) goTo(`/script#credits-${kind}`);
      else choose(id);
    },
    [goTo, choose],
  );
  const progress = useMemo(() => {
    if (all) return proofProgress(summary ?? { total: 0, decided: 0, cleared: 0 }, 0);
    const rows = findings.map(noteRow);
    return proofProgress({ total: rows.length, decided: rows.filter((r) => r.decided).length, cleared: rows.filter((r) => !r.open).length }, 0);
  }, [all, summary, findings]);

  useProofKeys({ order, selectedId, select, step, allChapters: all, toAllChapters: () => choose(ALL_CHAPTERS) });
  useNoteContextMenu({
    findings,
    selectedId: () => selectedRef.current,
    select,
    goToScript,
    goToBooth,
  });

  if (!hasManuscript) return <NeedManuscript title="Proof" onImport={() => goTo('/')} />;

  const stepper = (
    <ChapterStepper
      chapters={chapters.map((c) => ({ id: c.id, name: chapterName(c) }))}
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
          className="grid flex-1 gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_380px] min-[1180px]:grid-rows-[auto_minmax(0,1fr)]"
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
            className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <ProofHeader progress={progress} chapterBar={stepper} />
            {all || !chapter ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-[var(--text-muted)]">Open notes, by chapter</span>
                <ChapterStrip chapters={strip} current={current} onChooseChapter={chooseTile} />
              </div>
            ) : (
              <>
                {/* The check card and the waveform sit under the page's h1 and before the notes' h2: a heading of their own keeps the outline in order. */}
                <h2 className="sr-only">{`Recording of ${chapterName(chapter)}`}</h2>
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
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">{timeline ? 'No recording for this chapter yet.' : 'Reading the recording…'}</p>
                )}
              </>
            )}
          </section>
          <div
            className="min-h-0 min-w-0 min-[1180px]:row-start-2"
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
              onSelect={(id) => {
                const open = opening.current;
                opening.current = false;
                select(id);
                const note = findings.find((f) => f.id === id);
                if (open && all && note && chapterOf(note)) choose(chapterOf(note));
              }}
              window={chapter && total > 0 ? { start: win.start, len: Math.min(win.len, total), total } : undefined}
              actions={
                <>
                  <IconButton
                    action="checkRecordings"
                    label="Check recordings…"
                    aria-haspopup="dialog"
                    disabledReason={review.available ? undefined : review.message || 'The DAW is not reachable.'}
                    onClick={() => openCheckRecordings(chapter ? [chapter.id] : [])}
                  />
                  <ProoferSheet />
                </>
              }
              badge={(row) => {
                const count = spots.counts.get(row.id);
                return count ? <TakesBadge count={count} /> : null;
              }}
            />
          </div>
          <div className="min-w-0 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-4 min-[1180px]:col-start-2 min-[1180px]:row-span-2 min-[1180px]:row-start-1">
            {selected ? (
              <Inspector
                key={selected.id}
                finding={selected}
                api={findingsApi}
                order={order}
                onSelect={select}
                onChanged={changed}
                onOpenScript={goToScript}
                onOpenBooth={goToBooth}
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
                spot={
                  <SpotTakes spot={spot} refusal={spots.refusalFor(selected.id)} onOpenInEditing={(id, passageId) => goToEditing(id, selected.id, passageId)} />
                }
              />
            ) : (
              <p className="text-sm text-[var(--text-muted)]">{findings.length ? 'Choose a note to see what was heard.' : 'No notes yet.'}</p>
            )}
          </div>
        </div>
        <div className="sticky -bottom-4 z-[5] -mx-4 mt-4 -mb-4 md:-bottom-6 md:-mx-6 md:-mb-6">
          <KeyHints hints={hints} />
        </div>
      </div>
    </CommandScope>
  );
}
