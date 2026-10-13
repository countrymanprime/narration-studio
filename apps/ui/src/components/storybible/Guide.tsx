import { LoadError } from '../layout/LoadError';
import { describeApiError } from '../../api/errorMessage';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faMicrophone, faPlus, faRotate } from '@fortawesome/free-solid-svg-icons';
import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import type { GuideBuildResult, GuideEntity, GuideType } from '../../types';
import { categoryLabel } from '../../state';
import { CommandScope } from '../../input/router';
import { useCommand } from '../../input/useCommand';
import { useApi } from '../../api/ApiContext';
import { useAssetInstall } from '../../hooks/useAssetInstall';
import { usePendingAction } from '../../hooks/usePendingAction';
import { useWorkJob } from '../../hooks/useWorkJob';
import { AssetFacts } from '../assets/AssetFacts';
import { AssetInstallPrompt } from '../assets/AssetInstallPrompt';
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
import { ScanButton } from './suggested/panel/ScanButton';
import { useSuggestions } from './suggested/panel/useSuggestions';
import { openImportDialog } from './suggested/import/openImportDialog';
import { AcceptedClaims } from './suggested/row/AcceptedClaims';
import { SuggestionList } from './suggested/row/SuggestionList';
import { reviewable, summaryOf, unattached, verifyCount, verifyOf } from './suggested/row/selectors';
import { useStartScan } from './suggested/scan/useStartScan';
import { GuideDetail } from './GuideDetail';
import { VoiceDataPanel } from './VoiceDataPanel';
import { SeriesTab } from '../series/SeriesTab';
import { WorkDialog } from '../primitives/WorkDialog';
import { IconButton } from '../primitives/IconButton';
import { SearchField } from '../primitives/SearchField';
import { Select } from '../primitives/Select';
import { Tab, TabList, TabPanel, Tabs } from '../primitives/Tabs';
import type { Notify } from '../primitives/Toast';

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
};

export function Guide({ hasManuscript = true, onImport, ...rest }: GuideProps) {
  return hasManuscript ? <GuideLoaded {...rest} /> : <NeedManuscript title="Story Bible" onImport={onImport} />;
}

