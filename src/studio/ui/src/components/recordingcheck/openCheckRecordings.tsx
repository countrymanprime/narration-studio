import type { ManuscriptChapter } from '../../api/contracts/manuscript';
import { overlay as appOverlay, type OverlayService } from '../../overlay/overlayService';
import { CheckRecordingsDialog } from './CheckRecordingsDialog';

export type CheckRecordingsOptions = {
  /** Chapters the manuscript does not list, offered ticked beside it: a credits row's synthetic chapter (`creditsCheckChapter`). */
  extra?: readonly ManuscriptChapter[];
  /** Runs once the dialog has gone, however it closed: the opener reads what the check changed. */
  onClosed?: () => void;
};

/**
 * Opens Check recordings through the overlay service, which owns its focus, stacking and Escape; the opener gets focus back on close.
 * It is the one way into a recording check: every page's entry, for one chapter or several, opens this dialog with its chapters ticked.
 * `preselected` are the chapters ticked on open (a chapter without a recording is dropped). Returns the close function.
 */
export function openCheckRecordings(
  preselected: readonly string[] = [],
  options: CheckRecordingsOptions = {},
  service: OverlayService = appOverlay,
): () => void {
  return service.open({
    kind: 'dialog',
    dismissOnOutsidePress: false,
    title: 'Check recordings',
    // Two columns, the options and the chapters, each wide enough that the form shows whole at a 900 px tall window (alignment audit XPF-2).
    size: 'wide',
    render: ({ close }) => <CheckRecordingsDialog preselected={preselected} extra={options.extra} onClosed={options.onClosed} close={close} />,
  });
}
