import { LoadError } from '../layout/LoadError';
import { describeApiError } from '../../api/errorMessage';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import type { GuideEntity, GuideType } from '../../types';
import { CommandScope } from '../../input/router';
import { useApi } from '../../api/ApiContext';
import { Button } from '../primitives/Button';
import { Heading } from '../primitives/Heading';
import { Panel } from '../primitives/Panel';
import { NeedManuscript } from '../layout/NeedManuscript';
import { PANEL_FRAME_CLASS } from '../primitives/panelStyles';
import { chapterCount, entryFlagged, reviewCount } from './entryList';
import { DEFAULT_KINDS, chooseSort, filterEntries, kindCounts, loadEntrySort, saveEntrySort, sortRows, type ColumnKey, type EntrySort } from './entryTable';
import { evidenceLinks } from './evidenceLinks';
import { ActionsMenu } from './ActionsMenu';
import { EntryTable } from './EntryTable';
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
import { Select } from '../primitives/Select';
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
  const [kind, setKind] = useState('All');
  // The host's list of types: the chips, and the colour each chip and row is drawn in (SN-B95). Until it is read there is only "All".
  const [types, setTypes] = useState<GuideType[]>([]);
  const detailRef = useRef<HTMLDivElement>(null);
  const [voiceDataOpen, setVoiceDataOpen] = useState(false);
  // The page's one voice-sample player: every entry's Voice samples section and the Voice data panel share it, so only one sample plays.
  const samplePlayer = useSamplePlayer();
  const [sort, setSort] = useState<EntrySort>(loadEntrySort);
  // The suggestions the host lists (SN-X42): an entry with one still to verify needs review, and cannot be marked reviewed (SNB-3b).
  const found = useSuggestions();
  const { suggestions } = found;
  // Which entries the Show menu keeps: every one, those that need review, or those with a suggestion to verify.
  const [show, setShow] = useState<'all' | 'review' | 'verify'>('all');
  const reviewOnly = show === 'review';
  const verifyOnly = show === 'verify';
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
  const tableKinds = kinds.length > 0 ? kinds : DEFAULT_KINDS;
  const filters = { kind: activeKind, query, reviewOnly, verifyOnly, suggestions };
  const filtered = filterEntries(visible, filters);
  const sorted = sortRows(filtered, sort, { kinds: tableKinds, suggestions });
  const counts = kindCounts(visible);
  const selected = rows.find((row) => row.id === selectedId);
  const toVerifyAll = verifyCount(suggestions);
  const loose = verifyOnly ? unattached(suggestions) : [];
  const looseChosen = loose.find((suggestion) => suggestion.id === looseId);
  const filtering = query.trim() !== '' || activeKind !== 'All' || reviewOnly || verifyOnly;
  const clearFilters = () => {
    setQuery('');
    setKind('All');
    setShow('all');
  };
  const chooseColumn = (column: ColumnKey) => {
    const next = chooseSort(sort, column);
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
        <div className="grid min-h-0 flex-1 gap-4 max-lg:h-auto lg:grid-cols-[minmax(17rem,35%)_minmax(0,1fr)] [&>*]:max-lg:min-h-96">
          <section aria-label="Entries" className={`${PANEL_FRAME_CLASS} flex min-h-0 flex-col overflow-hidden max-lg:max-h-[32rem]`}>
            <div className="flex flex-col gap-2 border-b border-[var(--border)] p-4">
              <SearchField label="Search entries" value={query} onChange={setQuery} placeholder="Find in any column" />
              <div className="grid grid-cols-2 gap-2">
                <Select
                  label="Kind"
                  fullWidth
                  value={activeKind}
                  onChange={setKind}
                  options={[
                    { value: 'All', label: `All kinds · ${counts.get('All') ?? 0}` },
                    ...types.map((type) => ({ value: type.name, label: `${type.name} · ${counts.get(type.name) ?? 0}` })),
                  ]}
                />
                <Select
                  label="Show"
                  fullWidth
                  value={show}
                  onChange={(value) => setShow(value === 'review' || value === 'verify' ? value : 'all')}
                  options={[
                    { value: 'all', label: 'All entries' },
                    ...(toReview > 0 || reviewOnly ? [{ value: 'review', label: `Needs review · ${toReview}` }] : []),
                    ...(toVerifyAll > 0 || verifyOnly ? [{ value: 'verify', label: `Needs verification · ${toVerifyAll}` }] : []),
                  ]}
                />
              </div>
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
              />
            ) : (
              <div className="min-h-0 flex-1 overflow-hidden p-2">
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
