import { LoadError } from '../layout/LoadError';
import { describeApiError } from '../../api/errorMessage';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import type { GuideEntity, GuideType } from '../../types';
import { CommandScope } from '../../input/router';
import { usePageCommands } from '../../input/pageCommands';
import { useApi } from '../../api/ApiContext';
import { Button } from '../primitives/Button';
import { Heading } from '../primitives/Heading';
import { Panel } from '../primitives/Panel';
import { NeedManuscript } from '../layout/NeedManuscript';
import { PANEL_FRAME_CLASS } from '../primitives/panelStyles';
import { chapterCount, entryFlagged, reviewCount } from './entryList';
import {
  DEFAULT_KINDS,
  chooseSort,
  filterCount,
  filterEntries,
  hasPronunciation,
  kindCounts,
  loadEntrySort,
  pickSort,
  saveEntrySort,
  searchWords,
  sortRows,
  type ColumnKey,
  type EntrySort,
} from './entryTable';
import { evidenceLinks } from './evidenceLinks';
import { usePreviewAudio } from './usePreviewAudio';
import { ActionsMenu } from './ActionsMenu';
import { EntryTable, type EntryTableHandle } from './EntryTable';
import { SortMenu } from './SortMenu';
import { FilterChips, FilterMenu, NO_FILTER, type FilterChoice, type FilterCounts } from './FilterMenu';
import { ScanStatus } from './suggested/panel/ScanStatus';
import { useSuggestions } from './suggested/panel/useSuggestions';
import { openImportDialog } from './suggested/import/openImportDialog';
import { AcceptedClaims } from './suggested/row/AcceptedClaims';
import { SuggestionList } from './suggested/row/SuggestionList';
import { reviewable, summaryOf, unattached, verifyCount, verifyOf } from './suggested/row/selectors';
import { useStartScan } from './suggested/scan/useStartScan';
import { GuideDetail, type EntryCommand } from './GuideDetail';
import { ReadNotice } from './ReadNotice';
import { useContextProvider, type ContextProvider } from '../../registries/context';
import { addressPath, readAddress } from '../../navigation/address';
import { SamplePlayerAnnouncement } from '../voicesamples/SamplePlayButton';
import { useSamplePlayer } from '../voicesamples/useSamplePlayer';
import { VoiceDataPanel } from './VoiceDataPanel';
import { Icon } from '../primitives/Icon';
import { SearchField } from '../primitives/SearchField';
import type { Notify } from '../primitives/Toast';
import { useJustChanged } from '../primitives/changeHighlight';
import { GuideDetailSkeleton, GuideListSkeleton } from './GuideSkeleton';

// A brand-new entity has no backend record at all until a category is chosen
// (see GuideDetail's isNewDraft handling) - this is a purely local stand-in
// for the form to render against, never sent anywhere.
const emptyGuideEntity = (name: string): GuideEntity => ({
  id: '',
  canonical_name: name,
  aliases: [],
  category: 'Draft',
  occurrences: [],
  occurrence_count: 0,
  pronunciation: { ipa: '', source: '', confidence: '' },
  description: { text: '', evidence: {} },
  personality_notes: [],
  relationships: [],
  properties: [],
  locked: false,
  review_state: 'reviewed',
});

type GuideProps = {
  notify: Notify;
  goToManuscript: (chapter: string, paragraph: number) => void;
  /** False until a manuscript is imported: the page asks for one instead of reading the Story Bible (the mock's `NeedManuscript`). */
  hasManuscript?: boolean;
  /** Opens the import flow, from the ask for a manuscript. */
  onImport?: () => void;
  /** The ask for a manuscript when the page draws it itself (with the import in place); else `onImport` goes to the import. */
  needManuscript?: ReactNode;
};

export function Guide({ hasManuscript = true, onImport, needManuscript, ...rest }: GuideProps) {
  return hasManuscript ? <GuideLoaded {...rest} /> : (needManuscript ?? <NeedManuscript title="Story Bible" onImport={onImport} />);
}

