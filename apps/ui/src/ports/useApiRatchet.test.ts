// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR 0770: a feature declares the one port it uses with `usePort`, not the whole `NarrationApi` facade with `useApi()`.
// This scan counts, per source file outside `src/api/` and `src/ports/` (tests and stories excluded), how many times it
// calls `useApi()`. A count may only fall: a file with no entry, or a count above its entry, fails; an entry above the real
// count fails too, so it is lowered (or deleted at zero) in the same change as the move to `usePort`.
const SRC = join(process.cwd(), 'src');
const CALL = /\buseApi\(\)/g;

// Calls to `useApi()` per file, at the time of SN-S5.
const CEILING: Record<string, number> = {
  'src/App.tsx': 1,
  'src/components/assets/LocalAssetRow.tsx': 1,
  'src/components/assets/LocalAssets.tsx': 1,
  'src/components/booth/BoothPage.tsx': 2,
  'src/components/booth/BoothSession.tsx': 1,
  'src/components/booth/BuiltinRecorder.tsx': 1,
  'src/components/booth/CompanionShell.tsx': 2,
  'src/components/booth/CompanionThisChapter.tsx': 1,
  'src/components/booth/ReaderFlagsPanel.tsx': 1,
  'src/components/booth/ResumePrompt.tsx': 1,
  'src/components/booth/companion/CompanionHost.tsx': 1,
  'src/components/booth/companion/CompanionPage.tsx': 1,
  'src/components/booth/useBoothRecording.ts': 1,
  'src/components/booth/useInputLevel.ts': 1,
  'src/components/booth/useReadAloudReaperState.ts': 1,
  'src/components/booth/useRecordInReaper.ts': 1,
  'src/components/booth/useRecorder.ts': 2,
  'src/components/booth/useResumeLocate.ts': 1,
  'src/components/booth/useTeleprompterSession.ts': 1,
  'src/components/credits/CreditsSetupBanner.tsx': 1,
  'src/components/credits/CreditsSetupDialog.tsx': 1,
  'src/components/editing/CleanupAction.tsx': 2,
  'src/components/editing/EditingCandidateRow.tsx': 1,
  'src/components/editing/EditingCheckPanel.tsx': 2,
  'src/components/engine/ChapterLinksTable.tsx': 1,
  'src/components/engine/ChapterSyncPanel.tsx': 1,
  'src/components/engine/ChapterTagsDialog.tsx': 1,
  'src/components/engine/CleanupToolsDialog.tsx': 1,
  'src/components/engine/CreateChapterRegionsDialog.tsx': 1,
  'src/components/engine/EnginePanel.tsx': 1,
  'src/components/engine/LinkChaptersDialog.tsx': 1,
  'src/components/engine/RenderConfigDialog.tsx': 1,
  'src/components/engine/RetakeLanesDialog.tsx': 1,
  'src/components/layout/useNavCounts.ts': 1,
  'src/components/master/BookChecklist.tsx': 1,
  'src/components/master/DiagnosticsSection.tsx': 1,
  'src/components/master/MasterQcPage.tsx': 1,
  'src/components/master/MasteringChain.tsx': 1,
  'src/components/master/ReportExportPanel.tsx': 1,
  'src/components/master/useExportJobs.ts': 1,
  'src/components/pickups/PickupsPage.tsx': 1,
  'src/components/pickups/usePickupsState.ts': 1,
  'src/components/production/ChapterTrackPanel.tsx': 1,
  'src/components/production/ManuscriptImport.tsx': 1,
  'src/components/production/RecordingCheck.tsx': 2,
  'src/components/production/RecordingCheckReport.tsx': 1,
  'src/components/production/useChapterTools.tsx': 1,
  'src/components/project/NewProjectDialog.tsx': 1,
  'src/components/project/ProjectPicker.tsx': 1,
  'src/components/proof/ApplyFxDialog.tsx': 1,
  'src/components/proof/AuditionDialog.tsx': 1,
  'src/components/proof/ChapterWaveformCard.tsx': 1,
  'src/components/proof/CompareRun.tsx': 1,
  'src/components/proof/FindingDetail.tsx': 1,
  'src/components/proof/NativeTakesPanel.tsx': 2,
  'src/components/proof/NotesHeader.tsx': 1,
  'src/components/proof/PreviewPanel.tsx': 1,
  'src/components/proof/ProofChapterPage.tsx': 1,
  'src/components/proof/ProofPage.tsx': 1,
  'src/components/proof/ReaperControls.tsx': 1,
  'src/components/proof/TakeComparisonDialog.tsx': 1,
  'src/components/proof/TakeReviewReads.tsx': 1,
  'src/components/proof/TakeReviewScanDialog.tsx': 1,
  'src/components/proof/TakesPanel.tsx': 1,
  'src/components/proof/spot/SpotTakes.tsx': 1,
  'src/components/proof/useProofingRender.ts': 1,
  'src/components/proof/useReadNavigation.ts': 1,
  'src/components/proof/useReaperStatus.ts': 1,
  'src/components/proof/useWorkspaceReaper.ts': 1,
  'src/components/series/SeriesTab.tsx': 1,
  'src/components/settings/CreditsPanel.tsx': 1,
  'src/components/settings/DawCatalogPanel.tsx': 1,
  'src/components/settings/DeliveryProfilesPanel.tsx': 1,
  'src/components/settings/KeyboardPanel.tsx': 1,
  'src/components/settings/OnlineDictionaryPanel.tsx': 1,
  'src/components/settings/RetailSamplePanel.tsx': 1,
  'src/components/settings/Settings.tsx': 1,
  'src/components/settings/UpdateDownloadDialog.tsx': 1,
  'src/components/settings/UpdatesPanel.tsx': 1,
  'src/components/stages/useStageRecommendations.ts': 1,
  'src/components/storybible/CommonsAudioLookup.tsx': 1,
  'src/components/storybible/DialogueCueAttribution.tsx': 1,
  'src/components/storybible/Guide.tsx': 1,
  'src/components/storybible/GuideDetail.tsx': 1,
  'src/components/storybible/OnlinePronunciationLookup.tsx': 1,
  'src/components/storybible/PronunciationQueries.tsx': 1,
  'src/components/storybible/VoiceDataPanel.tsx': 1,
  'src/components/storybible/VoiceReferencesSection.tsx': 1,
  'src/components/storybible/source/NamePronunciation.tsx': 1,
  'src/input/useDawRecording.ts': 1,
  'src/useCapability.ts': 1,
  'src/useDawKind.ts': 1,
};

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|stories)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function actual(): Record<string, number> {
  const counts: Record<string, number> = {
    'src/App.tsx': 1,
    'src/components/assets/LocalAssetRow.tsx': 1,
    'src/components/assets/LocalAssets.tsx': 1,
    'src/components/booth/BoothPage.tsx': 2,
    'src/components/booth/BoothSession.tsx': 1,
    'src/components/booth/BuiltinRecorder.tsx': 1,
    'src/components/booth/CompanionShell.tsx': 2,
    'src/components/booth/CompanionThisChapter.tsx': 1,
    'src/components/booth/ReaderFlagsPanel.tsx': 1,
    'src/components/booth/ResumePrompt.tsx': 1,
    'src/components/booth/useBoothRecording.ts': 1,
    'src/components/booth/useInputLevel.ts': 1,
    'src/components/booth/useReadAloudReaperState.ts': 1,
    'src/components/booth/useRecordInReaper.ts': 1,
    'src/components/booth/useRecorder.ts': 2,
    'src/components/booth/useResumeLocate.ts': 1,
    'src/components/booth/useTeleprompterSession.ts': 1,
    'src/components/credits/CreditsSetupBanner.tsx': 1,
    'src/components/credits/CreditsSetupDialog.tsx': 1,
    'src/components/editing/CleanupAction.tsx': 2,
    'src/components/editing/EditingCandidateRow.tsx': 1,
    'src/components/editing/EditingCheckPanel.tsx': 2,
    'src/components/engine/ChapterLinksTable.tsx': 1,
    'src/components/engine/ChapterSyncPanel.tsx': 1,
    'src/components/engine/ChapterTagsDialog.tsx': 1,
    'src/components/engine/CleanupToolsDialog.tsx': 1,
    'src/components/engine/CreateChapterRegionsDialog.tsx': 1,
    'src/components/engine/EnginePanel.tsx': 1,
    'src/components/engine/LinkChaptersDialog.tsx': 1,
    'src/components/engine/RenderConfigDialog.tsx': 1,
    'src/components/engine/RetakeLanesDialog.tsx': 1,
    'src/components/layout/useNavCounts.ts': 1,
    'src/components/master/BookChecklist.tsx': 1,
    'src/components/master/DiagnosticsSection.tsx': 1,
    'src/components/master/MasterQcPage.tsx': 1,
    'src/components/master/MasteringChain.tsx': 1,
    'src/components/master/ReportExportPanel.tsx': 1,
    'src/components/master/useExportJobs.ts': 1,
    'src/components/pickups/PickupsPage.tsx': 1,
    'src/components/pickups/usePickupsState.ts': 1,
    'src/components/production/ChapterTrackPanel.tsx': 1,
    'src/components/production/ManuscriptImport.tsx': 1,
    'src/components/production/RecordingCheck.tsx': 2,
    'src/components/production/RecordingCheckReport.tsx': 1,
    'src/components/production/useChapterTools.tsx': 1,
    'src/components/project/NewProjectDialog.tsx': 1,
    'src/components/project/ProjectPicker.tsx': 1,
    'src/components/proof/ApplyFxDialog.tsx': 1,
    'src/components/proof/AuditionDialog.tsx': 1,
    'src/components/proof/ChapterWaveformCard.tsx': 1,
    'src/components/proof/CompareRun.tsx': 1,
    'src/components/proof/FindingDetail.tsx': 1,
    'src/components/proof/NativeTakesPanel.tsx': 2,
    'src/components/proof/NotesHeader.tsx': 1,
    'src/components/proof/PreviewPanel.tsx': 1,
    'src/components/proof/ProofChapterPage.tsx': 1,
    'src/components/proof/ProofPage.tsx': 1,
    'src/components/proof/ReaperControls.tsx': 1,
    'src/components/proof/TakeComparisonDialog.tsx': 1,
    'src/components/proof/TakeReviewReads.tsx': 1,
    'src/components/proof/TakeReviewScanDialog.tsx': 1,
    'src/components/proof/TakesPanel.tsx': 1,
    'src/components/proof/useProofingRender.ts': 1,
    'src/components/proof/useReadNavigation.ts': 1,
    'src/components/proof/useReaperStatus.ts': 1,
    'src/components/proof/useWorkspaceReaper.ts': 1,
    'src/components/series/SeriesTab.tsx': 1,
    'src/components/settings/CreditsPanel.tsx': 1,
    'src/components/settings/DawCatalogPanel.tsx': 1,
    'src/components/settings/DeliveryProfilesPanel.tsx': 1,
    'src/components/settings/KeyboardPanel.tsx': 1,
    'src/components/settings/OnlineDictionaryPanel.tsx': 1,
    'src/components/settings/RetailSamplePanel.tsx': 1,
    'src/components/settings/Settings.tsx': 1,
    'src/components/settings/UpdateDownloadDialog.tsx': 1,
    'src/components/settings/UpdatesPanel.tsx': 1,
    'src/components/stages/useStageRecommendations.ts': 1,
    'src/components/storybible/CommonsAudioLookup.tsx': 1,
    'src/components/storybible/DialogueCueAttribution.tsx': 1,
    'src/components/storybible/Guide.tsx': 1,
    'src/components/storybible/GuideDetail.tsx': 1,
    'src/components/storybible/OnlinePronunciationLookup.tsx': 1,
    'src/components/storybible/PronunciationQueries.tsx': 1,
    'src/components/storybible/VoiceDataPanel.tsx': 1,
    'src/components/storybible/VoiceReferencesSection.tsx': 1,
    'src/components/storybible/source/NamePronunciation.tsx': 1,
    'src/input/useDawRecording.ts': 1,
    'src/useCapability.ts': 1,
    'src/useDawKind.ts': 1,
  };
  for (const file of sources(SRC)) {
    const rel = relative(process.cwd(), file).split(sep).join('/');
    if (rel.startsWith('src/api/') || rel.startsWith('src/ports/')) continue;
    const calls =
      readFileSync(file, 'utf8')
        .replace(/\/\/.*$/gm, '')
        .match(CALL)?.length ?? 0;
    if (calls > 0) counts[rel] = calls;
  }
  return counts;
}

describe('whole-facade useApi() ratchet', () => {
  it('whole-facade-ratchet-lists-every-caller: no new caller, no higher count, no stale entry', () => {
    const real = actual();
    const problems: string[] = [];
    for (const [file, count] of Object.entries(real)) {
      const ceiling = CEILING[file];
      if (ceiling === undefined) problems.push(`${file} calls useApi() ${count}x with no entry: declare the port with \`usePort\` instead.`);
      else if (count > ceiling) problems.push(`${file} calls useApi() ${count}x, above its entry of ${ceiling}: declare the port with \`usePort\` instead.`);
    }
    for (const [file, ceiling] of Object.entries(CEILING)) {
      const count = real[file] ?? 0;
      if (count < ceiling)
        problems.push(`${file} calls useApi() ${count}x, below its entry of ${ceiling}: lower the entry${count === 0 ? ' (delete it)' : ''}.`);
    }
    expect(problems).toEqual([]);
  });
});
