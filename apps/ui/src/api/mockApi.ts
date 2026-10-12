// Browser/mock API. It deliberately uses the same literal fixture data
// everywhere so visual review never silently exercises placeholder
// content instead of the screen we are trying to match.
//
// Each feature area's bindings live in their own file under mockHost/ (the state they share is mockHost/state.ts);
// this file only puts them together, with the per-feature mocks beside it (teleprompterMock.ts, coverageMock.ts, ...).
import type { Finding, NarrationApi } from '../types';
import { WIRE_FINDINGS, WIRE_TELEPROMPTER_DEVICES, WIRE_TRACKS_PROJECT } from './mockFixtures';
import { mockChapterTrackMatch } from './chapterTrackMatchMock';
import { createTeleprompterMock } from './teleprompterMock';
import { createCoverageMock } from './coverageMock';
import { createWorkspaceMock, mockMisreadFindingSource } from './workspaceMock';
import { createPreviewMock } from './previewMock';
import { createProductionMock } from './productionMock';
import { createStagesMock } from './stagesMock';
import { createProofingRenderMock } from './proofingRenderMock';
import { createDawMock } from './dawMock';
import { createProvidersMock } from './providersMock';
import { createMasteringMock } from './masteringMock';
import { createRecordingMock } from './recordingMock';
import { createFindingsMock } from './findingsMock';
import { createTakeReviewScanMock } from './takeReviewMock';
import { createTakeComparisonMock } from './takeComparisonMock';
import { createWorkspaceTakesMock } from './workspaceTakesMock';
import { createTakeEvidenceMock } from './takeEvidenceMock';
import { createMeasureMock } from './measureMock';
import { createRenderEncodeMasterMock } from './renderEncodeMasterMock';
import { DELIVERY_REVIEW_ANALYZER, mockDeliveryReviewFindings, resavingAfterProfileChange } from './deliveryReviewMock';
import { createDeliveryProfilesMock } from './deliveryProfilesMock';
import { createDiagnosticsMock } from './diagnosticsMock';
import { createEditingMock, type EditingChoices } from './editingMock';
import { createCleanupActionMock } from './cleanupActionMock';
import { createBookmarksMock } from './bookmarksMock';
import { createPassageMapMock } from './passageMapMock';
import { createEditLogMock } from './editLogMock';
import { createMarksMock } from './marksMock';
import { createScriptPrepMock } from './scriptPrepMock';
import { createExtractionMock } from './extractionMock';
import { createEditCutsMock } from './editCutsMock';
import { createWordFxMock } from './wordFxMock';
import { createMockState, type MockApiSeed } from './mockHost/state';
import { createUpdateMock } from './mockHost/update';
import { createProjectMock } from './mockHost/project';
import { createSettingsMock } from './mockHost/settings';
import { createManuscriptMock } from './mockHost/manuscript';
import { createCreditsMock } from './mockHost/credits';
import { createAssetsMock } from './mockHost/assets';
import { createProofingMock } from './mockHost/proofing';
import { createReaperActionsMock } from './mockHost/reaperActions';
import { createChapterTracksMock } from './mockHost/chapterTracks';
import { createStoryBibleMock } from './mockHost/storyBible';
import { createCharacterMock } from './mockHost/character';
import { createSeriesMock } from './mockHost/series';
import { createSystemMock, invalidPayloadOverrides } from './mockHost/system';
import { createPronunciationLookupMock } from './mockHost/pronunciationLookup';
import { createPronunciationCommonsAudioMock } from './mockHost/wiktextractCommonsAudio';
import { createPronunciationOnlineMock } from './mockHost/pronunciationOnline';
import { createWorkspaceSnapMock } from './workspaceSnapMock';
import { createPronunciationSourcesMock } from './pronunciationSourcesMock';
import type { DawCapabilitiesApi, DawDeleteRangeApi, DawFxRangeApi, DawHideTakesApi, DawResult, DawRollApi } from './contracts/daw';
import type { WorkspaceApi } from './contracts/workspace';
import { DAW_ANSWERS, fxRangeOf, fxRangeRemovedOf, plainChainName, rangeCutOf, rolledOf, takesHiddenOf } from '../fixtures/daw';

