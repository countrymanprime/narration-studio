import type { MutableRefObject } from 'react';
import { overlay } from '../../../../overlay/overlayService';
import { ImportDialog, type ImportDialogProps } from './ImportDialog';

/** Opens "Import entries" through the overlay service, which owns its focus, stacking and Escape; the opener gets focus back on close. */
export function openImportDialog(props: Pick<ImportDialogProps, 'onChanged'> = {}): () => void {
  // The dialog knows whether something is pasted or chosen; the overlay host's Escape asks it before closing (#3400).
  const exit: MutableRefObject<(() => boolean | Promise<boolean>) | null> = { current: null };
  return overlay.open({
    kind: 'dialog',
    dismissOnOutsidePress: false,
    title: 'Import entries',
    size: 'wide',
    headerless: true,
    beforeClose: () => exit.current?.() ?? true,
    render: ({ close }) => <ImportDialog {...props} onClose={close} exitGuard={exit} />,
  });
}
