import type { CategoryId } from '../registry/types';

/**
 * Where a link from another page lands: `/settings#credits` and the others `App.tsx` reads (`SETTINGS_ANCHORS`). The key is that table's value,
 * which is the settings tool or panel the link meant before the page had categories; the value is the category to open and the row to light up.
 */
export const ANCHOR_TARGETS: Record<string, { cat: CategoryId; row: string }> = {
  Recording: { cat: 'recording', row: 'daw.engine' },
  Credits: { cat: 'project', row: 'project.credits' },
  Delivery: { cat: 'delivery', row: 'delivery.profile' },
  Cleanup: { cat: 'pages', row: 'ps.cleanup' },
  Teleprompter: { cat: 'recording', row: 'daw.mic' },
};
