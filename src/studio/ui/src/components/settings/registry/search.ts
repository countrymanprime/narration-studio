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
  const scores = new Map<Hit, number>();
  for (const row of ROWS) {
    if (!isShown(row)) continue;
    const text = haystack(row.label, row.desc, row.more, row.section, categoryName(row), row.syn);
    if (needles.every((word) => text.includes(word))) {
      const hit = { row, cat: categoryName(row) };
      hits.push(hit);
      // A whole word in the label counts most, one in the synonyms next, a part of one next, one in the description or section less, and one in the
      // long help least.
      const named = haystack(row.label, row.syn);
      const short = haystack(row.desc, row.section);
      const wholeIn = (text: string, word: string) => new RegExp(`(^|[^a-z])${word.replace(/[^a-z0-9]/g, '')}($|[^a-z])`).test(text);
      const labelled = haystack(row.label);
      scores.set(
        hit,
        needles.reduce(
          (sum, word) => sum + (wholeIn(labelled, word) ? 5 : wholeIn(named, word) ? 4 : named.includes(word) ? 3 : short.includes(word) ? 2 : 1),
          0,
        ),
      );
    }
  }
  hits.sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0));
  for (const page of PAGE_SETTINGS) {
    if (needles.every((word) => haystack(page.label, page.where, page.why, page.syn).includes(word))) hits.push({ page, cat: PAGES_CATEGORY.label });
  }
  return hits;
}
