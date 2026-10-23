import { LoadError } from '../layout/LoadError';
import { statusTone } from '../../kinds/statusTone';
import { describeApiError } from '../../api/errorMessage';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faMicrophone, faPlus } from '@fortawesome/free-solid-svg-icons';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import type { GuideEntity, GuideType } from '../../types';
import { categoryLabel } from '../../state';
import { CommandScope } from '../../input/router';
import { useCommand } from '../../input/useCommand';
import { useApi } from '../../api/ApiContext';
import { Button } from '../primitives/Button';
import { Heading } from '../primitives/Heading';
import { Panel } from '../primitives/Panel';
import { NeedManuscript } from '../layout/NeedManuscript';
import { PANEL_FRAME_CLASS } from '../primitives/panelStyles';
import { TooltipTarget } from '../primitives/Tooltip';
import { StatusBadge } from '../primitives/StatusBadge';
import { Swatch } from '../primitives/Swatch';
import {
  nameCount,
  typeUnknown,
  chapterCount,
  ENTRY_SORT_OPTIONS,
  entryFlagged,
  entryNeedsReview,
  kindSwatch,
  loadEntrySort,
  matchesQuery,
  reviewCount,
  reviewPill,
  saveEntrySort,
  sortEntries,
  type EntrySortKey,
} from './entryList';
import { evidenceLinks } from './evidenceLinks';
import { ImportButton } from './suggested/panel/ImportButton';
import { LooseSuggestionRows } from './suggested/panel/LooseSuggestionRows';
import { FilterChip } from './FilterChip';
import { NeedsVerificationChip } from './suggested/panel/NeedsVerificationChip';
import { ScanButton, ScanStatus } from './suggested/panel/ScanButton';
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
import { SeriesTab } from '../series/SeriesTab';
import { IconButton } from '../primitives/IconButton';
import { SearchField } from '../primitives/SearchField';
import { Select } from '../primitives/Select';
import { Tab, TabList, TabPanel, Tabs } from '../primitives/Tabs';
import type { Notify } from '../primitives/Toast';
import { CHANGE_HIGHLIGHT_CLASSES, useJustChanged } from '../primitives/changeHighlight';
import { GuideDetailSkeleton, GuideListSkeleton } from './GuideSkeleton';

