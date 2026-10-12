import { useCallback, useRef, useState, type ReactNode } from 'react';
import { describeApiError } from '../../../../api/errorMessage';
import { overlay } from '../../../../overlay/overlayService';
import { usePort } from '../../../../ports/usePort';
import type { AssetItem } from '../../../../types';
import { analysisTools, offerable, recommended } from '../../../settings/analysis/components';
import { ConsentDialog } from '../../../settings/analysis/ConsentDialog';
import { useAnalysisTools, useComponentsPort } from '../../../settings/analysis/useAnalysisTools';
import { openImportDialog } from '../import/openImportDialog';
import { AnalysisPrompt, type ScanChoice } from './AnalysisPrompt';
import { readAnalysisPrompt, stopAskingAnalysisPrompt } from './analysisPromptSetting';
import { shouldOffer } from './scanModel';

export type StartScan = {
  /** Offers better analysis the first time (nothing installed or downloading, the setting `ask`), otherwise scans at once. */
  startScan: () => Promise<void>;
  /** The consent for the recommended tools once the narrator chose to download them; the page renders it beside its other dialogs. */
  dialogs: ReactNode;
};

/**
 * The Story Bible scan button's press: joins the consent (SN-X622), the scan (SN-X42) and the import (SN-X522). It decides which to open and
 * never blocks: if the setting or the registry cannot be read the scan starts, and closing the prompt starts nothing. A download started
 * from the consent runs here, one tool after another; the narrator presses Scan again once it ends, the scan does not start by itself.
 *
 * @param scan the page's `useSuggestions().scan.start`; the host decides which sources it runs.
 * @param onImported called after an import (and its undo), so the page reads the suggestions again.
 */
export function useStartScan({ scan, onImported }: { scan: () => Promise<void>; onImported?: () => void }): StartScan {
  const system = usePort('system');
  const assets = useComponentsPort();
  const tools = useAnalysisTools(assets);
  const [consent, setConsent] = useState<AssetItem[]>();
  const latest = useRef({ scan, onImported, tools });
  latest.current = { scan, onImported, tools };
  const reading = useRef(false);

  const startScan = useCallback(async () => {
    if (reading.current) return;
    reading.current = true;
    let offered: AssetItem[] | undefined;
    try {
      const [preference, catalog] = await Promise.all([readAnalysisPrompt(system), assets.assetsList()]);
      const list = analysisTools(catalog);
      const { statusFor } = latest.current.tools;
      const downloading = list.some((tool) => tool.activeJobId || ['downloading', 'verifying'].includes(statusFor(tool)));
      if (shouldOffer(preference, list, downloading)) offered = list;
    } catch (cause) {
      // The offer is a convenience: a setting or registry that cannot be read must not stand between the narrator and the scan.
      overlay.toast(`The analysis tools could not be checked, so this is the basic scan: ${describeApiError(cause)}`, { tone: 'error' });
    } finally {
      reading.current = false;
    }
    if (!offered) return latest.current.scan();

    const list = offered;
    const choose = async (choice: ScanChoice, never: boolean, close: () => void) => {
      if (never) {
        try {
          await stopAskingAnalysisPrompt(system);
        } catch (cause) {
          overlay.toast(`“Don’t ask again” could not be saved: ${describeApiError(cause)}`, { tone: 'error' });
        }
      }
      close();
      if (choice === 'basic') await latest.current.scan();
      else if (choice === 'download')
        setConsent(
          offerable(
            list,
            recommended(list).map((tool) => tool.id),
          ),
        );
      else openImportDialog({ onChanged: () => latest.current.onImported?.() });
    };
    overlay.open({
      kind: 'dialog',
      title: 'Scan the manuscript',
      render: ({ close }) => <AnalysisPrompt choose={(choice, never) => void choose(choice, never, close)} />,
    });
  }, [system, assets]);

  const dialogs = consent && (
    <ConsentDialog
      tools={consent}
      cancel={() => setConsent(undefined)}
      download={(ids) => {
        setConsent(undefined);
        latest.current.tools.install(ids);
      }}
    />
  );
  return { startScan, dialogs };
}
