import { CATEGORIES, PAGES_CATEGORY } from './categories';
import { PAGE_SETTINGS, type PageSetting } from './pageSettings';
import { ROWS } from './rows';
import type { SettingMeta } from './types';

/** One match: a setting row, or a setting that moved to a page, under the category it belongs to. */
export type Hit = { row?: SettingMeta; page?: PageSetting; cat: string };

const words = (query: string): string[] => query.toLowerCase().split(/\s+/).filter(Boolean);
const haystack = (...parts: Array<string | undefined>): string => parts.filter(Boolean).join(' ').toLowerCase();
const categoryName = (row: SettingMeta): string => CATEGORIES.find((category) => category.id === row.cat)?.label ?? '';

/** Rows and page settings whose label, description, section, category or synonyms contain every word typed. */
export function search(query: string, isShown: (row: SettingMeta) => boolean = () => true): Hit[] {
  const needles = words(query);
  if (needles.length === 0) return [];
  const hits: Hit[] = [];
  for (const row of ROWS) {
    if (!isShown(row)) continue;
    const text = haystack(row.label, row.desc, row.more, row.section, categoryName(row), row.syn);
    if (needles.every((word) => text.includes(word))) hits.push({ row, cat: categoryName(row) });
  }
  for (const page of PAGE_SETTINGS) {
    if (needles.every((word) => haystack(page.label, page.where, page.why, page.syn).includes(word))) hits.push({ page, cat: PAGES_CATEGORY.label });
  }
  return hits;
}
