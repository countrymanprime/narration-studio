import type { DawCapabilities } from '../../../api/contracts/daw';
import { registerDrawerSection } from '../drawer/drawerSections';
import { BackupsTab, type BackupsTabProps } from './BackupsTab';

/** The `order` the Backups section takes in its tab. */
const BACKUPS_SECTION_ORDER = 10;

/**
 * Whether the DAW keeps backups at all (the Studio Next mock's `tabsFor`): it has them now, or the narrator turned them off and can turn them back
 * on in the tab. A DAW that has no backups (REAPER, the built-in recorder: not yet, or unsupported) has no Backups tab.
 */
export function keepsBackups(caps: DawCapabilities | null): boolean {
  const support = caps?.capabilities['backups'];
  return !!support && (support.available || support.reason === 'turned_off');
}

/**
 * Adds the backups section to the drawer's Backups tab, only where the DAW keeps backups at all (`keepsBackups`: Audacity, not REAPER or the
 * recorder), and returns the function that removes it; where it does not, it adds nothing. The page that mounts the drawer calls this
 * with the capabilities it read and what the tab needs of it. Nothing calls it yet: the page stays unrouted until the Editing swap (#1305).
 */
export function registerBackupsSection(caps: DawCapabilities | null, props: Omit<BackupsTabProps, 'chapterId'>): () => void {
  if (!keepsBackups(caps)) return () => {};
  return registerDrawerSection({
    tab: 'backups',
    order: BACKUPS_SECTION_ORDER,
    label: 'Backups',
    render: ({ chapterId }) => <BackupsTab chapterId={chapterId} {...props} />,
  });
}