export { applyMixedManuscriptMock } from './mockHost/manuscript';
export type { MockUpdateSeed } from './mockHost/update';

// `?mockEngine=builtin` seeds the mock recorder's engine choice (ADR 0455): the host answers the
// project's engine in RecorderState, and the mock answers it from this flag, so the story, the visual rows and the demo
// reach the "Built-in recorder" chip and the Booth's recorder without a click. No window (a node test) is REAPER.
function mockEngineFromLocation(): 'daw' | 'builtin' {
  if (typeof window === 'undefined') return 'daw';
  return new URLSearchParams(window.location.search).get('mockEngine') === 'builtin' ? 'builtin' : 'daw';
}

export function createMockApi(
  overrides: Partial<NarrationApi> = {},
  // manuscriptCandidate boots a project with no imported manuscript but a
  // manuscript file waiting in its folder (Home offers to import it, ADR-0019).
  // teleprompter boots with a session already part-way through the first chapter.
  initial: MockApiSeed = {},
): NarrationApi {
  const s = createMockState(initial);
  const { endJob } = s;
  const update = createUpdateMock(initial);
  const project = createProjectMock(initial);
  const settings = createSettingsMock(() => base.bootstrap());
  const manuscript = createManuscriptMock(s, initial, { withMeasurement: (chapter) => withMeasurement(chapter) });
  const { manuscriptReady } = manuscript;
  const credits = createCreditsMock(s, initial, { settings: settings.settings, manuscriptReady });
  const assets = createAssetsMock(initial);
  const proofing = createProofingMock(s, assets);
  const reaperActions = createReaperActionsMock(initial, project.projectFolder);
  const chapterTracks = createChapterTracksMock(s, initial, {
    manuscriptReady,
    dawFileLinked: project.dawFileLinked,
    peekCoverage: (chapterId) => peekCoverage(chapterId),
  });
  const storyBible = createStoryBibleMock(s, initial, manuscriptReady, assets);
  const character = createCharacterMock(s);
  const series = createSeriesMock(s, (characterId) => s.entities.find((entity) => entity.id === characterId)?.canonical_name);
  const teleprompter = createTeleprompterMock({
    ready: manuscriptReady,
    chapters: () => s.chapters,
    paragraphs: () => s.paragraphs,
    creditsText: credits.mockCreditsText,
    assetRequired: assets.teleprompterAssetRequired,
    trackMatch: (chapterId) => mockChapterTrackMatch(chapterId, s.chapters, WIRE_TRACKS_PROJECT, s.chapterTrackMappings),
    tracksProject: WIRE_TRACKS_PROJECT,
    seed: initial.teleprompter,
    devices: initial.teleprompterDevices ?? WIRE_TELEPROMPTER_DEVICES,
    ...(initial.teleprompterLevel === undefined ? {} : { level: initial.teleprompterLevel }),
    ...(initial.reaperState ? { reaper: initial.reaperState } : {}),
    ...(initial.reaperInput ? { reaperInput: initial.reaperInput } : {}),
    resume: initial.resume,
  });
  const {
    withMeasurement,
    peekResult: peekCoverage,
    ...coverage
  } = createCoverageMock({
    chapters: () => s.chapters,
    assetRequired: assets.whisperAssetRequired,
    engines: assets.coverageEngines,
    saveFinding: (finding) => saveFinding(finding),
    // A finished check changes its chapter's status row, so chaptersync:state goes out again.
    endJob: (event) => {
      endJob(event);
      chapterTracks.publishChapterSync(chapterTracks.mockChapterSyncState(null));
    },
    seed: initial.coverage,
  });
  // workspaceLooping mirrors findingNavigation.loopingID for a workspace loop (bindings_workspace.go): set by
  // workspaceLoop, read by findingsReaperStatus and cleared by findingsStopLoop below, so the workspace's own loop
  // is remembered the same way a finding's is (one app loop at a time, whichever page started it).
  const workspaceLooping: { current: string | undefined } = { current: undefined };
  const workspaceDeps = {
    chapters: () => s.chapters,
    paragraphs: () => s.paragraphs,
    coverageResult: peekCoverage,
    project: WIRE_TRACKS_PROJECT,
    mappings: () => s.chapterTrackMappings,
    reaper: initial.reaper,
    looping: workspaceLooping,
  };
  const workspace = createWorkspaceMock(workspaceDeps);
  const preview = createPreviewMock({ chapters: () => s.chapters, paragraphs: () => s.paragraphs }, initial.preview);
  const daw = createDawMock(initial.daw);
  const providers = createProvidersMock(initial.providers);
  const mastering = createMasteringMock(initial.mastering);
  // The engine chip's `?mockEngine=builtin` flag seeds the recorder's engine, so the chip and the Booth agree (ADR 0455).
  const recording = createRecordingMock({ engine: mockEngineFromLocation(), ...initial.recording });
  // The per-chapter editing source choice: shared between the stages mock (which signal a chapter's editing
  // check reads) and the editing mock (editingSourceChoice/editingSetSourceChoice below), so switching a chapter's
  // source there is visible on its editing signals here, the same live wiring a real host has through the same
  // project sidecar.
  const editingChoices: EditingChoices = new Map();
  const stages = createStagesMock({
    ready: manuscriptReady,
    chapters: () => s.chapters.map(withMeasurement),
    setStatus: (chapterId, status) => {
      s.chapters = s.chapters.map((chapter) => (chapter.id === chapterId ? { ...chapter, status } : chapter));
    },
    editingSourceChoice: (chapterId) => editingChoices.get(chapterId) ?? 'items',
    seed: initial.stages,
  });
  // A transcript_discrepancy finding for chapter-1's own deterministic mock misread: built from the same position workspaceMock.ts already timed it at, so this finding and the workspace's
  // check-derived misread flag are the same event, merged by overlayFindings into one reviewable flag. Computed fresh on every findings read
  // (FindingsMockOptions.lazySeed), not once at boot: chapter-1 usually has no track link yet when this mock is
  // built (the narrator, or the visual suite's own driver, confirms one in the audio engine panel after the app has already
  // started), so a one-off boot-time computation would see no live item and never find this finding a home.
  const workspaceOverlayFinding = (): Finding[] => {
    const source = mockMisreadFindingSource(workspaceDeps, 'chapter-1');
    if (!source) return [];
    return [
      {
        schema_version: 1,
        id: 'workspace-overlay-chapter-1',
        analyzer: 'transcript-compare',
        project: { path: WIRE_TRACKS_PROJECT.path },
        source: { file: WIRE_TRACKS_PROJECT.tracks[0]?.items[0]?.sourceFile, item_guid: source.itemGuid },
        time_range: { start: source.start, end: source.end, source_start: source.start, source_end: source.end },
        manuscript: { chapter_id: 'chapter-1', chapter_title: s.chapters.find((candidate) => candidate.id === 'chapter-1')?.title, recorded: source.heard },
        category: 'transcript_discrepancy',
        severity: 'warning',
        confidence: 0.82,
        confidence_reason: 'compare.py measured a clear pause at this discrepancy’s audio boundary — stronger secondary evidence, not proof of a misread.',
        evidence_version: 'sha256:workspace-overlay-chapter-1',
        review: { status: 'unreviewed' },
      },
    ];
  };
  const production = createProductionMock({
    chapters: manuscript.bindings.manuscriptChapters,
    recommendations: stages.stageRecommendations,
    seed: initial.production,
  });
  const { saveAnalyzerFindings, saveFinding, saveFileFindings, ...findings } = createFindingsMock(initial.findings ?? WIRE_FINDINGS, {
    rerunAfterFirstList: initial.findingsRerun,
    reaper: initial.reaper,
    // Only the default seed demonstrates the overlay; a caller supplying its own findings (most tests) opts out, as
    // it already does for WIRE_FINDINGS itself.
    ...(initial.findings ? {} : { lazySeed: workspaceOverlayFinding }),
  });
  const takeReviewScan = createTakeReviewScanMock(saveAnalyzerFindings, endJob, initial.takeReviewScanHold);
  const { beginPassageComparison, ...takeComparison } = createTakeComparisonMock(
    { get: findings.findingsGet, save: saveFinding },
    endJob,
    initial.takeComparisonHold,
  );
  const workspaceTakes = createWorkspaceTakesMock({
    alignment: workspace.workspaceAlignment,
    paragraphs: () => s.paragraphs,
    chapterTitle: (chapterId) => s.chapters.find((chapter) => chapter.id === chapterId)?.title ?? 'Chapter',
    comparison: async (findingId) => (await findings.findingsList({ analyzer: 'take-comparison' })).findings.find((finding) => finding.id === findingId),
    beginPassageComparison,
    reaper: initial.reaper,
  });
  const measurePicked = new Set<string>();
  const { recordMeasurement: recordRenderMeasurement, ...proofingRender } = createProofingRenderMock({
    ready: manuscriptReady,
    chapters: () => s.chapters,
    picked: measurePicked,
    seed: initial.proofingRender,
  });
  const { current: deliveryProfile, all: deliveryProfilesAll, ...deliveryProfiles } = createDeliveryProfilesMock(initial.deliveryProfile);
  const { peekDiagnostics, ...diagnostics } = createDiagnosticsMock(endJob, measurePicked, initial.diagnostics);
  const editing = createEditingMock(initial.editing, editingChoices);
  const cleanupAction = createCleanupActionMock(
    async (chapterId) => (await findings.findingsList({ analyzer: 'editing', chapterId })).findings,
    initial.cleanupAction,
  );
  const { resaveReview, ...measurement } = createMeasureMock(endJob, initial.measure, measurePicked, deliveryProfile, peekDiagnostics, (job) => {
    const review = mockDeliveryReviewFindings(job);
    saveFileFindings(DELIVERY_REVIEW_ANALYZER, review.files, review.findings);
    recordRenderMeasurement(job.files);
  });
  const renderEncodeMaster = createRenderEncodeMasterMock(endJob, initial.renderExport, deliveryProfile, deliveryProfilesAll, initial.renderPackageMulti);
  const system = createSystemMock(s, initial, {
    version: update.version,
    project,
    transcript: proofing.transcript,
    dictionaryState: assets.dictionaryState,
  });
  const base: NarrationApi = {
    ...system.bindings,
    ...manuscript.bindings,
    ...settings.bindings,
    ...storyBible.bindings,
    ...character.bindings,
    ...series.bindings,
    ...assets.bindings,
    ...proofing.bindings,
    ...reaperActions.bindings,
    ...project.bindings,
    ...credits.bindings,
    ...chapterTracks.bindings,
    ...takeReviewScan,
    ...takeComparison,
    ...measurement,
    ...renderEncodeMaster,
    ...resavingAfterProfileChange(deliveryProfiles, resaveReview),
    ...diagnostics,
    ...editing,
    // Reads the same findings store FindingsReview decides against (apps/desktop/internal/editing/scan.go's
    // Candidates), not editingMock's own state: a candidate is seeded like any other finding (`initial.findings`,
    // editingCandidateFor in mockFixtures.ts), so Accept/Dismiss/Defer on it go through the real review binding.
    editingCandidates: async (chapterId) => (await findings.findingsList({ analyzer: 'editing', chapterId })).findings,
    ...cleanupAction,
    ...createBookmarksMock(
      manuscriptReady,
      () => s.chapters,
      () => s.paragraphs,
    ),
    ...createEditLogMock(
      manuscriptReady,
      () => s.chapters,
      () => s.paragraphs,
    ),
    ...createMarksMock(
      manuscriptReady,
      () => s.chapters,
      () => s.paragraphs,
    ),
    ...createScriptPrepMock(
      manuscriptReady,
      () => s.chapters,
      () => s.paragraphs,
    ),
    ...createExtractionMock(endJob),
    ...createEditCutsMock(
      manuscriptReady,
      () => s.chapters,
      () => s.paragraphs,
    ),
    ...createWordFxMock(
      manuscriptReady,
      () => s.chapters,
      () => s.paragraphs,
    ),
    ...createPassageMapMock(
      manuscriptReady,
      () => s.chapters,
      () => s.paragraphs,
    ),
    takeReviewCreateTake: async (request) => ({
      targetItemGuid: request.targetItemGuid,
      newTakeGuid: '{99999999-0000-4000-8000-000000000099}',
    }),
    ...update.bindings,
    ...teleprompter,
    ...coverage,
    ...workspace,
    ...workspaceTakes,
    ...createTakeEvidenceMock(workspaceTakes),
    ...preview,
    ...stages,
    ...proofingRender,
    ...production,
    ...findings,
    // Merge the workspace's own loop into the shared REAPER status/stop, after ...findings so these win: one app
    // loop at a time, whichever page started it, exactly as the real host's findingNavigation does.
    findingsReaperStatus: async () => {
      const status = await findings.findingsReaperStatus();
      return workspaceLooping.current && status.connection === 'connected' ? { ...status, loopingFindingId: workspaceLooping.current } : status;
    },
    findingsStopLoop: async () => {
      if (workspaceLooping.current === undefined) return findings.findingsStopLoop();
      workspaceLooping.current = undefined;
      return { outcome: 'stopped', restored: 1, kept: 0 };
    },
    ...daw,
    ...createHideTakesMock(daw, workspaceTakes),
    ...createRollMock(daw, (chapterId) => manuscriptReady.then(() => s.chapters.some((chapter) => chapter.id === chapterId))),
    ...createDeleteRangeMock(daw, (chapterId) => manuscriptReady.then(() => s.chapters.some((chapter) => chapter.id === chapterId))),
    ...createFxRangeMock(
      daw,
      (chapterId) => manuscriptReady.then(() => s.chapters.some((chapter) => chapter.id === chapterId)),
      () => workspace.workspaceListFXChains(),
    ),
    ...providers,
    ...mastering,
    ...recording,
    ...createPronunciationLookupMock(),
    ...createPronunciationCommonsAudioMock(),
    ...createPronunciationOnlineMock(),
    ...createWorkspaceSnapMock(),
    ...createPronunciationSourcesMock(),
  };
  const api = initial.invalidPayload ? { ...base, ...invalidPayloadOverrides(initial.invalidPayload, base) } : base;
  return { ...api, ...overrides };
}

