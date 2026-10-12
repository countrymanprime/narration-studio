import { registerDrawerSection } from '../drawer/drawerSections';
import { CleanupTab, type CleanupTabProps } from './CleanupTab';

/** The `order` the Clean up section takes in its tab, after the Found list. */
const CLEANUP_SECTION_ORDER = 10;

/**
 * Adds the findings-by-operation section to the drawer's Clean up tab. The page that mounts the drawer calls this with what the tab
 * needs of it (the journal and the DAW's range cut) and keeps the function it returns. Nothing calls it yet: the page stays unrouted
 * until the Editing swap.
 */
export function registerCleanupSection(props: Omit<CleanupTabProps, 'chapterId'>): () => void {
  return registerDrawerSection({
    tab: 'cleanup',
    order: CLEANUP_SECTION_ORDER,
    label: 'Clean up findings',
    render: ({ chapterId }) => <CleanupTab chapterId={chapterId} {...props} />,
  });
}
