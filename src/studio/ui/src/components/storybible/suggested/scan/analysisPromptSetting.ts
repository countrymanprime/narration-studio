import type { SystemApi } from '../../../../api/contracts/system';
import { BASIC } from './scanModel';

const TOOL = 'ManuscriptGuide';
const KEY = 'analysis_prompt';

/** The saved `ManuscriptGuide.analysis_prompt`, read fresh so a change made in Settings counts at once. Missing reads as `ask`. */
export async function readAnalysisPrompt(port: Pick<SystemApi, 'settingsForScope'>): Promise<string> {
  const fields = await port.settingsForScope('global');
  return fields[TOOL]?.find((field) => field.key === KEY)?.effectiveValue ?? 'ask';
}

/** "Don't ask again": the same global field the Settings checkbox "Offer better analysis when scanning" shows. */
export async function stopAskingAnalysisPrompt(port: Pick<SystemApi, 'saveSettings'>): Promise<void> {
  await port.saveSettings(TOOL, 'global', { [KEY]: BASIC });
}