/** WorkspaceHideTakes as bindings_workspace_hide.go answers it: the takes capability's sentence first, then the passage's candidates
 * as `workspaceTakes` offers them; an id it does not offer is stale, and only a take of the passage's own item can be kept. */
function createHideTakesMock(daw: DawCapabilitiesApi, takes: Pick<WorkspaceApi, 'workspaceTakes'>): DawHideTakesApi {
  const refused = (sentence: string, stale = false): DawResult => ({
    ok: false,
    changed: false,
    message: sentence,
    undoSteps: 0,
    refused: sentence,
    ...(stale ? { code: 'stale' as const } : {}),
  });
  return {
    workspaceHideTakes: async (chapterId, firstToken, lastToken, keepCandidateId) => {
      const setup = await daw.dawCapabilities();
      const support = setup.capabilities.takes;
      if (!support?.available) return refused(support?.message ?? '');
      const { candidates } = await takes.workspaceTakes(chapterId, firstToken, lastToken);
      const keep = candidates.find((candidate) => candidate.id === keepCandidateId);
      if (!keep) return refused(DAW_ANSWERS.staleHide, true);
      if (keep.source !== 'item_take') return refused(DAW_ANSWERS.hideNotOnItem);
      if (!keep.usable) return refused(keep.reason ?? DAW_ANSWERS.hideNotOnItem);
      const hidden = takesHiddenOf(setup, candidates.filter((candidate) => candidate.source === 'item_take' && candidate.id !== keep.id).length);
      return { ok: true, changed: hidden.changed, message: hidden.message, undoSteps: hidden.changed ? 1 : 0 };
    },
  };
}

