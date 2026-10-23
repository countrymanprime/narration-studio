import { useEffect, useState } from 'react';
import { IMPORT_FORMATS, type ExtractionImportPrompt, type ImportFormat } from '../../../../api/contracts/extraction';
import { apiErrorMessage } from '../../../../api/errorMessage';
import { overlay } from '../../../../overlay/overlayService';
import { usePort } from '../../../../ports/usePort';

export type ImportPrompts = Partial<Record<ImportFormat, ExtractionImportPrompt>>;

/** The host's prompt and example for each format, read once when the dialog opens. `maxBytes` is what a chosen file is checked against. */
export function useImportPrompts(): ImportPrompts {
  const port = usePort('extraction');
  const [prompts, setPrompts] = useState<ImportPrompts>({});
  useEffect(() => {
    let live = true;
    Promise.all(IMPORT_FORMATS.map((format) => port.extractionImportPrompt(format)))
      .then((all) => live && setPrompts(Object.fromEntries(all.map((p) => [p.format, p]))))
      .catch((error: unknown) => live && overlay.toast(apiErrorMessage(error), { tone: 'error' }));
    return () => {
      live = false;
    };
  }, [port]);
  return prompts;
}
