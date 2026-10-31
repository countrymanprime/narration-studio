import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePageCommands } from '../../../input/pageCommands';
import { useProjectDaw } from '../data/useProjectDaw';
import type { Bootstrap } from '../../../types';
import { Button } from '../../primitives/Button';
import { InsetCard } from '../../primitives/InsetCard';
import { Heading } from '../../primitives/Heading';
import { Icon } from '../../primitives/Icon';
import { SearchField } from '../../primitives/SearchField';
import { LoadingRegion, Skeleton } from '../../primitives/Skeleton';
import { ToggleGroup } from '../../primitives/ToggleGroup';
import type { Notify } from '../../primitives/Toast';
import { SettingsFormsProvider } from '../data/settingsForms';
import { SettingsStoreProvider, useSettingsStore } from '../data/SettingsStore';
import { isAnyChanged, overrideValue } from '../data/values';
import { AssetsStoreProvider } from '../models/AssetsStore';
import { AboutSection } from '../controls/AboutSection';
import { CATEGORIES, categoryLabel } from '../registry/categories';
import { PAGE_SETTINGS } from '../registry/pageSettings';
import { ROWS } from '../registry/rows';
import { search, type Hit } from '../registry/search';
import { PAGE_LABEL, PAGE_PATH, type CategoryId, type SettingMeta, type UsedPage } from '../registry/types';
import { SettingsHostProvider, useSettingsHost, type SettingsHost } from '../row/SettingsHost';
import { SettingsNavProvider } from '../row/SettingsNav';
import { ANCHOR_TARGETS } from './anchors';
import { CategoryNav } from './CategoryNav';
import { CategoryPane } from './CategoryPane';
import { ModelsPane } from './ModelsPane';
import { PagesPane } from './PagesPane';
import { PaneTitle } from './PaneTitle';
import { Results } from './Results';
import { settingsPageItems } from './pageItems';
import { useDeepLink } from './useDeepLink';

export type SettingsPageProps = {
  data: Bootstrap;
  notify: Notify;
  onDirtyChange: (dirty: boolean) => void;
  registerActions: (actions: { save: () => Promise<void>; discard: () => Promise<void> }) => void;
  onProjectDataCleared: () => Promise<void>;
  /** The shared "link a REAPER project file" action. */
  onLinkDawFile: () => void;
  /** Navigates the app through its leave guard. */
  go: (path: string) => void;
  /** Re-reads the shared application state after an import commits. */
  refreshBootstrap: () => Promise<void>;
  /** A deep link's name for where to open (App.tsx's `SETTINGS_ANCHORS`): the category, with the row lit. */
  initialCategory?: string;
  /** The page a link or Ctrl+, came from (a path); Settings offers Back to it. Absent when the narrator came by the navigation rail. */
  cameFrom?: string;
};

type Filter = 'all' | 'changed' | 'project';

// The loading rows take the settings row's two columns (row/SettingRowView.tsx), so the blocks sit where the labels and controls will.
const SKELETON_ROW = 'grid gap-x-8 gap-y-1.5 @min-[761px]:grid-cols-[12rem_minmax(0,1fr)] @min-[860px]:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]';