const refusedResult = (sentence: string): DawResult => ({ ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence });

/** DawRoll as bindings_daw_roll.go answers it: the punch capability's sentence first, then the time, the chapter (one the manuscript
 * does not have rejects), and the confirmation where punch is destructive; then what the launch's DAW answers a roll. */
function createRollMock(daw: DawCapabilitiesApi, hasChapter: (chapterId: string) => Promise<boolean>): DawRollApi {
  return {
    dawRoll: async (chapterId, at, confirmed) => {
      const setup = await daw.dawCapabilities();
      const support = setup.capabilities.punch;
      if (!support?.available) return refusedResult(support?.message ?? '');
      if (!Number.isFinite(at) || at < 0) return refusedResult(DAW_ANSWERS.rollBadTime);
      if (!(await hasChapter(chapterId))) throw new Error('that chapter is not part of the current manuscript');
      if (support.destructive && !confirmed) return refusedResult(DAW_ANSWERS.rollConfirm);
      const rolled = rolledOf(setup, at);
      return { ok: true, changed: true, message: rolled.message, undoSteps: rolled.undoSteps };
    },
  };
}

/** DawDeleteRange as bindings_daw_range.go answers it: the cut_range capability's sentence first, then the mode and the fade, then a
 * chapter the manuscript does not have or a range read backwards (code stale); then what the launch's DAW answers a cut. */
