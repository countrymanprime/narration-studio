import { useEffect, type ReactNode } from 'react';
import { DAW_CONNECT_GRACE_MS, useConnectGrace } from '../production/pipeline/dawConnectGrace';
import { ConnectionIndicator } from './ConnectionIndicator';
import { ConnectionResolveDialog } from './ConnectionResolveDialog';
import { useDawStatus } from './useDawStatus';
import { useOpenOnce } from './useOpenOnce';

export interface DawConnectionOptions {
  /** What still works while the DAW is off, said once in the dialog; named for the DAW the capability report gives. */
  stillWorks: (dawName: string) => string;
  /** The chip's element id, for a page that points a skip link or a focus return at it. */
  id?: string;
  /** How long after the app opens a DAW that has not connected yet is left alone before the dialog opens by itself (tests shorten it). */
  graceMs?: number;
  /** Told whenever the dialog opens or closes, for a page that holds another dialog while this one is up so two never stack. */
  onDialogOpen?: (open: boolean) => void;
}

export interface DawConnection {
  /** The DAW is not answering. */
  off: boolean;
  /** The quiet chip for the page's header, or null while the DAW answers. */
  indicator: ReactNode;
  /** The not-connected dialog, or null: draw it once at the page's top, not in a header the page swaps while it loads. */
  dialog: ReactNode;
  /** The dialog is up. */
  dialogOpen: boolean;
}

/**
 * The one DAW connection state and its two marks (#2823): the chip for the header and the not-connected dialog. It reads the app's one DAW session
 * (`useDawStatus`), so every page that uses it shows the same state, a Check again on any of them is the read all of them show, and linking the
 * project file from the dialog (the app's one link action) makes every open page follow without a reload. The dialog opens by itself once per
 * connection loss, after the app has had its time to connect on its own, and then only from the chip.
 */
export function useDawConnection({ stillWorks, id = 'dawoff', graceMs = DAW_CONNECT_GRACE_MS, onDialogOpen }: DawConnectionOptions): DawConnection {
  const daw = useDawStatus();
  const settling = useConnectGrace(graceMs);
  const state = useOpenOnce(daw.off ? `reaper-off:${daw.dawName}` : null, settling);
  const dialogOpen = Boolean(daw.off) && state.open;
  useEffect(() => {
    onDialogOpen?.(dialogOpen);
  }, [dialogOpen, onDialogOpen]);
  if (!daw.off) return { off: false, indicator: null, dialog: null, dialogOpen: false };
  return {
    off: true,
    dialogOpen,
    indicator: <ConnectionIndicator id={id} label={`${daw.dawName} not connected`} onOpen={state.reopen} />,
    dialog: dialogOpen ? (
      <ConnectionResolveDialog
        variant="reaper-off"
        daw={daw.caps?.daw ?? 'none'}
        sentence={daw.off}
        stillWorks={stillWorks(daw.dawName)}
        checkedAt={daw.checkedAt}
        heardAt={daw.heardAt}
        readFailed={daw.readFailed}
        onCheckAgain={daw.retry}
        onCaps={daw.take}
        onClose={state.close}
      />
    ) : null,
  };
}
