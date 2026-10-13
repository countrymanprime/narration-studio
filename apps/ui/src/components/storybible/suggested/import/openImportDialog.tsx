import { overlay } from '../../../../overlay/overlayService';
import { ImportDialog, type ImportDialogProps } from './ImportDialog';

/** Opens "Import entries" through the overlay service, which owns its focus, stacking and Escape; the opener gets focus back on close. */
export function openImportDialog(props: Pick<ImportDialogProps, 'onChanged'> = {}): () => void {
  return overlay.open({
    kind: 'dialog',
    dismissOnOutsidePress: false,
    title: 'Import entries',
    render: ({ close }) => <ImportDialog {...props} onClose={close} />,
  });
}
