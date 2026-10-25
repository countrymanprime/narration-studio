import { Button } from '../../primitives/Button';
import { Panel } from '../../primitives/Panel';
import { SectionLabel } from '../../primitives/SectionLabel';
import { CATEGORIES } from '../registry/categories';
import type { Hit } from '../registry/search';
import { PageSettingList } from './PagesPane';
import { RowOf } from './RowOf';
import type { CategoryId } from '../registry/types';

/** The result list while the narrator searches or filters: rows from every category, each under the category it belongs to. */
export function Results({
  hits,
  empty,
  hint,
  lit,
  onShowCategory,
}: {
  hits: readonly Hit[];
  empty: string;
  /** A line under the empty message. Only a text search has words to try; the Changed and In this project filters have none. */
  hint?: string;
  lit: string | null;
  onShowCategory: (id: CategoryId) => void;
}) {
  if (hits.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] px-5 py-4" data-empty-results>
        <p className="m-0 font-semibold">{empty}</p>
        {hint && <p className="m-0 mt-1 text-[0.8125rem] text-[var(--text-muted)]">{hint}</p>}
      </div>
    );
  }
  const categories = [...new Set(hits.map((hit) => hit.cat))];
  return (
    <>
      {categories.map((name) => {
        const mine = hits.filter((hit) => hit.cat === name);
        const rows = mine.flatMap((hit) => (hit.row ? [hit.row] : []));
        const pages = mine.flatMap((hit) => (hit.page ? [hit.page] : []));
        const category = CATEGORIES.find((candidate) => candidate.label === name);
        return (
          <section key={name} aria-label={name} className="flex flex-col">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <SectionLabel as="h3">{name}</SectionLabel>
              {category && (
                <Button variant="secondary" size="sm" onClick={() => onShowCategory(category.id)}>
                  Show the whole category
                </Button>
              )}
            </div>
            {rows.length > 0 && (
              <Panel flush>
                {rows.map((row) => (
                  <RowOf key={row.id} row={row} flash={lit === row.id} />
                ))}
              </Panel>
            )}
            {pages.length > 0 && <PageSettingList items={pages} />}
          </section>
        );
      })}
      <span className="sr-only" role="status">
        {hits.length} {hits.length === 1 ? 'setting' : 'settings'} found
      </span>
    </>
  );
}
