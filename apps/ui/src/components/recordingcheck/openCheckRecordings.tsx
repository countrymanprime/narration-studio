import { overlay as appOverlay, type OverlayService } from '../../overlay/overlayService';
import { CheckRecordingsDialog } from './CheckRecordingsDialog';

/**
 * Opens Check recordings through the overlay service, which owns its focus, stacking and Escape; the opener gets focus back on close.
 * `preselected` are the chapters ticked on open (a chapter without a recording is dropped). Returns the close function.
 */
export function openCheckRecordings(preselected: readonly string[] = [], service: OverlayService = appOverlay): () => void {
  return service.open({
    kind: 'dialog',
    title: 'Check recordings',
    render: ({ close }) => <CheckRecordingsDialog preselected={preselected} close={close} />,
  });
}
