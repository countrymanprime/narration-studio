import { CATEGORIES } from '../registry/categories';
import type { CategoryId } from '../registry/types';

/**
 * Where a link from another page lands: `/settings#credits` and the others `App.tsx` reads (`SETTINGS_ANCHORS`). The key is that table's value,
 * which is the settings tool or panel the link meant before the page had categories; the value is the category to open and the row to light up.
 */
/** The key a category's own anchor has in `ANCHOR_TARGETS`, and the hash that reaches it is `#category-<id>`. */
export const categoryAnchorKey = (id: string): string => `category:${id}`;

export const ANCHOR_TARGETS: Record<string, { cat: CategoryId; row: string | null }> = {
  Recording: { cat: 'recording', row: 'daw.engine' },
  Credits: { cat: 'project', row: 'project.credits' },
  Delivery: { cat: 'delivery', row: 'delivery.profile' },
  Cleanup: { cat: 'pages', row: 'ps.cleanup' },
  Teleprompter: { cat: 'recording', row: 'daw.mic' },
  // The jump menu's "Settings: <category>": `/settings#category-<id>` opens the category with no row to light up.
  ...Object.fromEntries(CATEGORIES.map((category) => [categoryAnchorKey(category.id), { cat: category.id, row: null }])),
};
