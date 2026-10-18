import { Icon } from '../../primitives/Icon';
import { StatusBadge } from '../../primitives/StatusBadge';
import { CATEGORIES, GROUPS, PAGES_CATEGORY } from '../registry/categories';
import type { CategoryId } from '../registry/types';

/**
 * The category list: three labelled groups and, apart, Set on a page. Wide, it sits beside the pane; narrower than the page's container query
 * (760 px), the list folds into one Category button that names the current category and opens the list.
 */
export function CategoryNav({
  current,
  browsing,
  open,
  onToggle,
  onPick,
  changedIn,
  pageSettingCount,
}: {
  current: CategoryId;
  /** Search or a filter is showing results: no category is the current page. */
  browsing: boolean;
  open: boolean;
  onToggle: () => void;
  onPick: (id: CategoryId) => void;
  changedIn: (id: CategoryId) => number;
  pageSettingCount: number;
}) {
  const currentLabel = CATEGORIES.find((category) => category.id === current)?.label ?? PAGES_CATEGORY.label;
  const item = (id: CategoryId, label: string, icon: Parameters<typeof Icon>[0]['name'], count: number, countLabel: string) => (
    // native-control-ok: a navigation entry (icon, label, count) in a full-width list; Button's uppercase centred chrome does not draw it
    <button
      key={id}
      type="button"
      data-cat={id}
      aria-current={!browsing && current === id ? 'page' : 'false'}
      onClick={() => onPick(id)}
      className="flex min-h-9 w-full items-center gap-2.5 rounded-[6px] border-0 bg-transparent px-2.5 text-left text-[0.9rem] font-medium text-[var(--text)] hover:bg-[var(--surface-2)] aria-[current=page]:bg-[var(--accent-soft)] aria-[current=page]:font-semibold aria-[current=page]:shadow-[inset_3px_0_0_var(--accent)]"
    >
      <span className="flex-none text-[var(--text-muted)]">
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1 font-['Barlow_Condensed',sans-serif] text-[0.8125rem] tracking-[0.1em] uppercase">{label}</span>
      {count > 0 && (
        <span aria-label={countLabel}>
          <StatusBadge tone="info" label={String(count)} />
        </span>
      )}
    </button>
  );
  return (
    <nav
      aria-label="Settings categories"
      className="flex flex-col gap-0.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2 @min-[761px]:sticky @min-[761px]:top-0"
    >
      {/* native-control-ok: the folded Category button spans the card and names the current category; Button does not draw that */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="settings-category-list"
        onClick={onToggle}
        className="hidden min-h-11 w-full items-center gap-2.5 border-0 bg-transparent px-3 text-left @max-[760px]:flex"
      >
        <span className="text-[0.8125rem] text-[var(--text-muted)]">Category</span>
        <b className="flex-1 font-['Barlow_Condensed',sans-serif] text-base tracking-[0.06em] uppercase">{currentLabel}</b>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      <div id="settings-category-list" className={`${open ? 'block' : 'hidden'} @min-[761px]:block`}>
        {GROUPS.map((group) => (
          <div key={group} role="group" aria-label={group}>
            <div className="px-2.5 pt-2.5 pb-1 font-['Barlow_Condensed',sans-serif] text-[0.6875rem] font-semibold tracking-[0.18em] text-[var(--text-muted)] uppercase first:pt-1">
              {group}
            </div>
            {CATEGORIES.filter((category) => category.group === group).map((category) =>
              item(category.id, category.label, category.icon, changedIn(category.id), `${changedIn(category.id)} changed`),
            )}
          </div>
        ))}
        <div role="group" aria-label="Elsewhere">
          <div className="px-2.5 pt-2.5 pb-1 font-['Barlow_Condensed',sans-serif] text-[0.6875rem] font-semibold tracking-[0.18em] text-[var(--text-muted)] uppercase">
            Elsewhere
          </div>
          {item('pages', PAGES_CATEGORY.label, PAGES_CATEGORY.icon, pageSettingCount, `${pageSettingCount} settings`)}
        </div>
      </div>
    </nav>
  );
}