function createDeleteRangeMock(daw: DawCapabilitiesApi, hasChapter: (chapterId: string) => Promise<boolean>): DawDeleteRangeApi {
  return {
    dawDeleteRange: async (chapterId, firstToken, lastToken, mode, fadeMs) => {
      const setup = await daw.dawCapabilities();
      const support = setup.capabilities.cut_range;
      if (!support?.available) return refusedResult(support?.message ?? '');
      if (mode !== 'close' && mode !== 'gap') return refusedResult(DAW_ANSWERS.cutBadMode);
      if (!Number.isInteger(fadeMs) || fadeMs < 0 || fadeMs > 500) return refusedResult(DAW_ANSWERS.cutBadFade);
      if (!(await hasChapter(chapterId)) || firstToken < 0 || lastToken < firstToken) return { ...refusedResult(DAW_ANSWERS.rangeStale), code: 'stale' };
      const cut = rangeCutOf(setup, lastToken - firstToken + 1);
      return { ok: true, changed: true, message: cut.message, undoSteps: cut.undoSteps, ...(cut.steps ? { steps: cut.steps } : {}) };
    },
  };
}

/** DawApplyFxToRange and DawRemoveFxFromRange as bindings_daw_fx_range.go answers them: the fx_range capability's sentence first, then an
 * apply's fade, then a chapter the manuscript does not have or a range read backwards (code stale), then the chain (an apply's must be one
 * the workspace's chain list names, a removal's a plain chain name); then what the launch's DAW answers. */
