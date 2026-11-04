import { useEffect, useState } from 'react';
import { IMPORT_FORMATS, type ExtractionImportPrompt, type ImportFormat } from '../../../../api/contracts/extraction';
import { apiErrorMessage } from '../../../../api/errorMessage';
import { overlay } from '../../../../overlay/overlayService';
import { retryAction } from '../../../primitives/Toast';
import { usePort } from '../../../../ports/usePort';

export type ImportPrompts = Partial<Record<ImportFormat, ExtractionImportPrompt>>;

/** The host's prompt and example for each format, read once when the dialog opens. `maxBytes` is what a chosen file is checked against. */
export function useImportPrompts(): ImportPrompts {
  const port = usePort('extraction');
  const [prompts, setPrompts] = useState<ImportPrompts>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    Promise.all(IMPORT_FORMATS.map((format) => port.extractionImportPrompt(format)))
      .then((all) => live && setPrompts(Object.fromEntries(all.map((p) => [p.format, p]))))
      // A read the dialog needs and has no control to repeat: Retry reads the prompts again (issue #2919).
      .catch((error: unknown) => live && overlay.toast(apiErrorMessage(error), { tone: 'error', action: retryAction(() => setAttempt((n) => n + 1)) }));
    return () => {
      live = false;
    };
  }, [port, attempt]);
  return prompts;
}
