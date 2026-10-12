import { useMemo } from 'react';
import type { DawResult } from '../../../api/contracts/daw';
import { apiErrorMessage } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import type { FileActions } from '../files/FileActions';

/** The DAW's answer as a toast: what it did, or its own refusal as an error. A call that throws says why, as an error. */
function show(call: Promise<DawResult>): void {
  call.then(
    (result) => (result.ok ? overlay.toast(result.message) : overlay.toast(result.refused ?? result.message, { tone: 'error' })),
    (error: unknown) => overlay.toast(apiErrorMessage(error), { tone: 'error' }),
  );
}

/**
 * Master & QC's Play the quietest 5 s and Open in the DAW (the Studio Next mock's `#quiet` and `#openr`) over the DAW port. The file id
 * is the row's, the path the host's last measurement answered; the host finds the stretch and refuses a file that is not in that run.
 */
export function useFileActions(): Pick<FileActions, 'onPlayQuietest' | 'onOpenInDaw'> {
  const daw = usePort('daw');
  return useMemo(
    () => ({
      onPlayQuietest: (fileId: string) => show(daw.playQuietest(fileId)),
      onOpenInDaw: (fileId: string) => show(daw.openFile(fileId)),
    }),
    [daw],
  );
}