function GuideLoaded({ notify, goToManuscript }: Pick<GuideProps, 'notify' | 'goToManuscript'>) {
  const api = useApi();
  const location = useLocation();
  const routerNavigate = useNavigate();
  // The entry a hand-off asked for (`#<entity id>`), read by the typed address module. A malformed address is the route gate's to show;
  // here it asks for nothing.
  const asked = useMemo(() => readAddress('story-bible', { search: location.search, hash: location.hash }), [location.search, location.hash]);
  const entityId = asked.kind === 'address' && asked.address.page === 'story-bible' ? asked.address.entity : undefined;
  // An entry the address named that the list does not have: said with a way out instead of opening a different entry unannounced.
  const [unknownEntity, setUnknownEntity] = useState<string>();
  const [rows, setRows] = useState<GuideEntity[]>([]);
  // The first load failing leaves the page with nothing to show, so it gets an inline error and Retry; a later reload failing
  // keeps the rows on screen and is a toast, as before.
  const [loadError, setLoadError] = useState<string>();
  const loadedOnce = useRef(false);
  // False until the entries have been read once, so "No entries match" is told apart from "still reading".
  const [entriesRead, setEntriesRead] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState('');
  // What the Filter menu keeps (SNB-D3): kinds (several at once), Pronunciation and Show. The search text is `query`.
  const [filter, setFilter] = useState<FilterChoice>(NO_FILTER);
  // The host's list of types: the Filter menu's kinds, and the colour each row is drawn in (SN-B95). Until it is read the menu has no kinds.
  const [types, setTypes] = useState<GuideType[]>([]);
  const detailRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<EntryTableHandle>(null);
  const [voiceDataOpen, setVoiceDataOpen] = useState(false);
  // The page's one voice-sample player: every entry's Voice samples section and the Voice data panel share it, so only one sample plays.
  const samplePlayer = useSamplePlayer();
  const [sort, setSort] = useState<EntrySort>(loadEntrySort);
  // The suggestions the host lists (SN-X42): an entry with one still to verify needs review, and cannot be marked reviewed (SNB-3b).
  const found = useSuggestions();
  const { suggestions } = found;
  // A suggestion with no entry yet, chosen from the loose rows above the entries: the detail shows its row instead of an entry.
  const [looseId, setLooseId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ManuscriptChapter[]>([]);
  // A read of the chapters or the types that failed: said in the list panel with Retry, never dropped (the page works on without them).
  const [chaptersFailed, setChaptersFailed] = useState(false);
  const [typesFailed, setTypesFailed] = useState(false);
  const [readNonce, setReadNonce] = useState(0);
  const [pendingNewEntity, setPendingNewEntity] = useState<{ name: string }>();
  // Memoized so the object identity only changes when a draft opens/closes,
  // not on every Guide re-render - GuideDetail resets its local form state
  // whenever the `entity` prop identity changes, so a fresh object per
  // render would silently discard whatever the user just typed.
  const newEntityDraft = useMemo(() => (pendingNewEntity ? emptyGuideEntity(pendingNewEntity.name) : undefined), [pendingNewEntity]);

  const load = useCallback(
    async (selectId?: string) => {
      try {
        const next = await api.guideEntities();
        loadedOnce.current = true;
        setEntriesRead(true);
        setLoadError(undefined);
        setRows(next);
        // Only a load that was asked for an entry decides this: the reload that follows the hash being dropped must not clear it.
        if (selectId !== undefined) setUnknownEntity(next.some((row) => row.id === selectId) ? undefined : selectId);
        setSelectedId((current) => (next.find((row) => row.id === (selectId ?? current)) || next.find((row) => row.category !== 'Draft'))?.id);
      } catch (error) {
        if (loadedOnce.current) notify(describeApiError(error), 'error');
        else setLoadError(describeApiError(error));
      }
    },
    [api, notify],
  );
  useEffect(() => {
    void load(entityId);
    if (entityId) routerNavigate('/story-bible', { replace: true });
  }, [entityId, load, routerNavigate]);
  // The chapters, for Appears in and for where a suggestion's quote is; without them those sections stay empty and the list panel says so.
  useEffect(() => {
    let live = true;
    api.manuscriptChapters().then(
      (list) => {
        if (!live) return;
        setChapters(list);
        setChaptersFailed(false);
      },
      () => live && setChaptersFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, readNonce]);
  useEffect(() => {
    let live = true;
    api.guideTypes().then(
      (list) => {
        if (!live) return;
        setTypes(list);
        setTypesFailed(false);
      },
      () => live && setTypesFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, readNonce]);
  // A decision changes the list here at once, and an accepted suggestion can change an entry, so the entries are read again.
  const { changed } = found;
  // The entry a decision (or its Undo) changed is highlighted once in the list (changeHighlight.ts).
  const { changed: justChanged, mark: markChanged } = useJustChanged();
  const decided = useCallback(
    (decision: Parameters<typeof changed>[0]) => {
      changed(decision);
      const [entryId] = decision.entryIds;
      if (entryId) markChanged(entryId);
      void load();
    },
    [changed, load, markChanged],
  );
  const scanStart = useStartScan({ scan: found.scan.start, onImported: () => void load() });
  const links = useMemo(() => evidenceLinks(chapters, goToManuscript), [chapters, goToManuscript]);
  // Each chapter's place in the book, for the Sort menu's Book order.
  const chapterOrder = useMemo(() => new Map(chapters.map((chapter, place) => [chapter.id, place])), [chapters]);
  // A build that ends while the narrator is elsewhere on this page still refreshes the entries.
  useEffect(() => api.subscribeJobEnded((event) => event.kind === 'story_bible' && void load()), [api, load]);

  // A Draft entry (a brand new, not-yet-categorized entity) is hidden from
  // every tab/search except while it's the one open in the detail pane - it
  // isn't a "real" browsable entry until it has a category.
  const visible = rows.filter((row) => row.category !== 'Draft' || row.id === selectedId);
  const toReview = reviewCount(visible, suggestions);
  const kinds = useMemo(() => types.map((type) => type.name), [types]);
  // A kind the narrator renamed or removed in Settings leaves the filter with it, so the list never keeps a kind nobody can untick.
  const chosen: FilterChoice = { ...filter, kinds: filter.kinds.filter((name) => kinds.includes(name)) };
  const verifyOnly = chosen.show === 'verify';
  const tableKinds = kinds.length > 0 ? kinds : DEFAULT_KINDS;
  const filters = { ...chosen, query, suggestions };
  const filtered = filterEntries(visible, filters);
  const sorted = sortRows(filtered, sort, { kinds: tableKinds, suggestions, chapterOrder });
  const counts = kindCounts(visible);
  const selected = rows.find((row) => row.id === selectedId);
  const toVerifyAll = verifyCount(suggestions);
  const loose = verifyOnly ? unattached(suggestions) : [];
  const looseChosen = loose.find((suggestion) => suggestion.id === looseId);
  const openHidden = selected !== undefined && !pendingNewEntity && !looseChosen && !sorted.some((row) => row.id === selected.id);
  const filtering = query.trim() !== '' || filterCount(filters) > 0;
  const clearFilters = () => {
    setQuery('');
    setFilter(NO_FILTER);
  };
  const filterCounts: FilterCounts = {
    kinds: counts,
    all: visible.length,
    withPron: visible.filter(hasPronunciation).length,
    toReview,
    toVerify: toVerifyAll,
  };
  const keepSort = (next: EntrySort) => {
    setSort(next);
    saveEntrySort(next);
  };
  const chooseColumn = (column: ColumnKey) => keepSort(chooseSort(sort, column));

  // No backend record is created here - see GuideDetail's isNewDraft prop.
  // Navigating away or picking a different row just discards this, matching
  // a "doesn't exist until saved" model instead of create-then-delete.
  const addEntity = () => {
    const base = 'New entity';
    const taken = (text: string) => rows.some((row) => row.canonical_name.toLowerCase() === text.toLowerCase());
    // The first number nobody has used, not one past the row count (which skipped numbers once entries had been deleted).
    let next = 2;
    while (taken(`${base} ${next}`)) next += 1;
    const name = taken(base) ? `${base} ${next}` : base;
    setPendingNewEntity({ name });
  };
  const selectRow = (id?: string) => {
    setPendingNewEntity(undefined);
    setLooseId(null);
    setSelectedId(id);
  };
  // The list's Hear: the host's preview of an entry's name, as the entry's own play button plays it. One plays at a time; a voice that
  // is not installed opens the entry, whose own play asks again and shows the install prompt.
  const hearTarget = useRef<string>(undefined);
  const [heardId, setHeardId] = useState<string>();
  const listPreview = usePreviewAudio({
    resetKey: undefined,
    requestPreview: () => api.guidePreview(hearTarget.current!),
    onAssetRequired: () => {
      const id = hearTarget.current!;
      selectRow(id);
      setCommand({ id, kind: 'hear', nonce: Math.random() });
    },
    notify,
  });
  const hear = (id: string) => {
    if (hearTarget.current !== id) listPreview.stopPreview();
    hearTarget.current = id;
    setHeardId(id);
    void listPreview.playPreview();
  };

  // The right-click menu of an entry row (the mock's registerContext for the Bible page): Open, Find in the manuscript, Mark reviewed and
  // Delete entry. The last two go to the open entry, which does what its own buttons do (its pending and its Undo included).
  const [command, setCommand] = useState<EntryCommand>();
  const live = useRef({
    rows,
    suggestions,
    selectRow,
    find: (name: string) => routerNavigate(addressPath({ page: 'script', find: name })),
    ask: (id: string, kind: EntryCommand['kind']) => {
      selectRow(id);
      setCommand({ id, kind, nonce: Math.random() });
    },
  });
  live.current = {
    rows,
    suggestions,
    selectRow,
    find: (name) => routerNavigate(addressPath({ page: 'script', find: name })),
    ask: (id, kind) => {
      selectRow(id);
      setCommand({ id, kind, nonce: Math.random() });
    },
  };
  const entryMenu = useMemo<ContextProvider>(() => {
    const rowOf = (target: Element) => live.current.rows.find((row) => row.id === target.closest<HTMLElement>('[data-entry-id]')?.dataset.entryId);
    return {
      match: (target) => rowOf(target) !== undefined,
      items: (target) => {
        const row = rowOf(target)!;
        const { suggestions: found, selectRow: open, find, ask } = live.current;
        const flagged = entryFlagged(row);
        return [
          { key: 'entry-open', label: 'Open', onSelect: () => open(row.id) },
          { key: 'entry-find', label: 'Find in the manuscript', onSelect: () => find(row.canonical_name) },
          ...(flagged
            ? [
                {
                  key: 'entry-reviewed',
                  label: 'Mark reviewed',
                  unavailable: verifyOf(found, row.id) > 0 ? 'Verify or reject its suggestions first.' : undefined,
                  onSelect: () => ask(row.id, 'review'),
                },
              ]
            : []),
          {
            key: 'entry-delete',
            label: 'Delete entry',
            unavailable: row.locked ? 'A locked entry cannot be deleted. Unlock it first.' : undefined,
            onSelect: () => ask(row.id, 'delete'),
          },
        ];
      },
    };
  }, []);
  useContextProvider(entryMenu);

  // Ctrl+F (the page-scoped jump menu) lists the entries, found by any of their names. Choosing one opens it, and clears a search or filter
  // that would hide its row, so the list shows what is open.
  usePageCommands({ id: 'story-bible', label: 'Story Bible' }, () =>
    visible
      .filter((row) => row.category !== 'Draft')
      .map((row) => ({
        id: `entry.${row.id}`,
        label: row.canonical_name,
        group: 'Entries',
        hint: row.category,
        keywords: row.aliases.map((alias) => alias.text),
        icon: 'locate' as const,
        run: () => {
          if (!filtered.some((shown) => shown.id === row.id)) clearFilters();
          selectRow(row.id);
        },
      })),
  );

  if (loadError) return <LoadError title="Story Bible" message={loadError} retry={() => void load(entityId)} />;

  const scanWithStart = { ...found.scan, start: scanStart.startScan };
  const empty =
    visible.length === 0 ? (
      'No entries yet. Add one, or scan the manuscript from More actions.'
    ) : (
      <>
        <span>No entries match.</span>{' '}
        {filtering && (
          <Button variant="link" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </>
    );

  return (
    <CommandScope kind="page">
      <div className="flex h-full flex-col gap-4 overflow-hidden max-lg:h-auto max-lg:overflow-visible">
        <div className="flex flex-none items-center justify-between gap-2">
          <Heading title="Story Bible" />
          <div className="flex items-center gap-2">
            <Button onClick={addEntity}>
              <Icon name="add" /> Add entry
            </Button>
            <ActionsMenu scan={scanWithStart} onImport={() => openImportDialog({ onChanged: () => void load() })} onVoiceData={() => setVoiceDataOpen(true)} />
          </div>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 max-lg:h-auto lg:grid-cols-[minmax(16rem,30%)_minmax(0,1fr)] [&>*]:max-lg:min-h-96">
          <section aria-label="Entries" className={`${PANEL_FRAME_CLASS} @container flex min-h-0 flex-col overflow-hidden max-lg:max-h-[20rem]`}>
            <div className="flex flex-col gap-2 border-b border-[var(--border)] p-4">
              <div className="flex items-center gap-2">
                <SearchField
                  label="Search entries"
                  value={query}
                  onChange={setQuery}
                  placeholder={`Search ${visible.length} entries`}
                  onKeyDown={(event) => {
                    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      tableRef.current?.focusFirst();
                    } else if (event.key === 'Escape') {
                      // The first Esc clears the box, the next leaves it; neither reaches the page's own Esc.
                      event.preventDefault();
                      event.stopPropagation();
                      if (query) setQuery('');
                      else event.currentTarget.blur();
                    }
                  }}
                />
                <FilterMenu types={types} counts={filterCounts} value={chosen} onChange={setFilter} />
                <SortMenu sort={sort} onPick={(column) => keepSort(pickSort(sort, column))} />
              </div>
              <FilterChips value={chosen} onChange={setFilter} />
              {/* The open entry is not among the rows the search and filters leave: say so, so the entry beside the list does not look
                  like one of them (R3SB1-2, R3SB2-12). */}
              {openHidden && (
                <p role="status" className="m-0 text-xs text-[var(--text-muted)]">
                  {selected.canonical_name} is open but not in this list.
                </p>
              )}
              {/* Under the filters, so a scan starting or ending moves the table, never the buttons and chips the pointer is on. */}
              <ScanStatus scan={scanWithStart} />
            </div>
            {unknownEntity !== undefined && (
              <div role="alert" aria-label="Link not opened" className="mx-4 mt-2 flex flex-col gap-2 rounded border border-[var(--border)] p-3 text-sm">
                <p className="m-0">This link points to an entry that is not in the Story Bible. It may have been deleted or merged since the link was made.</p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setUnknownEntity(undefined)}>Dismiss</Button>
                  <Button onClick={() => routerNavigate('/', { replace: true })}>Go to Production</Button>
                </div>
              </div>
            )}
            {(typesFailed || chaptersFailed) && (
              <div className="flex flex-col gap-1 px-4 pt-2">
                {typesFailed && (
                  <ReadNotice
                    what="the entry types"
                    effect="The Filter menu has no kinds to choose and every entry is drawn in one colour."
                    checkAgain={() => setReadNonce((n) => n + 1)}
                  />
                )}
                {chaptersFailed && (
                  <ReadNotice
                    what="the chapters"
                    effect="Appears in is empty and a quote cannot open its line."
                    checkAgain={() => setReadNonce((n) => n + 1)}
                  />
                )}
              </div>
            )}
            {entriesRead ? (
              <EntryTable
                rows={sorted}
                loose={loose}
                types={types}
                sort={sort}
                onSort={chooseColumn}
                openId={pendingNewEntity || looseChosen ? undefined : selectedId}
                looseId={looseChosen?.id ?? null}
                changedId={justChanged}
                onOpen={(id) => {
                  selectRow(id);
                  // Below the two-pane width the entry opens under the table: bring it into view so the press visibly does something.
                  if (window.matchMedia?.('(max-width: 1023px)').matches) detailRef.current?.scrollIntoView?.({ block: 'start' });
                }}
                onOpenLoose={setLooseId}
                empty={empty}
                words={searchWords(query)}
                handle={tableRef}
                onHear={hear}
                playingId={listPreview.playingPreview ? heardId : undefined}
                loadingId={listPreview.loadingPreview ? heardId : undefined}
              />
            ) : (
              <div className="min-h-0 flex-1 overflow-hidden">
                <GuideListSkeleton />
              </div>
            )}
          </section>
          <div ref={detailRef} className="flex min-h-0 min-w-0">
            {!entriesRead ? (
              <GuideDetailSkeleton />
            ) : looseChosen ? (
              <Panel title={summaryOf(looseChosen.payload)} scroll className="min-h-0 flex-1">
                <SuggestionList title="Suggested" suggestions={[looseChosen]} sources={found.sources} onChanged={decided} {...links} />
              </Panel>
            ) : (
              <GuideDetail
                // One detail per entry, so what an action left pending on one entry never shows on the next.
                key={newEntityDraft ? 'new-draft' : (selected?.id ?? 'none')}
                entity={newEntityDraft ?? selected}
                isNewDraft={Boolean(newEntityDraft)}
                command={command}
                onCommandTaken={() => setCommand(undefined)}
                onDiscardNewDraft={() => setPendingNewEntity(undefined)}
                onCreatedNewDraft={(id) => {
                  setPendingNewEntity(undefined);
                  void load(id);
                }}
                entities={rows}
                reload={load}
                notify={notify}
                goToManuscript={goToManuscript}
                samplePlayer={samplePlayer}
                toVerify={selected ? verifyOf(suggestions, selected.id) : 0}
                chapters={chapters}
                suggested={
                  selected && (
                    <>
                      <AcceptedClaims entryId={selected.id} suggestions={suggestions} {...links} />
                      <SuggestionList
                        title="Suggested"
                        suggestions={reviewable(suggestions, selected.id)}
                        sources={found.sources}
                        onChanged={decided}
                        contextOf={() => ({ entryName: selected.canonical_name, chapters: chapterCount(selected) })}
                        {...links}
                      />
                    </>
                  )
                }
              />
            )}
          </div>
        </div>
        {scanStart.dialogs}
        <VoiceDataPanel open={voiceDataOpen} onClose={() => setVoiceDataOpen(false)} notify={notify} entities={rows} types={types} player={samplePlayer} />
        <SamplePlayerAnnouncement text={samplePlayer.announcement} />
      </div>
    </CommandScope>
  );
}
