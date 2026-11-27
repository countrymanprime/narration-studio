import { CATEGORIES } from '../registry/categories';
import type { CategoryId } from '../registry/types';

/**
 * Where a link from another page lands: `/settings#credits` and the others `App.tsx` reads (`SETTINGS_ANCHORS`). The key is that table's value,
 * which is the settings tool or panel the link meant before the page had categories; the value is the category to open and the row to light up.
 */
/** The key a category's own anchor has in `ANCHOR_TARGETS`, and the hash that reaches it is `#category-<id>`. */
const categoryAnchorKey = (id: string): string => `category:${id}`;

export const ANCHOR_TARGETS: Record<string, { cat: CategoryId; row: string | null }> = {
  Recording: { cat: 'recording', row: 'daw.engine' },
  Credits: { cat: 'project', row: 'project.credits' },
  Delivery: { cat: 'delivery', row: 'delivery.profile' },
  Cleanup: { cat: 'recording', row: 'editing.cleanup' },
  Teleprompter: { cat: 'recording', row: 'daw.mic' },
  // The jump menu's "Settings: <category>": `/settings#category-<id>` opens the category with no row to light up.
  ...Object.fromEntries(CATEGORIES.map((category) => [categoryAnchorKey(category.id), { cat: category.id, row: null }])),
};

/**
 * Every hash `/settings` resolves, by hash: the kept anchors another page opens Settings at (`#cleanup` is Master's Silence cleanup link; `#teleprompter` is an alias of `#booth`, kept for
 * links from before the Booth replaced the Teleprompter page) and the jump menu's `#category-<id>` for every category. The value is the key in `ANCHOR_TARGETS`. The one table
 * `App.tsx` reads. A project change drops every one of them (`addressWithoutProject`).
 */
export const SETTINGS_HASHES: Readonly<Record<string, string>> = {
  '#recording': 'Recording',
  '#credits': 'Credits',
  '#delivery': 'Delivery',
  '#cleanup': 'Cleanup',
  '#booth': 'Teleprompter',
  '#teleprompter': 'Teleprompter',
  ...Object.fromEntries(CATEGORIES.map((category) => [`#category-${category.id}`, categoryAnchorKey(category.id)])),
};