const ENTRIES_TAB = 'Entries';
const SERIES_TAB = 'Series';

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
  const [tab, setTab] = useState(ENTRIES_TAB);
  const [kind, setKind] = useState('All');
  // The host's list of types: the chips, and the colour each chip and row is drawn in (SN-B95). Until it is read there is only "All".
  const [types, setTypes] = useState<GuideType[]>([]);
  const [focusedId, setFocusedId] = useState<string>();
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const detailRef = useRef<HTMLDivElement>(null);
  const [voiceDataOpen, setVoiceDataOpen] = useState(false);
  // The page's one voice-sample player: every entry's Voice samples section and the Voice data panel share it, so only one sample plays.
  const samplePlayer = useSamplePlayer();
  const [sort, setSort] = useState<EntrySortKey>(loadEntrySort);
  // The suggestions the host lists (SN-X42): an entry with one still to verify needs review, and cannot be marked reviewed (SNB-3b).
  const found = useSuggestions();
  const { suggestions } = found;
  const [reviewOnly, setReviewOnly] = useState(false);
  const [verifyOnly, setVerifyOnly] = useState(false);
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
  // A build that ends while the narrator is elsewhere on this page still refreshes the entries.
  useEffect(() => api.subscribeJobEnded((event) => event.kind === 'story_bible' && void load()), [api, load]);

  // A Draft entry (a brand new, not-yet-categorized entity) is hidden from
  // every tab/search except while it's the one open in the detail pane - it
  // isn't a "real" browsable entry until it has a category.
  const visible = rows.filter((row) => row.category !== 'Draft' || row.id === selectedId);
  const toReview = reviewCount(visible, suggestions);
  const kinds = useMemo(() => types.map((type) => type.name), [types]);
  // A kind the narrator renamed or removed in Settings leaves its chip with it, so the list falls back to every entry.
  const activeKind = kinds.includes(kind) ? kind : 'All';
  const filtered = visible
    .filter((row) => activeKind === 'All' || row.category === activeKind)
    .filter((row) => !reviewOnly || entryNeedsReview(row, suggestions))
    .filter((row) => !verifyOnly || verifyOf(suggestions, row.id) > 0)
    .filter((row) => matchesQuery(row, query));
  const sorted = sortEntries(filtered, sort, kinds.length > 0 ? kinds : undefined);
  const selected = rows.find((row) => row.id === selectedId);
  const toVerifyAll = verifyCount(suggestions);
  const loose = verifyOnly ? unattached(suggestions) : [];
  const looseChosen = loose.find((suggestion) => suggestion.id === looseId);
  const chooseSort = (key: string) => {
    const next = ENTRY_SORT_OPTIONS.find((option) => option.value === key)?.value ?? 'name';
    setSort(next);
    saveEntrySort(next);
  };

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

  // Up and Down step focus through the entries. The router leaves a key to a focused button (targets.ts), so the list takes it itself while a row
  // has focus (`onKeyDown` below); the catalogue's page-scope rows, rebindable and listed on the sheet, step from the entry open when focus is elsewhere.
  const moveFocus = (delta: -1 | 1) => {
    const active = sorted.findIndex((row) => rowButtons.current.get(row.id) === document.activeElement);
    const open = sorted.findIndex((row) => row.id === selectedId);
    const from = active >= 0 ? active : open;
    const next = sorted[from < 0 ? 0 : Math.min(sorted.length - 1, Math.max(0, from + delta))];
    if (next) rowButtons.current.get(next.id)?.focus();
  };
  useCommand('storybible.entry.next', () => moveFocus(1));
  useCommand('storybible.entry.prev', () => moveFocus(-1));
  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const edge = event.key === 'Home' ? sorted[0] : sorted[sorted.length - 1];
      if (edge) rowButtons.current.get(edge.id)?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    moveFocus(event.key === 'ArrowDown' ? 1 : -1);
  };
  // The list has one tab stop: the entry focus last rested on, else the one open, else the first.
  const stopId = sorted.find((row) => row.id === focusedId)?.id ?? sorted.find((row) => row.id === selectedId)?.id ?? sorted[0]?.id;

  if (loadError) return <LoadError title="Story Bible" message={loadError} retry={() => void load(entityId)} />;

  // The Series view is a tab here, not a navigation entry of its own; the kinds are chips over the list.
  const viewTabs = (
    <TabList label="Story Bible views" activation="automatic">
      <Tab value={ENTRIES_TAB}>{ENTRIES_TAB}</Tab>
      <Tab value={SERIES_TAB}>{SERIES_TAB}</Tab>
    </TabList>
  );
  const scanWithStart = { ...found.scan, start: scanStart.startScan };
  const actions = (
    <div className="flex items-center gap-2">
      <ScanButton scan={scanWithStart} />
      <ImportButton onImport={() => openImportDialog({ onChanged: () => void load() })} />
      <TooltipTarget text="Add entity">
        <IconButton label="Add entity" onClick={addEntity}>
          <FontAwesomeIcon icon={faPlus} />
        </IconButton>
      </TooltipTarget>
    </div>
  );

  return (
    <CommandScope kind="page">
      <Tabs
        value={tab}
        onChange={setTab}
        className="flex h-full flex-col gap-4 overflow-hidden max-md:h-auto [@media(max-width:1023px)_and_(max-height:899px)]:h-auto [@media(max-width:1023px)_and_(max-height:899px)]:overflow-visible"
      >
        {tab === SERIES_TAB && (
          <div className="flex-none space-y-4">
            <Heading title="Story Bible" />
            {viewTabs}
          </div>
        )}
        {tab === SERIES_TAB ? (
          <Panel label="Series" flush className="min-h-0 flex-1 overflow-hidden">
            <SeriesTab notify={notify} />
          </Panel>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 max-md:h-auto lg:grid-cols-[20rem_minmax(0,1fr)] [&>*]:max-md:min-h-96 [@media(max-width:1023px)_and_(max-height:899px)]:h-auto [&>*]:[@media(max-width:1023px)_and_(max-height:899px)]:min-h-96">
            <TabPanel value={tab} className={`${PANEL_FRAME_CLASS} flex min-h-0 flex-col overflow-hidden`}>
              <div className="flex items-center justify-between gap-2 px-4 pt-3">
                <Heading title="Story Bible" />
                {actions}
              </div>
              <div className="px-4 pt-2">{viewTabs}</div>
              <div className="flex flex-col gap-2 border-b border-[var(--border)] p-4">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <SearchField label="Search entries" value={query} onChange={setQuery} placeholder="Find an entry" />
                  </div>
                  <Select label="Sort entries" value={sort} onChange={chooseSort} options={ENTRY_SORT_OPTIONS} className="w-auto min-w-[7.5rem] flex-none" />
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Kind">
                  <FilterChip label="All" on={activeKind === 'All'} onPress={() => setKind('All')} />
                  {types.map((type) => (
                    <FilterChip
                      key={type.name}
                      label={type.name}
                      swatch={kindSwatch(types, type.name)}
                      on={activeKind === type.name}
                      onPress={() => setKind(type.name)}
                    />
                  ))}
                </div>
                {(toReview > 0 || reviewOnly || toVerifyAll > 0 || verifyOnly) && (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Filter entries">
                    {(toReview > 0 || reviewOnly) && (
                      <FilterChip label={`Needs review · ${toReview}`} on={reviewOnly} onPress={() => setReviewOnly((on) => !on)} />
                    )}
                    <NeedsVerificationChip count={toVerifyAll} on={verifyOnly} onToggle={setVerifyOnly} />
                  </div>
                )}
                {/* Under the filters, so a scan starting or ending moves the list, never the buttons and chips the pointer is on. */}
                <ScanStatus scan={scanWithStart} />
              </div>
              {unknownEntity !== undefined && (
                <div role="alert" aria-label="Link not opened" className="mx-4 mb-2 flex flex-col gap-2 rounded border border-[var(--border)] p-3 text-sm">
                  <p className="m-0">
                    This link points to an entry that is not in the Story Bible. It may have been deleted or merged since the link was made.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setUnknownEntity(undefined)}>Dismiss</Button>
                    <Button onClick={() => routerNavigate('/', { replace: true })}>Go to Production</Button>
                  </div>
                </div>
              )}
              {(typesFailed || chaptersFailed) && (
                <div className="flex flex-col gap-1 px-4 pb-2">
                  {typesFailed && (
                    <ReadNotice
                      what="the entry types"
                      effect="The kind chips are hidden and every entry is drawn in one colour."
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
              <div className="guide-list-scroll min-h-0 overflow-y-auto p-2">
                {!entriesRead && <GuideListSkeleton />}
                {entriesRead && loose.length > 0 && (
                  <ul aria-label="Suggestions not in the Story Bible yet" className="m-0 mb-2 list-none p-0">
                    <LooseSuggestionRows suggestions={loose} selectedId={looseChosen?.id ?? null} onSelect={setLooseId} />
                  </ul>
                )}
                {entriesRead && (
                  <ul onKeyDown={onListKeyDown} aria-label="Story Bible entries" className="m-0 flex list-none flex-col gap-0.5 p-0">
                    {sorted.map((row) => {
                      const open = !pendingNewEntity && selectedId === row.id;
                      const pill = reviewPill(row, suggestions);
                      return (
                        <li key={row.id}>
                          {/* native-control-ok: a roving-focus list row of two lines (name and pill, swatch and counts) that Button's padded chrome does not fit */}
                          <button
                            type="button"
                            ref={(node) => {
                              if (node) rowButtons.current.set(row.id, node);
                              else rowButtons.current.delete(row.id);
                            }}
                            data-entry-id={row.id}
                            data-just-changed={justChanged === row.id ? '' : undefined}
                            tabIndex={row.id === stopId ? 0 : -1}
                            aria-current={open || undefined}
                            onFocus={() => setFocusedId(row.id)}
                            onClick={() => {
                              selectRow(row.id);
                              // Below the two-column width the entry opens under the list: bring it into view so the click visibly does something.
                              if (window.matchMedia?.('(max-width: 1023px) and (max-height: 899px)').matches)
                                detailRef.current?.scrollIntoView?.({ block: 'start' });
                            }}
                            className={`flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left ${open ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'text-[var(--text)] hover:bg-[var(--surface-2)]'} ${justChanged === row.id ? CHANGE_HIGHLIGHT_CLASSES : ''}`}
                          >
                            <span data-line="name" className="flex w-full min-w-0 items-center gap-2 text-[0.9375rem] font-bold">
                              <span className="truncate">{row.canonical_name}</span>
                              {row.locked && <FontAwesomeIcon icon={faLock} className="text-[10px]" style={{ color: 'var(--non-text)' }} />}
                              {pill && <StatusBadge tone={statusTone('needs_review')} label={pill} className="ml-auto shrink-0 whitespace-nowrap" />}
                            </span>
                            <span data-line="kind" className="flex items-center gap-1.5 text-sm font-normal" style={{ color: 'var(--text-muted)' }}>
                              <Swatch colour={kindSwatch(types, row.category)} />
                              <span>
                                {row.category === 'Draft' ? categoryLabel(row.category) : typeUnknown(row) ? 'Type not set' : row.category}
                                {row.category !== 'Draft' &&
                                  ` · ${nameCount(row)} ${nameCount(row) === 1 ? 'name' : 'names'} · ${chapterCount(row)} ${chapterCount(row) === 1 ? 'chapter' : 'chapters'}`}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {sorted.length === 0 && (
                      <li className="p-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                        No entries match.
                      </li>
                    )}
                  </ul>
                )}
              </div>
              <div className="flex-none border-t border-[var(--border)] px-4 py-2">
                <Button variant="secondary" onClick={() => setVoiceDataOpen(true)}>
                  <FontAwesomeIcon icon={faMicrophone} /> Voice data
                </Button>
              </div>
            </TabPanel>
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
        )}
        {scanStart.dialogs}
        <VoiceDataPanel open={voiceDataOpen} onClose={() => setVoiceDataOpen(false)} notify={notify} entities={rows} types={types} player={samplePlayer} />
        <SamplePlayerAnnouncement text={samplePlayer.announcement} />
      </Tabs>
    </CommandScope>
  );
}
