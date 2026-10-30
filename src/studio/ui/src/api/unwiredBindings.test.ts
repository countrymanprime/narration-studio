import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMockApi } from './mockApi';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'api' || name === 'fixtures' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\./.test(name) && !/\.(catalog|fixtures?)\.ts$/.test(name) ? [path] : [];
  });
}

/**
 * Host bindings no screen calls (audit cluster 25, docs/research/ui-function-audit/inventory-shell.md section 1.7): either retired or never
 * wired. The list only shrinks: wire a binding (or delete it from the host) and take its name out, and a new binding cannot arrive without a caller.
 */
const UNWIRED = [
  'assetsVerify',
  'chapterSuggestion',
  'chapterTrackMapClear',
  'chaptersForTracks',
  'dawLiveItems',
  'dawPreviewFileRange',
  'dawRevealFile',
  'findingsGoToRead',
  'findingsLoopRead',
  'findingsReaperStatus',
  'manuscriptReader',
  'manuscriptSearch',
  'masteringChooseProvider',
  'pickupsNext',
  'productionBurndown',
  'projectStateState',
  'recorderChooseEngine',
  'recorderMeterStart',
  'recorderMeterStop',
  'recorderStart',
  'recorderStop',
  'replaceNarratorRemove',
  'seriesDelete',
  'seriesList',
  'seriesSave',
  'subscribeDawProjectState',
  'subscribeRecorderLevel',
  'systemCopyDiagnostics',
  'systemOpenLogFolder',
  'takeComparisonCancel',
  'takeComparisonStart',
  'takeComparisonState',
  'takeReviewCreateTake',
  'takeReviewScanCancel',
  'takeReviewScanStart',
  'takeReviewScanState',
  'teleprompterPunch',
  'teleprompterPunchPreview',
  'transcriptAddEquivalence',
  'transcriptJump',
  'ttsCatalog',
  'ttsRemove',
  'whisperCatalog',
  'whisperRemove',
  'workspaceTakesCompareStart',
];

const root = join(__dirname, '..');
const text = sources(root)
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');
const called = (name: string) => new RegExp(`\\b${name}\\b`).test(text);

describe('no-binding-arrives-without-a-screen-that-calls-it', () => {
  it('every host binding is called by a screen, or is on the shrinking list of unwired ones', () => {
    const bindings = Object.keys(createMockApi()).filter((name) => typeof (createMockApi() as Record<string, unknown>)[name] === 'function');
    const uncalled = bindings.filter((name) => !called(name)).sort();
    expect(uncalled).toEqual([...UNWIRED].sort());
  });
});
