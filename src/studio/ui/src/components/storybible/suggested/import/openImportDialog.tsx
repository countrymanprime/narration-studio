import type { MutableRefObject } from 'react';
import { overlay } from '../../../../overlay/overlayService';
import { moreActionsButton } from '../../moreActionsButton';
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
    // Chosen from the Story Bible's More actions menu, which closed with the item: the button is where the narrator was (#3416 item 50). Elsewhere it is not drawn and the opener stands.
    returnFocus: moreActionsButton,
    render: ({ close }) => <ImportDialog {...props} onClose={close} exitGuard={exit} />,
  });
}
