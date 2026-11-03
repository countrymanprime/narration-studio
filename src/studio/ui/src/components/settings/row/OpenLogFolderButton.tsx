import { apiErrorMessage } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import { IconButton } from '../../primitives/IconButton';
import { LOG_FOLDER_WAIT_MS, startLogFolderRequest, useLogFolderWaiting } from './logFolderRequest';

const FAILED = 'The log folder could not be opened';
// The Windows host's only refusal (update.OpenFolder): appended to FAILED it would say the same thing twice.
const HOST_GENERIC = /^the folder could not be opened\.?$/i;

/** The toast for a refusal: the host's words after FAILED, or FAILED alone when the host said nothing more. */
function refusalText(failure: unknown): string {
  const detail = apiErrorMessage(failure).trim();
  return detail && !HOST_GENERIC.test(detail) ? `${FAILED}: ${detail}` : `${FAILED}.`;
}

/**
 * Opens the folder the host writes the run log in (`logs/run.jsonl`, `host.log`, `logs/runs/`) in the file manager, beside Debug logging
 * (issue 2730). The host owns the folder, so the button is never off. It is busy while the host answers, even when drawn again after
 * leaving the category, and says nothing on success. A refusal, or no answer within `LOG_FOLDER_WAIT_MS`, is an error toast.
 */
export function OpenLogFolderButton() {
  const system = usePort('system');
  const opening = useLogFolderWaiting();
  const open = () =>
    startLogFolderRequest(
      () => system.systemOpenLogFolder(),
      (failure) => overlay.toast(refusalText(failure), { tone: 'error' }),
      () => overlay.toast(`${FAILED}: the app did not answer in ${LOG_FOLDER_WAIT_MS / 1000} seconds. Try again.`, { tone: 'error' }),
    );
  // 12 px from the switch's On/Off word, which the 6 px gap of the control line leaves touching. Drawn before Reset, so Reset coming
  // and going does not move it; it does shift about 1 px when the word changes between Off and On.
  return <IconButton action="openFolder" label="Open the log folder" className="ml-1.5" pending={opening} onClick={open} />;
}
