// The Studio Next Script page (SNB-7i; the mock's `pages/script/ScriptPage.tsx`): the chapter list, the continuous reader and the rail
// with its five tabs, drawers at narrower widths, the empty state, and the credits cards re-homed from the old page. It assembles the
// pieces of SN-B741..SN-B762 and the bookmarks of SN-B62 over the data layer of SN-B70; it holds no host data of its own. The selected
// mark, the tab, the word, the entry, Find and the drawer are the SN-B70 view module's; the bookmark gone to is the page's own, as the
// view module leaves bookmarks out. The `/script` route mounts it (App.tsx, SN-B8).

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Bookmark } from '../../../api/contracts/bookmarks';
import type { ManuscriptChapter } from '../../../api/contracts/manuscript';
import type { Mark } from '../../../api/contracts/marks';
import { chapterName } from '../../../chapterName';
import { useLayoutClass } from '../../../hooks/useLayoutClass';
import { CommandScope } from '../../../input/router';
import { useUserKeymap } from '../../../input/useUserKeymap';
import { overlay } from '../../../overlay/overlayService';
import { isListableChapter } from '../../../state';
import type { CreditsKind } from '../../booth/readerModel';
import { CreditsSetupDialog } from '../../credits/CreditsSetupDialog';
import { LoadError } from '../../layout/LoadError';
import { retailSampleRange } from '../../manuscript/retailSampleRange';
import { IconButton } from '../../primitives/IconButton';
import { KeyHints } from '../../primitives/KeyHints';
import { PANEL_FRAME_CLASS } from '../../primitives/panelStyles';
import type { Notify } from '../../primitives/Toast';
import { useBookmarkCommands } from '../bookmarks/model/useBookmarkCommands';
import { useBookmarks } from '../bookmarks/model/useBookmarks';
import type { LineText, Spot } from '../bookmarks/model/selectors';
import { useBookmarkContextMenu } from '../bookmarks/ui/bookmarkContextMenu';
import { BookmarksTab } from '../bookmarks/ui/BookmarksTab';
import { dictionaryInstallPrompt } from '../dictionaryInstall';
import { useScriptCredits, useSaveMarkTypes, useWordsHost } from '../scriptPageHost';
import { ChapterCard } from './chapters/ChapterCard';
import { ChapterList } from './chapters/ChapterList';
import { isAsk } from './data/script.selectors';
import { useChapters, useEntries, useMarks, useScriptCommands, useScriptPrep, useScriptView, useSpeakers } from './data/useScriptData';
import { BookmarkGutter, GutterContext, type GutterState } from './layout/BookmarkGutter';
import { NeedManuscript } from '../../layout/NeedManuscript';
import { RAIL_LABEL, RailPanel, type RailTab } from './layout/RailPanel';
import { ScriptColumns } from './layout/ScriptColumns';
import { ScriptCredits } from './layout/ScriptCredits';
import { creditsRows } from './chapters/creditsRows';
import { SpeakerLayer } from './layout/SpeakerLayer';
import { useDeepLink } from './layout/useDeepLink';
import { scriptKeyHints } from './layout/scriptKeyHints';
import { useLoadedParagraphs } from './layout/useLoadedParagraphs';
import { Reader } from './reader/Reader';
import { readFindQuery } from './scriptQuery';
import { BibleTab } from './rail/bible/BibleTab';
import { BIBLE_KINDS } from './rail/bible/kinds';
import { ThreadsTab } from './rail/threads/ThreadsTab';
import { WordsTab } from './rail/words/WordsTab';
import type { ReaderSelection } from './registry/contextProvider';
import { useScriptRegistry } from './registry/useScriptRegistry';
import { FindBar } from './tools/find/FindBar';
import { openFind } from './tools/find/findState';
import { searchManuscript, type FindMatch } from './tools/find/searchManuscript';
import { useFind } from './tools/find/useFind';
import { getSelection, type ToolSelection } from './tools/select/getSelection';
import { lookupTarget } from './tools/select/lookupTarget';
import { MarkComposer } from './tools/select/MarkComposer';
import { MarksDialog } from './tools/select/MarksDialog';
import { SelectionTool } from './tools/select/SelectionTool';
import { SpeakerPicker } from './tools/speaker/SpeakerPicker';
import { speakerChoices, speakersInChapter } from './tools/speaker/speakerChoices';
import { TextSettingsPopover } from './tools/text/TextSettings';
import { readerVars } from './tools/text/readerText';
import { useTextPrefs } from './tools/text/useTextPrefs';

