import { useEffect, useRef, useState } from 'react';
import type { ExtractionImportPlan, ImportFormat } from '../../../../api/contracts/extraction';
import { usePort } from '../../../../ports/usePort';
import { PREVIEW_DEBOUNCE_MS, readableFailure } from './importModel';

export type ImportPreview = {
  plan?: ExtractionImportPlan;
  /** The text changed and the plan on show is for earlier text (or none yet). */
  waiting: boolean;
  /** The host's sentence when the preview could not be made. */
  problem?: string;
};

/** The host's plan for `text`, asked once typing pauses. Each ask replaces the last; an answer for earlier text never lands on later text. */
export function useImportPreview(text: string, hint?: ImportFormat): ImportPreview {
  const port = usePort('extraction');
  const [state, setState] = useState<{ plan?: ExtractionImportPlan; problem?: string; for?: string }>({});
  const latest = useRef(0);
  const blank = !text.trim();

  useEffect(() => {
    const ask = ++latest.current;
    if (blank) return;
    const timer = setTimeout(() => {
      port
        .extractionImportPreview(text, hint)
        .then((plan) => ask === latest.current && setState({ plan, for: text + '\u0000' + (hint ?? '') }))
        .catch(
          (error: unknown) =>
            ask === latest.current && setState({ problem: readableFailure(error, 'The host did not say why.'), for: text + '\u0000' + (hint ?? '') }),
        );
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      // Closing the dialog (or typing on) leaves any answer still on its way with nowhere to land.
      latest.current += 1;
    };
  }, [port, text, hint, blank]);

  if (blank) return { waiting: false };
  return { plan: state.plan, problem: state.problem, waiting: state.for !== text + '\u0000' + (hint ?? '') };
}