function GuideLoaded({ notify, goToManuscript }: Pick<GuideProps, 'notify' | 'goToManuscript'>) {
  const api = useApi();
  const location = useLocation();
  const routerNavigate = useNavigate();
  const entityId = location.hash ? decodeURIComponent(location.hash.slice(1)) : undefined;
  const [rows, setRows] = useState<GuideEntity[]>([]);
  // The first load failing leaves the page with nothing to show, so it gets an inline error and Retry; a later reload failing
  // keeps the rows on screen and is a toast, as before.
  const [loadError, setLoadError] = useState<string>();
  const loadedOnce = useRef(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(ENTRIES_TAB);
  const [kind, setKind] = useState('All');
  // The host's list of types: the chips, and the colour each chip and row is drawn in (SN-B95). Until it is read there is only "All".
  const [types, setTypes] = useState<GuideType[]>([]);
  const [focusedId, setFocusedId] = useState<string>();
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const [voiceDataOpen, setVoiceDataOpen] = useState(false);
  const [sort, setSort] = useState<EntrySortKey>(loadEntrySort);
  // The suggestions the host lists (SN-X42): an entry with one still to verify needs review, and cannot be marked reviewed (SNB-3b).
  const found = useSuggestions();
  const { suggestions } = found;
  const [reviewOnly, setReviewOnly] = useState(false);
  const [verifyOnly, setVerifyOnly] = useState(false);
  // A suggestion with no entry yet, chosen from the loose rows above the entries: the detail shows its row instead of an entry.
  const [looseId, setLooseId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ManuscriptChapter[]>([]);
  // The start call is quick, but the button says it was heard and a second press cannot start a second rebuild (ADR 0075).
  const starting = usePendingAction();
  // The build needs a language model, an asset: when it is not installed the host says so instead of starting, and the narrator chooses to
  // download it, to build without it this once, or to cancel. Nothing downloads on its own.
  const [modelPrompt, setModelPrompt] = useState<Extract<GuideBuildResult, { status: 'asset_required' }>>();
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
        setLoadError(undefined);
        setRows(next);
        setSelectedId((current) => (next.find((row) => row.id === (selectId ?? current)) || next.find((row) => row.category !== 'Draft'))?.id);
      } catch (error) {
        if (loadedOnce.current) notify(describeApiError(error), 'error');
        else setLoadError(describeApiError(error));
      }
    },
    [api, notify],
  );
  // Follows a running rebuild (ADR 0015). A success reloads the rows before the dialog goes, so the page never briefly renders on stale
  // (pre-build) rows - that render trips the route ErrorBoundary, which looks exactly like the build itself had failed. The
  // app says the build is done: the host's job-end event is the one place that does (ADR 0076).
  const [buildJob, setBuildJob] = useWorkJob({ poll: () => api.guideBuildState(), onSuccess: () => load() });
  const modelInstall = useAssetInstall({
    start: () => {
      if (!modelPrompt) return Promise.reject(new Error('Build the Story Bible first.'));
      return api.assetsInstall('spacy', modelPrompt.model.id);
    },
    state: (jobId) => api.assetsInstallState(jobId),
    cancel: (jobId) => api.assetsInstallCancel(jobId),
    onSuccess: async () => {
      setModelPrompt(undefined);
      notify('Language model installed.');
      await startBuild(false);
    },
  });
  const resetModelInstall = modelInstall.reset;
  /** Starts a build and follows its job, or opens the first-use question when the language model has to be downloaded first. */
  const startBuild = useCallback(
    (rulesOnly: boolean) =>
      starting.run('build', async () => {
        try {
          const result = await api.guideBuild({ rulesOnly });
          if (result.status === 'asset_required') {
            resetModelInstall();
            setModelPrompt(result);
          } else if (result.job.phase === 'success') await load();
          else setBuildJob(result.job);
        } catch (error) {
          notify(describeApiError(error), 'error');
        }
      }),
    [api, load, notify, resetModelInstall, setBuildJob, starting],
  );
  const closeModelPrompt = () => {
    setModelPrompt(undefined);
    resetModelInstall();
  };
  useEffect(() => {
    void load(entityId);
    if (entityId) routerNavigate('/story-bible', { replace: true });
  }, [entityId, load, routerNavigate]);
  // A rebuild that was started before the narrator left this page and is still going shows its dialog again on return; one that ended while
  // they were away needs nothing here, because the page just loaded its rows and the app already said it finished.
  useEffect(() => {
    let active = true;
    api
      .guideBuildState()
      .then((job) => active && ['preparing', 'running'].includes(job.phase) && setBuildJob(job))
      .catch((error) => active && notify(describeApiError(error), 'error'));
    return () => {
      active = false;
    };
  }, [api, notify, setBuildJob]);
  // The chapters, for Appears in and for where a suggestion's quote is; without them those sections stay empty.
  useEffect(() => {
    let live = true;
    api.manuscriptChapters().then(
      (list) => live && setChapters(list),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [api]);
  useEffect(() => {
    let live = true;
    api.guideTypes().then(
      (list) => live && setTypes(list),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [api]);
  // A decision changes the list here at once, and an accepted suggestion can change an entry, so the entries are read again.
  const { changed } = found;
  const decided = useCallback(
    (decision: Parameters<typeof changed>[0]) => {
      changed(decision);
      void load();
    },
    [changed, load],
  );
  const scanStart = useStartScan({ scan: found.scan.start, onImported: () => void load() });
  const links = useMemo(() => evidenceLinks(chapters, goToManuscript), [chapters, goToManuscript]);
  // A rebuild that ends while its dialog is dismissed or the narrator is elsewhere on this page still refreshes the entries.
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
    const name = rows.some((row) => row.canonical_name.toLowerCase() === base.toLowerCase()) ? `${base} ${rows.length + 1}` : base;
    setPendingNewEntity({ name });
  };
  const selectRow = (id?: string) => {
    setPendingNewEntity(undefined);
    setLooseId(null);
    setSelectedId(id);
  };

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
  const actions = (
    <div className="flex flex-wrap gap-2">
      <ScanButton scan={{ ...found.scan, start: scanStart.startScan }} />
      <ImportButton onImport={() => openImportDialog({ onChanged: () => void load() })} />
      <TooltipTarget text="Voice data: narration reference, remove voice data">
        <IconButton label="Voice data" onClick={() => setVoiceDataOpen(true)}>
          <FontAwesomeIcon icon={faMicrophone} />
        </IconButton>
      </TooltipTarget>
      <TooltipTarget text="Build / refresh Story Bible">
        <IconButton label="Build / refresh Story Bible" pending={starting.isPending('build')} onClick={() => void startBuild(false)}>
          <FontAwesomeIcon icon={faRotate} />
        </IconButton>
      </TooltipTarget>
      <TooltipTarget text="Add entity">
        <IconButton label="Add entity" onClick={addEntity}>
          <FontAwesomeIcon icon={faPlus} />
        </IconButton>
      </TooltipTarget>
    </div>
  );

  return (
    <CommandScope kind="page">
      <Tabs value={tab} onChange={setTab} className="mx-auto flex h-[calc(100dvh-6.5rem)] max-w-6xl flex-col gap-4 overflow-hidden max-md:h-auto">
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
          <div className="grid min-h-0 flex-1 gap-4 max-md:h-auto lg:grid-cols-[20rem_minmax(0,1fr)] [&>*]:max-md:min-h-96">
            <TabPanel value={tab} className={`${PANEL_FRAME_CLASS} flex min-h-0 flex-col overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-3">
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
              </div>
              <div className="guide-list-scroll min-h-0 overflow-y-auto p-2">
                {loose.length > 0 && (
                  <ul aria-label="Suggestions not in the Story Bible yet" className="m-0 mb-2 list-none p-0">
                    <LooseSuggestionRows suggestions={loose} selectedId={looseChosen?.id ?? null} onSelect={setLooseId} />
                  </ul>
                )}
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
                          tabIndex={row.id === stopId ? 0 : -1}
                          aria-current={open || undefined}
                          onFocus={() => setFocusedId(row.id)}
                          onClick={() => selectRow(row.id)}
                          className={`flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left ${open ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'text-[var(--text)] hover:bg-[var(--surface-2)]'}`}
                        >
                          <span data-line="name" className="flex w-full min-w-0 items-center gap-2 text-sm font-semibold">
                            <span className="truncate">{row.canonical_name}</span>
                            {row.locked && <FontAwesomeIcon icon={faLock} className="text-[10px]" style={{ color: 'var(--non-text)' }} />}
                            {pill && <StatusBadge tone="warning" label={pill} className="ml-auto shrink-0 whitespace-nowrap" />}
                          </span>
                          <span data-line="kind" className="flex items-center gap-1.5 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
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
              </div>
            </TabPanel>
            <div className="flex min-h-0 min-w-0">
              {looseChosen ? (
                <Panel title={summaryOf(looseChosen.payload)} scroll className="min-h-0 flex-1">
                  <SuggestionList title="Suggested" suggestions={[looseChosen]} sources={found.sources} onChanged={decided} {...links} />
                </Panel>
              ) : (
                <GuideDetail
                  // One detail per entry, so what an action left pending on one entry never shows on the next.
                  key={newEntityDraft ? 'new-draft' : (selected?.id ?? 'none')}
                  entity={newEntityDraft ?? selected}
                  isNewDraft={Boolean(newEntityDraft)}
                  onDiscardNewDraft={() => setPendingNewEntity(undefined)}
                  onCreatedNewDraft={(id) => {
                    setPendingNewEntity(undefined);
                    void load(id);
                  }}
                  entities={rows}
                  reload={load}
                  notify={notify}
                  goToManuscript={goToManuscript}
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
        {modelPrompt && (
          <AssetInstallPrompt
            ask={{
              title: 'Download local language model?',
              body: 'The Story Bible reads your manuscript with a language model to find people, places and organizations. It is not bundled with Narration Studio and will be stored in your per-user asset cache. You can build without it this once, with lower-quality results.',
              confirmLabel: 'Download model',
              alternative: { label: 'Build with rules-only', action: () => void startBuild(true).then(closeModelPrompt) },
            }}
            workTitle="Downloading language model"
            install={modelInstall}
            dismiss={closeModelPrompt}
          >
            <AssetFacts
              label="Language model"
              name={modelPrompt.model.displayName}
              version={modelPrompt.model.version}
              publisher={modelPrompt.model.publisher}
              license={modelPrompt.model.license}
              licenseUrl={modelPrompt.model.licenseUrl}
              modelCardUrl={modelPrompt.model.modelCardUrl}
              provenanceUrl={modelPrompt.model.provenanceUrl}
              downloadSize={modelPrompt.downloadSize}
              diskSize={modelPrompt.diskSize}
              installPath={modelPrompt.installPath}
            />
          </AssetInstallPrompt>
        )}
        {buildJob && <WorkDialog title="Rebuild Story Bible" job={buildJob} close={() => setBuildJob(undefined)} background={() => setBuildJob(undefined)} />}
        {scanStart.dialogs}
        <VoiceDataPanel open={voiceDataOpen} onClose={() => setVoiceDataOpen(false)} notify={notify} />
      </Tabs>
    </CommandScope>
  );
}