/** The name of the page a path leads to, longest path first so '/proof/ch1' is Proof and '/' is Production. */
function pageNameOf(path: string): string {
  const pathname = path.split(/[?#]/)[0] || '/';
  const pages = (Object.keys(PAGE_PATH) as UsedPage[]).sort((a, b) => PAGE_PATH[b].length - PAGE_PATH[a].length);
  const page = pages.find((candidate) =>
    PAGE_PATH[candidate] === '/' ? pathname === '/' : pathname === PAGE_PATH[candidate] || pathname.startsWith(`${PAGE_PATH[candidate]}/`),
  );
  return page ? PAGE_LABEL[page] : 'the previous page';
}

function Body({ initialCategory, cameFrom }: { initialCategory?: string; cameFrom?: string }) {
  const store = useSettingsStore();
  const { data, go } = useSettingsHost();
  const target = initialCategory ? ANCHOR_TARGETS[initialCategory] : undefined;
  const [cat, setCat] = useState<CategoryId>(target?.cat ?? 'recording');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [navOpen, setNavOpen] = useState(false);
  const [advanced, setAdvanced] = useState<Partial<Record<CategoryId, boolean>>>({});
  const [focusRow, setFocusRow] = useState<string | null>(target?.row ?? null);
  const [lit, setLit] = useState<string | null>(null);
  const [headingAsks, setHeadingAsks] = useState(0);
  const heading = useRef(true);

  // A link from another page that arrives while Settings is open (the hash changed) asks again.
  const lastAnchor = useRef(initialCategory);
  useEffect(() => {
    if (initialCategory === lastAnchor.current) return;
    lastAnchor.current = initialCategory;
    const next = initialCategory ? ANCHOR_TARGETS[initialCategory] : undefined;
    if (!next) return;
    setCat(next.cat);
    setQuery('');
    setFilter('all');
    setFocusRow(next.row);
  }, [initialCategory]);

  // The tool this project records with, which can differ from the one the window was launched for: Record with changes it here.
  const daw = useProjectDaw(data.daw || 'REAPER');
  const loaded = Boolean(store.settings.global);
  const shown = useCallback(
    (row: SettingMeta): boolean => {
      if (row.needs === 'reaper' && daw !== 'REAPER') return false;
      return !row.field || !loaded || Boolean(store.fieldsOf(row).global);
    },
    [daw, loaded, store],
  );
  const changed = useCallback(
    (row: SettingMeta): boolean => {
      const { global, project } = store.fieldsOf(row);
      return isAnyChanged(row, global, project);
    },
    [store],
  );
  const inProject = useCallback(
    (row: SettingMeta): boolean => row.scope === 'project' || overrideValue(row, store.fieldsOf(row).project) !== undefined,
    [store],
  );
  const passes = useCallback(
    (row: SettingMeta) => (filter === 'all' ? true : filter === 'changed' ? changed(row) : inProject(row)),
    [filter, changed, inProject],
  );

  const text = query.trim();
  const searching = text !== '' || filter !== 'all';
  const hits = useMemo<Hit[]>(() => {
    if (text) return search(text, shown).filter((hit) => !hit.row || passes(hit.row));
    if (filter === 'all') return [];
    return ROWS.filter((row) => shown(row) && passes(row)).map((row) => ({ row, cat: categoryLabel(row.cat) }));
  }, [text, filter, shown, passes]);

  const categoryRows = (id: CategoryId) => ROWS.filter((row) => row.cat === id && shown(row));
  const changedIn = (id: CategoryId) => categoryRows(id).filter(changed).length;

  const showCategory = useCallback((id: CategoryId) => {
    setCat(id);
    setQuery('');
    setFilter('all');
    setNavOpen(false);
  }, []);

  // A row another page asked for may sit under Advanced: open it, then the effect below finds it.
  const targetRow = focusRow ? ROWS.find((row) => row.id === focusRow) : undefined;
  useEffect(() => {
    if (targetRow?.advanced && !advanced[targetRow.cat]) setAdvanced((current) => ({ ...current, [targetRow.cat]: true }));
  }, [targetRow, advanced]);
  const settled = loaded || Boolean(store.readError.global);
  const clearFocus = useCallback(() => setFocusRow(null), []);
  useDeepLink(focusRow, settled && (!targetRow?.advanced || Boolean(advanced[targetRow.cat])) && cat === (targetRow?.cat ?? 'pages'), clearFocus, setLit);

  // Choosing a category moves the reader to its heading (the list stays where it is for a keyboard user to continue); a row asked for keeps its focus.
  const rowAsked = useRef(focusRow);
  rowAsked.current = focusRow;
  useEffect(() => {
    if (heading.current) {
      heading.current = false;
      return;
    }
    if (!searching && !rowAsked.current) document.getElementById('settings-heading')?.focus({ preventScroll: true });
  }, [cat, searching]);

  // The jump menu's category item brings the heading into view even when the category was already showing.
  useEffect(() => {
    if (headingAsks === 0) return;
    const title = document.getElementById('settings-heading');
    title?.scrollIntoView?.({ block: 'start' });
    title?.focus({ preventScroll: true });
  }, [headingAsks]);

  usePageCommands({ id: 'settings', label: 'Settings', supersedes: ['Settings'] }, () =>
    settingsPageItems({
      shown,
      daw,
      showCategory: (id) => {
        showCategory(id);
        setHeadingAsks((count) => count + 1);
      },
      // The same request a link from another page makes: the category, the filters cleared, the row found, lit and focused once it is drawn.
      showRow: (id, rowId) => {
        showCategory(id);
        setFocusRow(rowId);
      },
    }),
  );

  const category = CATEGORIES.find((candidate) => candidate.id === cat);
  const loading = !settled && cat !== 'models';
  const broken = Boolean(store.readError.global) && !loaded && cat !== 'models';
  const crumb = searching ? (text ? 'Search results' : filter === 'changed' ? 'Changed from the default' : 'Set for this project') : categoryLabel(cat);

  let content;
  if (loading) {
    content = (
      <LoadingRegion label={`Loading ${crumb}`} status="Reading your settings…" className="flex flex-col gap-4">
        <PaneTitle title={crumb} blurb={searching ? undefined : category?.blurb} />
        {[3, 2].map((rows, section) => (
          <div key={section} className="flex flex-col">
            <Skeleton className="mb-1.5 w-32" />
            <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]">
              {Array.from({ length: rows }, (_, index) => (
                <div key={index} className={`${SKELETON_ROW} border-t border-[var(--border)] px-5 py-4 first:border-t-0`}>
                  <div className="flex flex-col gap-2">
                    <Skeleton className="w-40" />
                    <Skeleton className="w-full max-w-[24rem]" />
                  </div>
                  <div className="flex h-[var(--control-height)] items-center">
                    <Skeleton className="w-80 max-w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </LoadingRegion>
    );
  } else if (searching) {
    content = (
      <fieldset disabled={broken} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <h2 id="settings-heading" tabIndex={-1} className="sr-only">
          Results
        </h2>
        <Results
          hits={hits}
          lit={lit}
          onShowCategory={showCategory}
          empty={text ? `No settings match “${text}”` : filter === 'changed' ? 'Nothing is changed from the defaults' : 'This project overrides nothing'}
          hint={text ? 'Try a word from the setting’s name, such as “whisper”, “voice” or “reaper”.' : undefined}
        />
      </fieldset>
    );
  } else if (cat === 'models') {
    content = <ModelsPane category={category!} />;
  } else {
    content = (
      <fieldset disabled={broken} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0 disabled:opacity-55">
        {cat === 'pages' ? (
          <PagesPane lit={lit} />
        ) : (
          <CategoryPane
            category={category!}
            rows={categoryRows(cat)}
            changed={changedIn(cat)}
            advancedOpen={Boolean(advanced[cat])}
            onToggleAdvanced={() => setAdvanced((current) => ({ ...current, [cat]: !current[cat] }))}
            onReset={() => void resetCategory(categoryRows(cat), store)}
            lit={lit}
            extra={cat === 'app' ? <AboutSection /> : undefined}
          />
        )}
      </fieldset>
    );
  }

  return (
    <SettingsNavProvider value={{ go, showCategory }}>
      <div className="@container flex w-full flex-col gap-4" data-testid="settings-page">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Heading title="Settings" />
          {cameFrom && (
            <Button variant="secondary" size="sm" id="settings-back" onClick={() => go(cameFrom)}>
              <Icon name="previous" /> Back to {pageNameOf(cameFrom)}
            </Button>
          )}
          <span className="flex-1" />
          <div role="search" className="flex flex-wrap items-center gap-2.5 @max-[760px]:w-full">
            <div className="w-[260px] min-w-0 flex-[1_1_180px]">
              <SearchField
                leadingIcon
                label="Search settings"
                placeholder="Search settings"
                value={query}
                onChange={setQuery}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && query) {
                    event.stopPropagation();
                    setQuery('');
                  }
                }}
              />
            </div>
            <ToggleGroup
              label="Show"
              look="segmented"
              value={filter}
              onChange={(next) => setFilter(next as Filter)}
              options={[
                { value: 'all', label: 'All' },
                { value: 'changed', label: 'Changed' },
                { value: 'project', label: 'In this project' },
              ]}
            />
          </div>
        </div>
        <div className="grid items-start gap-5 @min-[761px]:grid-cols-[236px_minmax(0,1fr)]">
          <CategoryNav
            current={cat}
            browsing={searching}
            open={navOpen}
            onToggle={() => setNavOpen((current) => !current)}
            onPick={showCategory}
            changedIn={changedIn}
            pageSettingCount={PAGE_SETTINGS.length}
          />
          <section aria-labelledby="settings-heading" id="settings-pane" className="flex min-w-0 scroll-mt-3 flex-col gap-4">
            {store.failing && (
              <InsetCard tone="warn" role="status" className="flex flex-col items-start gap-1.5 text-[0.875rem]">
                <b>Changes cannot be saved right now.</b>
                <span>The last change was not kept and the previous value is still in use. The setting says why.</span>
              </InsetCard>
            )}
            {broken && (
              <InsetCard tone="danger" role="alert" className="flex flex-col items-start gap-1.5 text-[0.875rem]">
                <b>Your settings could not be read.</b>
                <span>{store.readError.global}. Nothing can be changed until the file can be read.</span>
                <Button variant="secondary" size="sm" onClick={() => void store.reload()}>
                  Retry
                </Button>
              </InsetCard>
            )}
            {content}
          </section>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {store.announcement}
        </span>
      </div>
    </SettingsNavProvider>
  );
}

/** Puts every row of a category back to its default: the computer's values and this project's overrides. */
async function resetCategory(rows: readonly SettingMeta[], store: ReturnType<typeof useSettingsStore>): Promise<void> {
  for (const row of rows) {
    if (!row.field) continue;
    const { global, project } = store.fieldsOf(row);
    if (global?.isSet && global.value !== row.def) await store.write(row, 'global', null);
    if (row.scope === 'both' && project?.isSet) await store.write(row, 'project', null);
  }
}

/**
 * The Settings page, at `/settings`: eight categories in three groups and an index of what moved to a page, one category at a time, built from
 * the host's fields and the registry in `registry/`. A change applies at once. The panels kept behind Set on a page edit with Save as before,
 * and join the app's leave guard through `SettingsFormsProvider`.
 */
export function SettingsPage({
  data,
  notify,
  onDirtyChange,
  registerActions,
  onProjectDataCleared,
  onLinkDawFile,
  go,
  refreshBootstrap,
  initialCategory,
  cameFrom,
}: SettingsPageProps) {
  const host = useMemo<SettingsHost>(
    () => ({ data, notify, onLinkDawFile, onProjectDataCleared, refreshBootstrap, go }),
    [data, notify, onLinkDawFile, onProjectDataCleared, refreshBootstrap, go],
  );
  return (
    <SettingsHostProvider value={host}>
      <SettingsFormsProvider notify={notify} onDirtyChange={onDirtyChange} registerActions={registerActions}>
        <SettingsStoreLoader>
          <AssetsStoreProvider>
            <Body initialCategory={initialCategory} cameFrom={cameFrom} />
          </AssetsStoreProvider>
        </SettingsStoreLoader>
      </SettingsFormsProvider>
    </SettingsHostProvider>
  );
}

/** Reads both scopes once the page opens. */
function SettingsStoreLoader({ children }: { children: React.ReactNode }) {
  return (
    <SettingsStoreProvider>
      <Loader />
      {children}
    </SettingsStoreProvider>
  );
}
function Loader() {
  const store = useSettingsStore();
  const { reload } = store;
  useEffect(() => {
    void reload();
  }, [reload]);
  return null;
}