export type ScriptPageProps = {
  notify: Notify;
  focusStoryBibleEntity: (id: string) => void;
  /** The old page's "Open in Proof". The mock's chapter card has no such button, so this page draws none; kept so the swap is one line. */
  goToEditing?: (chapterId: string) => void;
  /** Keys the credits cards' remembered open state: a project's own choice. */
  projectFolder: string;
  /** Record in Booth on a chapter or the credits. Omitted, no card offers it. */
  goToBooth?: (target: { chapter: string } | { credits: CreditsKind }) => void;
};

/** How long the paragraph of a bookmark just gone to stays lit, as the mock's. */
const BOOKMARK_FLASH_MS = 1600;

const isNarration = (chapter: Pick<ManuscriptChapter, 'contentKind'>) => (chapter.contentKind ?? 'narration') === 'narration';

/** The page: the empty state with no manuscript, the host's sentence when the chapters cannot be read, else the three columns. */
export function ScriptPage(props: ScriptPageProps) {
  const chapters = useChapters();
  const navigate = useNavigate();
  const listable = useMemo(() => (chapters.value ?? []).filter(isListableChapter), [chapters.value]);
  if (chapters.status === 'error' && chapters.value === undefined) return <LoadError title="Script" message={chapters.message} retry={chapters.retry} />;
  if (chapters.value === undefined)
    return (
      <p role="status" className="p-4 text-sm text-[var(--text-muted)]">
        Reading the manuscript…
      </p>
    );
  if (listable.length === 0) return <NeedManuscript title="Script" onImport={() => navigate('/')} />;
  return (
    <CommandScope kind="page">
      <ScriptWorkspace {...props} chapters={listable} allChapters={chapters.value} />
    </CommandScope>
  );
}

type BookmarkPlace = {
  /** The bookmark last gone to; stepping goes on from it while it is in view. */
  at: string | null;
  /** A bookmark the reader is asked to scroll to, once. */
  pending: { paragraphId: string; offset: number } | null;
  /** The bookmark whose ribbon pulses. */
  flash: string | null;
};
const NO_PLACE: BookmarkPlace = { at: null, pending: null, flash: null };
const NO_BOOKMARKS: readonly Bookmark[] = [];

