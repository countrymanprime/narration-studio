import { overlay as appOverlay, type OverlayService } from '../../overlay/overlayService';
import { CheckRecordingsDialog } from './CheckRecordingsDialog';

export type CheckRecordingsOptions = {
  /** Runs once the dialog has gone, however it closed: the opener reads what the check changed. */
  onClosed?: () => void;
};

/**
 * Opens Check recordings through the overlay service, which owns its focus, stacking and Escape; the opener gets focus back on close.
 * It is the one way into a recording check: every page's entry, for one chapter or several, opens this dialog with its chapters ticked.
 * `preselected` are the chapters ticked on open (a chapter whose recording was measured as empty is dropped). Returns the close function.
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
    render: ({ close }) => <CheckRecordingsDialog preselected={preselected} onClosed={options.onClosed} close={close} />,
  });
}
