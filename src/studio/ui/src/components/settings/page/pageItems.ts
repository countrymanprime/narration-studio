import type { PageItem } from '../../../input/pageCommands';
import { CATEGORIES, PAGES_CATEGORY, categoryLabel } from '../registry/categories';
import { PAGE_SETTINGS } from '../registry/pageSettings';
import { ROWS } from '../registry/rows';
import type { CategoryId, SettingMeta } from '../registry/types';

export type SettingsPageItemsInput = {
  /** Whether the host sent the row's field (the same test the page uses to list the row). */
  shown: (row: SettingMeta) => boolean;
  /** The recording tool this project uses, for the rows that apply to one tool only. */
  daw: string;
  showCategory: (id: CategoryId) => void;
  /** Opens the row's category (and Advanced), then scrolls to and focuses it. */
  showRow: (cat: CategoryId, rowId: string) => void;
};

/**
 * What the jump menu offers while Settings is showing, from the registry the page draws: a "Categories" item for each category, then each setting
 * row under its category's name. A row the host did not send is left out, as on the page; a row for another recording tool stays, off, with why.
 */
export function settingsPageItems({ shown, daw, showCategory, showRow }: SettingsPageItemsInput): PageItem[] {
  const categories: PageItem[] = [...CATEGORIES, PAGES_CATEGORY].map((category) => ({
    id: `category.${category.id}`,
    label: category.label,
    group: 'Categories',
    hint: 'blurb' in category ? category.blurb : undefined,
    run: () => showCategory(category.id),
  }));
  const rows: PageItem[] = ROWS.filter((row) => row.needs === 'reaper' || shown(row)).map((row) => ({
    id: `row.${row.id}`,
    label: row.label,
    group: categoryLabel(row.cat),
    hint: row.desc,
    keywords: [row.section, ...(row.syn ? [row.syn] : [])],
    disabledReason: row.needs === 'reaper' && daw !== 'REAPER' ? `Only applies when recording with REAPER (this project uses ${daw})` : undefined,
    run: () => showRow(row.cat, row.id),
  }));
  const moved: PageItem[] = PAGE_SETTINGS.map((setting) => ({
    id: `row.${setting.id}`,
    label: setting.label,
    group: PAGES_CATEGORY.label,
    hint: setting.why,
    keywords: setting.syn ? [setting.syn] : undefined,
    run: () => showRow('pages', setting.id),
  }));
  return [...categories, ...rows, ...moved];
}