function ScriptWorkspace({
  chapters,
  allChapters,
  notify,
  focusStoryBibleEntity,
  projectFolder,
  goToBooth,
}: ScriptPageProps & { chapters: readonly ManuscriptChapter[]; allChapters: readonly ManuscriptChapter[] }) {
  const navigate = useNavigate();
  const layout = useLayoutClass();
  const marks = useMarks();
  const prep = useScriptPrep();
  const entries = useEntries();
  const speakers = useSpeakers();
  const commands = useScriptCommands();
  const bookmarks = useBookmarks();
  const credits = useScriptCredits();
  const host = useWordsHost();
  // The Words tab asks about the dictionary where it is missing, in place (G17); the prompt reads the asset registry, not this page.
  const wordsHost = useMemo(() => ({ ...host, installPrompt: dictionaryInstallPrompt }), [host]);
  const keymap = useUserKeymap();
  const hints = useMemo(() => scriptKeyHints(keymap), [keymap]);
  const saveMarkTypes = useSaveMarkTypes(marks.retry);
  const [prefs, setPrefs] = useTextPrefs();
  // The reader's custom properties (`--rs`, `--rl`, `--rw`, `--rf`), which React sets as written.
  const vars = useMemo(() => readerVars(prefs) as CSSProperties, [prefs]);

  const [drawer, update] = useScriptView((state) => state.drawer);
  const [tab] = useScriptView((state) => state.tab);
  const [selectedMark] = useScriptView((state) => state.sel);
  const [missSel] = useScriptView((state) => state.missSel);
  const [spyAt] = useScriptView((state) => state.spyAt);
  const [pendingJump] = useScriptView((state) => state.pendingJump);
  const [pendingPid] = useScriptView((state) => state.pendingPid);

  const order = useMemo(() => chapters.map((chapter) => chapter.id), [chapters]);
  const paragraphs = useLoadedParagraphs(order);
  const inView = spyAt ?? chapters[0]!.id;
  const inViewRef = useRef(inView);
  inViewRef.current = inView;

  const [selection, setSelection] = useState<ToolSelection | null>(null);
  const [composing, setComposing] = useState<{ type: string; selection: ReaderSelection } | null>(null);
  const [definingMarks, setDefiningMarks] = useState(false);
  const [picking, setPicking] = useState<{ cueId: string; anchor: DOMRect } | null>(null);
  const [fillingIn, setFillingIn] = useState(false);
  const [place, setPlace] = useState<BookmarkPlace>(NO_PLACE);
  const [editAfterAdd, setEditAfterAdd] = useState<string | null>(null);

  /* ---------- Where things are ---------- */

  const chapterById = useMemo(() => new Map(chapters.map((chapter) => [chapter.id, chapter])), [chapters]);
  const lineOf = useCallback(
    (spot: { chapterId: string; paragraphId: string }): string => {
      const chapter = chapterById.get(spot.chapterId);
      const n = (paragraphs.paragraphsOf(spot.chapterId) ?? []).findIndex((row) => row.id === spot.paragraphId);
      return [chapter ? chapterName(chapter, 'short') : '', n >= 0 ? `¶ ${n + 1}` : ''].filter(Boolean).join(' · ');
    },
    [chapterById, paragraphs],
  );
  const lineText = useCallback<LineText>((b) => paragraphs.paragraphsOf(b.chapterId)?.find((row) => row.id === b.paragraphId)?.text, [paragraphs]);
  const lines = useCallback(() => paragraphs.all.map((row) => ({ chapterId: row.chapterId, id: row.id, index: row.index, text: row.text })), [paragraphs.all]);
  const named = useMemo(() => chapters.map((chapter) => ({ id: chapter.id, name: chapterName(chapter) })), [chapters]);

  /* ---------- Showing things ---------- */

  const openRailIfDrawer = useCallback(() => {
    if (layout.medium) update({ drawer: 'rail' });
  }, [layout.medium, update]);
  const showMark = useCallback(
    (mark: Mark, scroll = true) => {
      update({ sel: mark.id, tab: isAsk(marks.types, mark) ? 'queries' : 'marks', ...(scroll ? { pendingPid: mark.paragraphId } : {}) });
      openRailIfDrawer();
    },
    [marks.types, update, openRailIfDrawer],
  );
  const showWord = useCallback(
    (word: string) => {
      update({ tab: 'pron', word });
      openRailIfDrawer();
    },
    [update, openRailIfDrawer],
  );
  const showEntry = useCallback(
    (entryId: string) => {
      update({ tab: 'bible', entryId, miss: null, missSel: null });
      openRailIfDrawer();
    },
    [update, openRailIfDrawer],
  );
  const showBookmarks = () => {
    if (layout.medium && drawer === 'rail' && tab === 'bookmarks') return update({ drawer: null });
    update({ tab: 'bookmarks' });
    openRailIfDrawer();
  };
  const toggleDrawer = (which: 'ch' | 'rail') => update((state) => ({ drawer: state.drawer === which ? null : which }));
  const goToChapter = useCallback((chapterId: string) => update({ pendingJump: chapterId, drawer: null }), [update]);
  const goToLink = useCallback(
    ({ chapterId, paragraphId }: { chapterId: string; paragraphId?: string }) =>
      update(paragraphId ? { pendingPid: paragraphId, drawer: null } : { pendingJump: chapterId, drawer: null }),
    [update],
  );
  useDeepLink({ chapters: allChapters, goTo: goToLink, notify });

  // `/script?find=<text>` opens Find on that text once (the Story Bible's Find button), then leaves the address as `/script`.
  const { search } = useLocation();
  useEffect(() => {
    const text = readFindQuery(new URLSearchParams(search));
    if (text === null) return;
    update(openFind(text));
    navigate({ pathname: '/script', search: '' }, { replace: true });
  }, [search, update, navigate]);

  /* ---------- Bookmarks ---------- */

  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  const goToBookmark = useCallback(
    (bookmark: Bookmark) => {
      setPlace({ at: bookmark.id, pending: { paragraphId: bookmark.paragraphId, offset: bookmark.offset }, flash: bookmark.id });
      update({ drawer: null });
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setPlace((current) => ({ ...current, flash: null })), BOOKMARK_FLASH_MS);
    },
    [update],
  );
  const { add: addBookmark } = bookmarks;
  const bookmarkAt = useCallback(
    async (spot: { chapterId: string; paragraphId: string; offset: number }) => {
      const added = await addBookmark(spot);
      if (added) setEditAfterAdd(added.id);
    },
    [addBookmark],
  );
  /** The selection's start, else the first line of the chapter in view. */
  const here = useCallback((): { chapterId: string; paragraphId: string; offset: number } | null => {
    const picked = getSelection();
    if (picked && !picked.multi) return { chapterId: picked.chapterId, paragraphId: picked.paragraphId, offset: picked.start };
    const first = paragraphs.paragraphsOf(inViewRef.current)?.[0];
    return first ? { chapterId: first.chapterId, paragraphId: first.id, offset: 0 } : null;
  }, [paragraphs]);
  const list = bookmarks.bookmarks ?? NO_BOOKMARKS;
  const stepFrom = useCallback((): Spot | null => {
    const last = list.find((bookmark) => bookmark.id === place.at);
    if (last) return { chapterId: last.chapterId, paragraph: last.paragraph, offset: last.offset };
    const picked = getSelection();
    const index = (chapterId: string, paragraphId: string) => paragraphs.paragraphsOf(chapterId)?.find((row) => row.id === paragraphId)?.index ?? null;
    if (picked && !picked.multi) return { chapterId: picked.chapterId, paragraph: index(picked.chapterId, picked.paragraphId), offset: picked.start };
    const first = paragraphs.paragraphsOf(inViewRef.current)?.[0];
    // From the top of a chapter, a bookmark further along its first line counts as ahead.
    return first ? { chapterId: first.chapterId, paragraph: first.index, offset: -1 } : null;
  }, [list, place.at, paragraphs]);
  useBookmarkCommands({
    bookmarks: list,
    chapters: named,
    lineText,
    onGoTo: goToBookmark,
    onHere: () => {
      const spot = here();
      if (spot) void bookmarkAt(spot);
    },
    stepFrom,
    onNone: () => overlay.toast('No bookmarks yet.'),
  });
  useBookmarkContextMenu(bookmarks.remove);
  // A bookmark made with B or the menu opens its editor, once its ribbon is drawn.
  useEffect(() => {
    if (!editAfterAdd) return;
    const ribbon = document.querySelector<HTMLElement>(`[data-para] [data-bm="${editAfterAdd}"]`);
    if (!ribbon) return;
    setEditAfterAdd(null);
    ribbon.click();
  }, [editAfterAdd, list]);

  const byParagraph = useMemo(() => {
    const map = new Map<string, Bookmark[]>();
    for (const bookmark of list) {
      if (bookmark.stale) continue;
      map.set(bookmark.paragraphId, [...(map.get(bookmark.paragraphId) ?? []), bookmark]);
    }
    return map;
  }, [list]);
  const sample = useMemo(() => retailSampleRange([...chapters], credits.retailSample), [chapters, credits.retailSample]);
  const gutter = useMemo<GutterState>(
    () => ({
      bookmarksIn: (paragraphId) => byParagraph.get(paragraphId) ?? NO_BOOKMARKS,
      lineText,
      flashId: place.flash,
      sample,
      zoom: 1,
      onUpdate: bookmarks.update,
      onRemove: bookmarks.remove,
    }),
    [byParagraph, lineText, place.flash, sample, bookmarks.update, bookmarks.remove],
  );

  /* ---------- Registrations ---------- */

  const lookUp = useCallback(
    (text: string, picked: ReaderSelection) => {
      const target = lookupTarget(text, entries.entries);
      if (target.tab === 'pron') update({ tab: 'pron', word: target.word });
      else if ('entryId' in target) update({ tab: 'bible', entryId: target.entryId, miss: null, missSel: null });
      else update({ tab: 'bible', entryId: null, miss: target.miss, missSel: picked });
      openRailIfDrawer();
    },
    [entries.entries, update, openRailIfDrawer],
  );
  useScriptRegistry({
    lines,
    kinds: BIBLE_KINDS,
    currentChapterId: () => inViewRef.current,
    selectionAt: () => {
      const picked = getSelection();
      return picked && !picked.multi ? picked : null;
    },
    openFind: (term, index) =>
      update((state) => ({ ...openFind(term)(state), ...(index === undefined ? {} : { find: { ...state.find, open: true, list: true, q: term, i: index } }) })),
    showMark,
    showWord,
    showEntry,
    lookUp,
    copy: (text) => void navigator.clipboard?.writeText(text),
    goToChapter,
    composeMark: (type, picked) => setComposing({ type, selection: picked }),
    bookmarkHere: (picked) => void bookmarkAt({ chapterId: picked.chapterId, paragraphId: picked.paragraphId, offset: picked.start }),
    recordChapter: goToBooth && ((chapterId) => goToBooth({ chapter: chapterId })),
  });

  /* ---------- Find ---------- */

  const [findState] = useScriptView((state) => state.find);
  const matches = useMemo<FindMatch[]>(
    () => (findState.open ? searchManuscript(paragraphs.all, findState.q) : []),
    [findState.open, findState.q, paragraphs.all],
  );
  const find = useFind(matches.length);
  const readerFind = useMemo(
    () => (findState.open ? { matches, current: Math.min(findState.i, matches.length - 1) } : null),
    [findState.open, findState.i, matches],
  );
  const scroller = () => document.querySelector<HTMLElement>('section[aria-label="Reader"] [role="region"]');

  /* ---------- The chapter list's credits rows ---------- */

  // The mock lists the opening credits above chapter 1 and the closing credits after the last chapter, each with its prep dot; here they
  // are the cards the reader draws in the same places (`chapters/creditsRows.ts`).
  const ownsOpening = chapters.some((chapter) => chapter.contentKind === 'opening');
  const { opening: openingRow, closing: closingRow } = useMemo(
    () => creditsRows({ hasOpening: credits.hasOpening, hasClosing: credits.hasClosing, ownsOpening, previews: credits.previews }),
    [credits.hasOpening, credits.hasClosing, credits.previews, ownsOpening],
  );
  const openingCredits = useMemo(() => openingRow && { state: openingRow.state, onJump: () => navigate('/script#credits-opening') }, [openingRow, navigate]);
  const closingCredits = useMemo(() => closingRow && { state: closingRow.state, onJump: () => navigate('/script#credits-closing') }, [closingRow, navigate]);

  /* ---------- The reader's slots ---------- */

  const firstId = chapters[0]!.id;
  const renderChapterCard = useCallback(
    (chapter: ManuscriptChapter) => {
      const at = order.indexOf(chapter.id);
      return (
        <>
          {chapter.id === firstId && (
            <ScriptCredits
              kind="opening"
              credits={credits}
              projectFolder={projectFolder}
              notify={notify}
              fillingIn={fillingIn}
              onFillIn={() => setFillingIn(true)}
              goToBooth={goToBooth}
            />
          )}
          {sample?.chapterIds.has(chapter.id) && (
            <span className="mb-1 inline-flex w-fit items-center rounded-[var(--radius-tag)] border border-[var(--accent)] px-1.5 py-0.5 font-sans text-xs font-semibold text-[var(--accent-strong)]">
              Retail sample
            </span>
          )}
          <ChapterCard
            chapter={chapter}
            previous={at > 0 ? chapters[at - 1] : undefined}
            onRecord={goToBooth && isNarration(chapter) ? (chapterId) => goToBooth({ chapter: chapterId }) : undefined}
          />
        </>
      );
    },
    [order, firstId, chapters, credits, projectFolder, notify, fillingIn, goToBooth, sample],
  );
  const closingCard = (
    <ScriptCredits
      kind="closing"
      credits={credits}
      projectFolder={projectFolder}
      notify={notify}
      fillingIn={fillingIn}
      onFillIn={() => setFillingIn(true)}
      goToBooth={goToBooth}
    />
  );
  const renderGutter = useCallback((paragraph: Parameters<typeof BookmarkGutter>[0]['paragraph']) => <BookmarkGutter paragraph={paragraph} />, []);

  const onPickSpeaker = useCallback((cueId: string, anchor: DOMRect) => setPicking({ cueId, anchor }), []);
  const picker = useMemo(() => {
    if (!picking) return null;
    const cue = speakers.value?.find((row) => row.id === picking.cueId);
    if (!cue) return null;
    const phrase = speakers.phrasesOf({ id: cue.paragraphId, chapterId: cue.chapterId }).find((row) => row.cueId === cue.id);
    if (!phrase) return null;
    return {
      phrase,
      inChapter: speakersInChapter(entries.entries, entries.types, speakers.value ?? [], paragraphs.paragraphsOf(cue.chapterId) ?? [], cue.chapterId),
      everyone: speakerChoices(entries.entries, entries.types),
    };
  }, [picking, speakers, entries.entries, entries.types, paragraphs]);

  const toolbar: ReactNode = (
    <>
      <IconButton action="chapters" label="Chapters" className="min-[1180px]:hidden" aria-expanded={drawer === 'ch'} onClick={() => toggleDrawer('ch')} />
      <IconButton
        action="sidePanel"
        label={RAIL_LABEL}
        className="min-[1281px]:hidden"
        aria-expanded={drawer === 'rail'}
        onClick={() => toggleDrawer('rail')}
      />
      <IconButton action="bookmarks" label="Bookmarks" onClick={showBookmarks} />
      <IconButton action="find" label="Find in the manuscript (Ctrl+F)" onClick={() => update(openFind())} />
      <TextSettingsPopover prefs={prefs} onChange={setPrefs} />
    </>
  );

  /* ---------- The rail ---------- */

  const body = (current: RailTab): ReactNode => {
    switch (current) {
      case 'pron':
        return <WordsTab chapterId={inView} host={wordsHost} selection={missSel ?? undefined} />;
      case 'bible':
        return <BibleTab chapterId={inView} onOpenStoryBible={focusStoryBibleEntity} />;
      case 'marks':
      case 'queries':
        return (
          <ThreadsTab
            kind={current === 'marks' ? 'notes' : 'queries'}
            chapterId={inView}
            lineOf={lineOf}
            onShowInText={(id) => {
              const mark = marks.marks.find((row) => row.id === id);
              if (mark) update({ pendingPid: mark.paragraphId, drawer: null });
            }}
          />
        );
      case 'bookmarks':
        return (
          <BookmarksTab
            bookmarks={list}
            chapters={named}
            lineText={lineText}
            currentId={place.at}
            onGoTo={goToBookmark}
            onUpdate={bookmarks.update}
            onRemove={bookmarks.remove}
          />
        );
    }
  };

  return (
    <GutterContext.Provider value={gutter}>
      {paragraphs.readers}
      <ScriptColumns
        drawer={drawer}
        onClose={() => update({ drawer: null })}
        chapters={
          <ChapterList
            chapters={chapters}
            currentId={inView}
            onJump={goToChapter}
            onClose={layout.narrow ? () => update({ drawer: null }) : undefined}
            openingCredits={openingCredits}
            closingCredits={closingCredits}
          />
        }
        reader={
          // A selection is read when the pointer or a key lets go, as the mock's reader does.
          <div
            id="reader"
            className={`flex h-full min-h-0 flex-col overflow-hidden ${PANEL_FRAME_CLASS}`}
            onMouseUp={() => setSelection(getSelection())}
            onKeyUp={(event) => event.shiftKey && setSelection(getSelection())}
          >
            {/* The mock draws no page title: the reader is the page, so the title is for screen readers only, as the Booth's. */}
            <h1 className="sr-only">Script</h1>
            <FindBar
              find={find.find}
              nonce={find.nonce}
              matches={matches}
              locationOf={lineOf}
              onQuery={find.onQuery}
              onStep={find.onStep}
              onPick={find.onPick}
              onToggleList={find.onToggleList}
              onClose={find.onClose}
              returnFocus={() => scroller()?.focus()}
            />
            <div className="min-h-0 flex-1">
              <Reader
                chapters={chapters}
                paragraphsOf={paragraphs.paragraphsOf}
                onNeedParagraphs={paragraphs.want}
                sources={{ marks: marks.marks, markTypes: marks.types, words: prep.words, entries: entries.entries, cues: speakers.value ?? [] }}
                vars={vars}
                onChapterInView={(chapterId) => update({ spyAt: chapterId })}
                pendingJump={pendingJump}
                pendingPid={pendingPid}
                pendingBm={place.pending}
                onHandled={(request) => {
                  if (request === 'chapter') update({ pendingJump: null });
                  else if (request === 'paragraph') update({ pendingPid: null });
                  else setPlace((current) => ({ ...current, pending: null }));
                }}
                flashParagraphId={place.flash ? (list.find((bookmark) => bookmark.id === place.flash)?.paragraphId ?? null) : null}
                find={readerFind}
                activeMarkId={selectedMark}
                renderGutter={renderGutter}
                renderChapterCard={renderChapterCard}
                after={closingCard}
                toolbar={toolbar}
                onPickSpeaker={onPickSpeaker}
                onShowAnnotation={(id) => {
                  const mark = marks.marks.find((row) => row.id === id);
                  if (mark) showMark(mark, false);
                }}
                onShowEntry={showEntry}
                onTextClick={() => setPlace((current) => (current.at ? { ...current, at: null } : current))}
              />
            </div>
            <KeyHints id="skeys" hints={hints} />
          </div>
        }
        rail={<RailPanel body={body} onClose={() => update({ drawer: null })} />}
      />
      <SelectionTool
        selection={selection}
        onDismiss={() => setSelection(null)}
        onCompose={(type, picked) => setComposing({ type, selection: picked })}
        onDefineMarks={() => setDefiningMarks(true)}
      />
      {composing && <MarkComposer type={composing.type} selection={composing.selection} onClose={() => setComposing(null)} />}
      {definingMarks && <MarksDialog saveMarkTypes={saveMarkTypes} onClose={() => setDefiningMarks(false)} />}
      {picking && picker && (
        <SpeakerLayer anchor={picking.anchor} onClose={() => setPicking(null)}>
          <SpeakerPicker
            phrase={picker.phrase}
            inChapter={picker.inChapter}
            everyone={picker.everyone}
            onChoose={(entryId) => {
              void commands.confirmSpeaker(picking.cueId, entryId);
              setPicking(null);
            }}
            onClose={() => setPicking(null)}
          />
        </SpeakerLayer>
      )}
      {fillingIn && credits.setup && (
        <CreditsSetupDialog
          state={credits.setup}
          notify={notify}
          onDone={(next) => {
            credits.setSetup(next);
            setFillingIn(false);
          }}
          onMoreFields={() => navigate('/settings#credits')}
        />
      )}
    </GutterContext.Provider>
  );
}
