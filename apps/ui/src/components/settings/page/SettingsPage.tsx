import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bootstrap } from '../../../types';
import { Button } from '../../primitives/Button';
import { Heading } from '../../primitives/Heading';
import { SearchField } from '../../primitives/SearchField';
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
import type { CategoryId, SettingMeta } from '../registry/types';
import { SettingsHostProvider, useSettingsHost, type SettingsHost } from '../row/SettingsHost';
import { SettingsNavProvider } from '../row/SettingsNav';
import { ANCHOR_TARGETS } from './anchors';
import { CategoryNav } from './CategoryNav';
import { CategoryPane } from './CategoryPane';
import { ModelsPane } from './ModelsPane';
import { PagesPane } from './PagesPane';
import { Results } from './Results';
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
};

type Filter = 'all' | 'changed' | 'project';

function Body({ initialCategory }: { initialCategory?: string }) {
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

  const daw = data.daw || 'REAPER';
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

  // Choosing a category moves the reader to its heading (the list stays where it is for a keyboard user to continue).
  useEffect(() => {
    if (heading.current) {
      heading.current = false;
      return;
    }
    if (!searching) document.getElementById('settings-heading')?.focus({ preventScroll: true });
  }, [cat, searching]);

  const category = CATEGORIES.find((candidate) => candidate.id === cat);
  const loading = !settled && cat !== 'models';
  const broken = Boolean(store.readError.global) && !loaded && cat !== 'models';
  const crumb = searching ? (text ? 'Search results' : filter === 'changed' ? 'Changed from the default' : 'Set for this project') : categoryLabel(cat);

  let content;
  if (loading) {
    content = (
      <div aria-busy="true" aria-label={`Loading ${crumb}`} className="flex flex-col gap-3">
        <h2 id="settings-heading" tabIndex={-1} className="font-['Barlow_Condensed',sans-serif] text-[1.875rem] font-semibold outline-none">
          {crumb}
        </h2>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-16 rounded-md bg-[var(--surface-2)] motion-safe:animate-pulse" />
        ))}
        <span className="sr-only" role="status">
          Reading your settings…
        </span>
      </div>
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
      <div className="@container flex w-full max-w-[1180px] flex-col gap-4" data-testid="settings-page">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Heading title="Settings" />
          <span className="flex-1" />
          <div role="search" className="flex flex-wrap items-center gap-2.5">
            <SearchField label="Search settings" placeholder="Search settings" value={query} onChange={setQuery} />
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
          <main aria-labelledby="settings-heading" id="settings-pane" className="flex min-w-0 scroll-mt-3 flex-col gap-4">
            <div aria-label="Breadcrumb" className="text-[0.8125rem] text-[var(--text-muted)]">
              Settings <span aria-hidden="true">/</span> {crumb}
            </div>
            {store.failing && (
              <div role="status" className="flex flex-col items-start gap-1.5 rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)] px-3.5 py-3">
                <b>Changes cannot be saved right now.</b>
                <span>The last change was not kept and the previous value is still in use. The setting says why.</span>
              </div>
            )}
            {broken && (
              <div role="alert" className="flex flex-col items-start gap-1.5 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-3.5 py-3">
                <b>Your settings could not be read.</b>
                <span>{store.readError.global}. Nothing can be changed until the file can be read.</span>
                <Button variant="secondary" size="sm" onClick={() => void store.reload()}>
                  Try again
                </Button>
              </div>
            )}
            {content}
          </main>
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
            <Body initialCategory={initialCategory} />
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
