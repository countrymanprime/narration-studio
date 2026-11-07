import { overlay } from '../../../overlay/overlayService';
import type { Notify } from '../../primitives/Toast';
import { CleanupAction } from '../CleanupAction';
import { registerDrawerSection } from '../drawer/drawerSections';

/** After the Clean up findings (order 10). */
const LEVELS_SECTION_ORDER = 20;

const notify: Notify = (text, tone) => overlay.toast(text, tone ? { tone } : undefined);

/**
 * Adds **Match levels…** to the drawer's Clean up tab (#2827): the one `CleanupAction` the editing check panel mounts too, so the preview, the apply,
 * the `item_gain` gate and its sentence are the same in both places. Its results are toasts, as a toast is how the check panel hands them on.
 */
export function registerLevelsSection(): () => void {
  return registerDrawerSection({
    tab: 'cleanup',
    order: LEVELS_SECTION_ORDER,
    label: 'Match levels',
    render: ({ chapterId }) => <CleanupAction chapterId={chapterId} notify={notify} />,
  });
}
