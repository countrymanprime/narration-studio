import type { SystemApi } from '../../../api/contracts/system';

const TOOL = 'ManuscriptGuide';
const KEY = 'analysis_prompt';
const ASK = 'ask';
const BASIC = 'basic';

/**
 * The one place that reads and writes `ManuscriptGuide.analysis_prompt` (audit cluster 23): the Settings checkbox "Offer better analysis when
 * scanning" and the scan's own "Don't ask again" are two views of this field, so a choice made in either shows in the other.
 */

/** The saved value, read fresh so a change made elsewhere counts at once; undefined when the host lists no such field. */
export async function readAnalysisField(port: Pick<SystemApi, 'settingsForScope'>): Promise<string | undefined> {
  const fields = await port.settingsForScope('global');
  return fields[TOOL]?.find((field) => field.key === KEY)?.effectiveValue;
}

/** Missing reads as `ask`. */
export async function readAnalysisPrompt(port: Pick<SystemApi, 'settingsForScope'>): Promise<string> {
  return (await readAnalysisField(port)) ?? ASK;
}

/** Saves whether a scan offers the analysis tools first. */
export async function saveAnalysisPrompt(port: Pick<SystemApi, 'saveSettings'>, ask: boolean): Promise<void> {
  await port.saveSettings(TOOL, 'global', { [KEY]: ask ? ASK : BASIC });
}