function createFxRangeMock(
  daw: DawCapabilitiesApi,
  hasChapter: (chapterId: string) => Promise<boolean>,
  listChains: () => Promise<{ names: string[] }>,
): DawFxRangeApi {
  const stale = { ...refusedResult(DAW_ANSWERS.rangeStale), code: 'stale' as const };
  return {
    dawApplyFxToRange: async (chapterId, firstToken, lastToken, chainName, fadeMs) => {
      const setup = await daw.dawCapabilities();
      const support = setup.capabilities.fx_range;
      if (!support?.available) return refusedResult(support?.message ?? '');
      if (!Number.isInteger(fadeMs) || fadeMs < 0 || fadeMs > 500) return refusedResult(DAW_ANSWERS.cutBadFade);
      if (!(await hasChapter(chapterId)) || firstToken < 0 || lastToken < firstToken) return stale;
      let names: string[];
      try {
        names = (await listChains()).names;
      } catch (error) {
        return refusedResult(error instanceof Error ? error.message : String(error));
      }
      if (!names.includes(chainName)) return refusedResult(DAW_ANSWERS.fxBadChain);
      const fx = fxRangeOf(setup, chainName, lastToken - firstToken + 1);
      return { ok: true, changed: true, message: fx.message, undoSteps: fx.undoSteps, ...(fx.steps ? { steps: fx.steps } : {}) };
    },
    dawRemoveFxFromRange: async (chapterId, firstToken, lastToken, chainName) => {
      const setup = await daw.dawCapabilities();
      const support = setup.capabilities.fx_range;
      if (!support?.available) return refusedResult(support?.message ?? '');
      if (!(await hasChapter(chapterId)) || firstToken < 0 || lastToken < firstToken) return stale;
      if (!plainChainName(chainName)) return refusedResult(DAW_ANSWERS.fxBadChain);
      const fx = fxRangeRemovedOf(setup, chainName);
      return { ok: true, changed: true, message: fx.message, undoSteps: fx.undoSteps, ...(fx.steps ? { steps: fx.steps } : {}) };
    },
  };
}
