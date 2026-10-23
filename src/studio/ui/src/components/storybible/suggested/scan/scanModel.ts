import type { AssetItem } from '../../../../types';
import { anyInstalled } from '../../../settings/analysis/components';

/** The value of `ManuscriptGuide.analysis_prompt` that stops the offer; anything else asks (the host's default is `ask`). */
export const BASIC = 'basic';

/**
 * Whether a scan first offers better analysis (the mock's `shouldOffer`): the narrator has not said no, no tool that can run is on this
 * computer, none is downloading, and something is left to download. The host decides which tools exist and which can run; this only reads
 * the registry's rows.
 */
export const shouldOffer = (preference: string, tools: AssetItem[], downloading: boolean): boolean =>
  preference !== BASIC && !anyInstalled(tools) && !downloading && tools.some((tool) => !tool.unavailableReason);
