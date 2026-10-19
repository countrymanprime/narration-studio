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
      <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--border)] p-6 text-center" data-empty-results>
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
            <SectionLabel as="h3" className="mb-1.5 flex items-center gap-2.5">
              {name}
              {category && (
                <Button variant="link" size="sm" onClick={() => onShowCategory(category.id)}>
                  Show the whole category
                </Button>
              )}
            </SectionLabel>
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
