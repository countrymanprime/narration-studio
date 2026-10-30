import { describe, expect, it } from 'vitest';
import type { SystemApi } from '../../../api/contracts/system';
import { readAnalysisField, readAnalysisPrompt, saveAnalysisPrompt } from './analysisPromptSetting';

/** A port that keeps the one global field, as the host does. */
function host(initial?: string) {
  let value = initial;
  const port = {
    settingsForScope: async () => ({ ManuscriptGuide: value === undefined ? [] : [{ key: 'analysis_prompt', effectiveValue: value }] }),
    saveSettings: async (_tool: string, _scope: string, values: Record<string, string | null>) => {
      value = values.analysis_prompt ?? undefined;
    },
  } as unknown as Pick<SystemApi, 'settingsForScope' | 'saveSettings'>;
  return port;
}

describe('the-analysis-prompt-is-one-field-read-and-written-in-one-place', () => {
  it("Don't ask again and the Settings checkbox write the same field, and both readers show it", async () => {
    const port = host();
    expect(await readAnalysisPrompt(port)).toBe('ask');
    expect(await readAnalysisField(port)).toBeUndefined();
    await saveAnalysisPrompt(port, false); // the scan's "Don't ask again"
    expect(await readAnalysisPrompt(port)).toBe('basic');
    expect(await readAnalysisField(port)).toBe('basic');
    await saveAnalysisPrompt(port, true); // the Settings checkbox turned back on
    expect(await readAnalysisPrompt(port)).toBe('ask');
  });
});
