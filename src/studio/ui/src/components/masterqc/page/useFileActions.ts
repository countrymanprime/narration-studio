import { useMemo, useRef } from 'react';
import type { DawResult } from '../../../api/contracts/daw';
import { apiErrorMessage } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import type { FileActions } from '../files/FileActions';

/** The DAW's answer as a toast: what it did, or its own refusal as an error. A call that throws says why, as an error. */
function show(call: Promise<DawResult>, done: () => void): void {
  call.finally(done).then(
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
  // One call per action and file at a time: a second press while the DAW has not answered is ignored, so a double press never
  // plays or reveals twice. The key frees when the call settles, and a call that never settles keeps only its own file's action busy.
  const inFlight = useRef(new Set<string>());
  return useMemo(() => {
    const once = (key: string, call: () => Promise<DawResult>) => {
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);
      show(call(), () => inFlight.current.delete(key));
    };
    return {
      onPlayQuietest: (fileId: string) => once(`play ${fileId}`, () => daw.playQuietest(fileId)),
      onOpenInDaw: (fileId: string) => once(`open ${fileId}`, () => daw.openFile(fileId)),
    };
  }, [daw]);
}
