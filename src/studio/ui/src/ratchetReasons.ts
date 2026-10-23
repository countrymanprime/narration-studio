// What keeps each file that still has an entry in the three per-file ratchets of the Studio Next series (SN-C4): the raw
// native elements (`rawNatives.test.ts`), the direct icon imports (`iconImports.test.ts`) and the
// `useApi()` calls (`ports/useApiRatchet.test.ts`). Each of those tests calls `unexplained()` with its own
// entries, so a file cannot gain an entry, or keep one, without a line here.
//
// KEPT is a feature the Studio Next mock does not draw, left as built on purpose, with the decision that says so.
// GAPS is a file that a page swap should have rebuilt or deleted and that still has an entry: the swap left it behind. A gap is not a reason; it
// is the evidence of a miss, listed so it is counted: `rawNatives.test.ts` pins the count, so a new offender cannot be added here. SN-C4 owns no component, so it records the gaps
// and a fixer slice removes them, then deletes the line here and the entry in the ratchet.

const COMPANION = 'the Companion window has no page in the mock and stays as built (DQ-13, SN0-Q5)';
const VOICE_BIBLE =
  'a Story Bible feature the mock does not draw (properties, dialogue cues, Commons and online pronunciation lookup), kept as built (DQ-12, SN0-Q5)';
const ENGINE = 'the engine panel (DAW link, chapter sync, render) has no page in the mock and stays as built';
const PICKER = 'the project picker and the start-up screens come before any Studio Next page and stay as built';
const CREDITS = 'the credits cards stay in the Script page and the manuscript import (the SN-B8 default)';
const TIMER = 'the stage timer, PFH and the effective rate stay as built (DQ-3, SN0-Q4)';

export const KEPT: Readonly<Record<string, string>> = {
  'src/components/booth/CompanionShell.tsx': COMPANION,
  'src/components/booth/CompanionThisChapter.tsx': COMPANION,
  'src/components/booth/ReaderText.tsx': COMPANION,
  'src/components/booth/ResumePrompt.tsx': COMPANION,
  'src/components/booth/companion/CompanionHost.tsx': COMPANION,
  'src/components/booth/companion/CompanionPage.tsx': COMPANION,
  'src/components/booth/useRecordInReaper.ts': COMPANION,
  'src/components/booth/useResumeLocate.ts': COMPANION,
  'src/components/credits/CreditsSetupBanner.tsx': CREDITS,
  'src/components/credits/CreditsSetupDialog.tsx': CREDITS,
  'src/components/engine/ChapterLinksTable.tsx': ENGINE,
  'src/components/engine/ChapterSyncPanel.tsx': ENGINE,
  'src/components/engine/ChapterTagsDialog.tsx': ENGINE,
  'src/components/engine/CleanupToolsDialog.tsx': ENGINE,
  'src/components/engine/CreateChapterRegionsDialog.tsx': ENGINE,
  'src/components/engine/EnginePanel.tsx': ENGINE,
  'src/components/engine/LinkChaptersDialog.tsx': ENGINE,
  'src/components/engine/RenderConfigDialog.tsx': ENGINE,
  'src/components/engine/RetakeLanesDialog.tsx': ENGINE,
  'src/components/layout/StartupScreen.tsx': PICKER,
  'src/components/layout/TimerChip.tsx': TIMER,
  'src/components/project/NewProjectDialog.tsx': PICKER,
  'src/components/project/ProjectPicker.tsx': PICKER,
  'src/components/storybible/CommonsAudioLookup.tsx': VOICE_BIBLE,
  'src/components/storybible/DialogueCueAttribution.tsx': VOICE_BIBLE,
  'src/components/storybible/OnlinePronunciationLookup.tsx': VOICE_BIBLE,
  'src/components/storybible/PropertiesSection.tsx': VOICE_BIBLE,
  'src/components/storybible/VoiceDataPanel.tsx': VOICE_BIBLE,
  'src/components/storybible/VoiceReferencesSection.tsx': VOICE_BIBLE,
};

/** Files a swap left with an entry (in a rebuilt folder, or used only by one). `ratchetReasons` tests pin the count: it only goes down. */
export const GAPS: readonly string[] = [
  'src/components/booth/useBoothRecording.ts',
  'src/components/booth/useRecorder.ts',
  'src/components/booth/useTeleprompterSession.ts',
  'src/components/editing/CleanupAction.tsx',
  'src/components/editing/EditingCheckPanel.tsx',
  'src/components/editing/takes/prep/usePrepSteps.tsx',
  'src/components/layout/AppShell.tsx',
  'src/components/layout/LoadError.tsx',
  'src/components/layout/useNavCounts.ts',
  'src/components/master/DeliveryProfilePanel.tsx',
  'src/components/master/DiagnosticsSection.tsx',
  'src/components/master/MasteringChain.tsx',
  'src/components/master/ReportExportPanel.tsx',
  'src/components/master/RuleBadges.tsx',
  'src/components/master/useExportJobs.ts',
  'src/components/pickups/usePickupsState.ts',
  'src/components/production/ChapterTrackPanel.tsx',
  'src/components/production/ManuscriptImport.tsx',
  'src/components/production/RecordingCheck.tsx',
  'src/components/production/RecordingCheckReport.tsx',
  'src/components/production/useChapterSyncToast.ts',
  'src/components/production/useChapterTools.tsx',
  'src/components/proof/AuditionDialog.tsx',
  'src/components/proof/CompareRun.tsx',
  'src/components/proof/NativeTakesPanel.tsx',
  'src/components/proof/PreviewPanel.tsx',
  'src/components/proof/ProofChapterPage.tsx',
  'src/components/proof/ProoferSheet.tsx',
  'src/components/proof/spot/SpotTakes.tsx',
  'src/components/proof/useProofingRender.ts',
  'src/components/settings/CreditsPanel.tsx',
  'src/components/settings/DeliveryProfilesPanel.tsx',
  'src/components/settings/KeyboardPanel.tsx',
  'src/components/settings/RetailSamplePanel.tsx',
  'src/components/settings/UpdateDownloadDialog.tsx',
  'src/components/settings/UpdatesPanel.tsx',
  'src/components/storybible/Guide.tsx',
  'src/components/storybible/GuideDetail.tsx',
  'src/components/stages/useStageRecommendations.ts',
  'src/components/storybible/source/NamePronunciation.tsx',
];

const gaps = new Set(GAPS);

/**
 * The entries of one ratchet that no line explains: a file under `src/components/` that is in neither KEPT nor GAPS. Files outside
 * `src/components/` (the composition root, shared hooks) are not a page's and need no line.
 */
export function unexplained(entries: readonly string[]): string[] {
  return entries.filter((file) => {
    if (!file.startsWith('src/components/')) return false;
    return !(file in KEPT) && !gaps.has(file);
  });
}
