import { useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import { IconButton } from '../../primitives/IconButton';

/**
 * Opens the folder the host writes the run log in (`logs/run.jsonl`, `host.log`, `logs/runs/`) in the file manager, beside Debug logging
 * (issue 2730). The host owns the folder, so the button is never off; it is busy while the host answers, says nothing on success, and a
 * refusal is an error toast in the host's words.
 */
export function OpenLogFolderButton() {
  const system = usePort('system');
  const [opening, setOpening] = useState(false);
  const open = () => {
    setOpening(true);
    system
      .systemOpenLogFolder()
      .catch((failure) => overlay.toast(`The log folder could not be opened: ${apiErrorMessage(failure)}`, { tone: 'error' }))
      .finally(() => setOpening(false));
  };
  // 12 px from the switch's On/Off word, which the 6 px gap of the control line leaves touching.
  return <IconButton action="openFolder" label="Open the log folder" className="ml-1.5" pending={opening} onClick={open} />;
}
