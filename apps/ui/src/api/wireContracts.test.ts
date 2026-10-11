import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DESKTOP_HOST_API_VERSION } from '../hostApi';
import { createMockApi } from './mockApi';
import type { ProjectStateState } from './contracts/projectstate';
import type { EditCutRequest } from './contracts/editCuts';
import type { WordFxRequest } from './contracts/wordFx';
import { WIRE_CHAPTERS, WIRE_TAKE_REVIEW_FINDINGS, WIRE_TRACKS_PROJECT, WIRE_TRANSCRIPT, editingCandidateFor } from './mockFixtures';
import { prepMarkupChapterSchema, prepMarkupSpanSchema } from './schemas/prepMarkup';
// The reader's bookmarkSchema (schemas/manuscript.ts) stays until the reader bookmarks are removed.
import { bookmarkSchema as spotBookmarkSchema, bookmarksSchema } from './schemas/bookmarks';
import { passageMapSchema, passageMarkSchema } from './schemas/passageMap';
import { acceptedWordSchema, acceptedWordsChangeSchema, acceptedWordsSchema } from './schemas/editLog';
import { editCutSchema, editCutsChangeSchema, editCutsSchema } from './schemas/editCuts';
import { wordFxChangeSchema, wordFxListSchema, wordFxSchema } from './schemas/wordFx';
import { markSchema, markThreadDeletedSchema, markTypeSchema, marksSchema, threadMessageSchema } from './schemas/marks';
import { extractionDecisionSchema, extractionSuggestionSchema, extractionSuggestionsSchema } from './schemas/extraction';
import { prepCompletenessSummarySchema } from './schemas/prepCompleteness';
import { workspaceSnapResultSchema } from './schemas/workspaceSnap';
import { cleanupApplyResultSchema, cleanupPreviewResultSchema, levelMatchApplyResultSchema, levelMatchPreviewResultSchema } from './schemas/cleanup';
import { editingSourceChoiceSchema } from './schemas/editing';
import { pronunciationCandidateSchema, pronunciationSourceSchema, pronunciationSourcesSchema } from './schemas/pronunciationSources';
import { takeEvidenceResultSchema, takeFigureSchema } from './schemas/takeEvidence';
import { pronunciationOnlineBatchResultSchema, pronunciationOnlineKeyStatusSchema, pronunciationOnlineResultSchema } from './schemas/pronunciationOnline';
import { WIRE_TAKE_COMPARISON_FINDING } from './takeComparisonMock';
import { MOCK_MEASURE_PATHS } from './measureMock';
import { judgeMock } from './coverageMock';
import { MOCK_REAPER_INPUT_SEEDS, MOCK_REAPER_SEEDS, mockLastReading } from './teleprompterMock';
import { deliveryQcEvidenceSchema, deliveryReportExportSchema, measureJobSchema, measurePickResultSchema } from './schemas/measure';
import { exportJobSchema, multiPackageJobSchema, packageJobSchema } from './schemas/renderEncodeMaster';
import { MOCK_EXPORT_ITEMS, MOCK_EXPORT_PATHS, createRenderEncodeMasterMock } from './renderEncodeMasterMock';
import { deliveryProfileSchema, deliveryProfilesStateSchema } from './schemas/deliveryProfiles';
import { MOCK_ACX, evaluateMockFile, mockCustomProfile } from './deliveryProfilesMock';
import { diagnosticsJobSchema } from './schemas/diagnostics';
import {
  bookmarkSchema,
  chapterKindResultSchema,
  chapterSchema,
  chaptersSchema,
  fileSelectionSchema,
  noteSchema,
  notesSchema,
  paragraphsSchema,
  readerSchema,
  readerStateSchema,
  searchHitsSchema,
  workJobSchema,
} from './schemas/manuscript';
import { chapterSyncPreviewSchema, chapterSyncStateSchema } from './schemas/chapterSync';
import { assetCatalogSchema, assetInstallJobSchema, assetVerifyResultSchema } from './schemas/assets';
import { settingsForScopeSchema } from './schemas/settings';
import { keymapOverridesSchema } from './schemas/keymap';
import {
  takeComparisonEvidenceSchema,
  takeComparisonJobSchema,
  takeReviewCreateTakeResultSchema,
  takeReviewEvidenceSchema,
  takeReviewScanJobSchema,
} from './schemas/takeReview';
import {
  COVERAGE_EVALUATOR_REASONS,
  COVERAGE_REFUSAL_REASONS,
  coverageEnginesSchema,
  coverageGapReviewsSchema,
  coverageResultSchema,
  coverageStartResultSchema,
  coverageStateSchema,
} from './schemas/coverage';
import {
  workspaceAlignmentResultSchema,
  workspaceFXChainsResultSchema,
  workspaceFXPluginsResultSchema,
  workspaceFXResultSchema,
  workspacePeaksResultSchema,
  workspaceTakesResultSchema,
  workspaceUseTakeResultSchema,
} from './schemas/workspace';
import { USE_TAKE_MESSAGES } from './workspaceTakesMock';
import { pinnedPreviewSchema, previewResultSchema } from './schemas/preview';
import { STAGE_REFUSAL_REASONS, STAGE_UNKNOWN_CAUSES, stageDecisionResultSchema, stageRecommendationsSchema } from './schemas/stages';
import { proofingChooseRenderResultSchema, proofingRenderSchema } from './schemas/proofingRender';
import {
  productionBurndownSchema,
  productionOverviewSchema,
  productionPlanSchema,
  productionReportExportSchema,
  productionReportPreviewSchema,
  productionStartResultSchema,
  productionStopResultSchema,
} from './schemas/production';
import { PRODUCTION_SCENARIOS } from './productionMock';
import { findingMarkerSchema, findingNavigationSchema, findingSchema, findingsPageSchema, findingsSummarySchema, reaperStatusSchema } from './schemas/findings';
import { tracksDiscoverySchema, tracksProjectSchema } from './schemas/tracks';
import {
  chaptersForTracksSchema,
  chapterSuggestionSchema,
  chapterRegionPlanSchema,
  chapterRegionsCreatedSchema,
  chapterTrackLinksSchema,
  chapterTrackMappingSchema,
  chapterTrackMatchSchema,
  chapterTrackSetSchema,
  trackMappingSchema,
  trackSelectResultSchema,
} from './schemas/chapterTrackMap';
import { ttsCatalogSchema, ttsInstallJobSchema } from './schemas/tts';
import { updateJobSchema, updateStatusSchema } from './schemas/update';
import { startResultSchema, whisperCatalogSchema, whisperInstallJobSchema } from './schemas/whisper';
import { dawLaunchResultSchema, dawLinkResultSchema, projectFolderSelectionSchema, projectSwitchResultSchema, recentProjectsSchema } from './schemas/project';
import {
  creditsAnnouncementsSchema,
  creditsProjectValuesResultSchema,
  creditsRecordedLengthsSchema,
  creditsSetupStateSchema,
  creditsRenderResultSchema,
  creditsStatusesSchema,
  creditTemplateSchema,
  creditTemplatesSchema,
  retailSampleAnswerSchema,
} from './schemas/credits';
import { dawCatalogListSchema } from './schemas/dawCatalog';
import {
  guideBuildResultSchema,
  guideCreatedSchema,
  guideDialogueCuesSchema,
  guideEntitiesSchema,
  guidePreviewSchema,
  pronunciationQueriesCsvSchema,
  pronunciationQueriesSchema,
  queryImportResultSchema,
  guidePronunciationSchema,
} from './schemas/storyBible';
import { approvedCharacterReferencesSchema, characterRegionsSchema, characterReferenceSchema } from './schemas/character';
import { seriesListSchema, seriesSchema, seriesVoiceBibleSchema } from './schemas/series';
import { bootstrapSchema, copyDiagnosticsResultSchema, projectAttachStateSchema, readySchema, windowZoomSchema } from './schemas/system';
import {
  readAloudReaperStateSchema,
  readAloudRecordingSchema,
  teleprompterReaperInputSchema,
  teleprompterDevicesResultSchema,
  teleprompterEventSchema,
  teleprompterFlagFindingsSchema,
  teleprompterReadingSchema,
  teleprompterLocateResultSchema,
  teleprompterResumeFollowSchema,
  teleprompterPunchResultSchema,
  teleprompterStartResultSchema,
  teleprompterStateSchema,
} from './schemas/teleprompter';
import { equivalenceSchema, hintSuggestionsSchema, hintsSchema, lastCompletedSchema, transcriptStateSchema } from './schemas/transcript';
import { lineIdentityStartResultSchema, lineIdentityStateSchema } from './schemas/lineidentity';
import { pickupsImportResultSchema, pickupsPunchResultSchema, pickupsStartResultSchema, pickupsStateSchema } from './schemas/pickups';
import { renderConfigStartResultSchema, renderConfigStateSchema, renderConfigSuggestedFolderSchema } from './schemas/renderconfig';
import { cleanupToolsStartResultSchema, cleanupToolsStateSchema } from './schemas/cleanuptools';
import { dawCapabilitiesSchema, dawProjectStateSchema, dawResultSchema, dawTransportSchema } from './schemas/daw';
import { providerCapabilitiesSchema } from './schemas/providers';
import { masteringProvidersSchema } from './schemas/mastering';
import { recorderDevicesResultSchema, recorderLevelSchema, recorderStateSchema } from './schemas/recording';
import { projectStateChangedSchema, projectStateStartResultSchema, projectStateStateSchema } from './schemas/projectstate';
import { retakeLanesListSchema, retakeLanesStartResultSchema, retakeLanesStateSchema } from './schemas/retakelanes';
import { chapterTagsEmbedResultSchema, chapterTagsPreviewSchema } from './schemas/chaptertags';
import { dictionaryLookupResultSchema } from './schemas/dictionary';
import { unknownKeys } from './schemas/strictness';
import { GOLDEN } from './contractGoldens';
import { parseWire, parseWireJson, type WireContext } from './wire/parseWire';
import { WireError } from './wire/WireError';
import { creditsRows } from '../components/booth/readerModel';

// ADR 0069, rule 4: the fixtures are the contract. Every payload the Go host and the Python sidecars write to
// tests/fixtures/contracts/ is validated here by the same schemas the app runs, and so is every answer the mock client gives;
// both are also checked strictly, so a key the schema does not declare fails here even though the app itself would ignore it.
const GOLDEN_DIR = fileURLToPath(new URL('../../../../tests/fixtures/contracts/', import.meta.url));
const ctx = (payload: string): WireContext => ({ boundary: 'contract.test', payload });

/** Validates `value`, and fails on any key the schema does not declare. */
function expectMatches(schema: z.ZodType, value: unknown, payload: string): void {
  parseWire(schema, value, ctx(payload));
  expect(unknownKeys(schema, value), `${payload} has keys its schema does not declare`).toEqual([]);
}

// One row per committed file, in contractGoldens/<feature area>.ts: which schema owns it. A new file with no row fails the first test below.

const readGolden = (file: string): unknown => JSON.parse(readFileSync(`${GOLDEN_DIR}${file}`, 'utf8'));

describe('golden payloads written by the Go host and the Python sidecars', () => {
  it('every committed file has a schema, and every schema row has a file', () => {
    const committed = readdirSync(GOLDEN_DIR)
      .filter((name) => name.endsWith('.json'))
      .sort();
    expect(committed).toEqual(Object.keys(GOLDEN).sort());
  });

  it.each(Object.entries(GOLDEN))('%s matches its schema and declares nothing the schema lacks', (file, schema) => {
    expectMatches(schema, readGolden(file), file);
  });

  it('the golden Bootstrap carries the API version this UI is built for', () => {
    expect(parseWire(bootstrapSchema, readGolden('bootstrap-manuscript.json'), ctx('bootstrap')).apiVersion).toBe(DESKTOP_HOST_API_VERSION);
  });

  it('the coverage reason lists are the ones the host declares', () => {
    const declared = z.object({ refusal: z.array(z.string()), evaluator: z.array(z.string()) }).parse(readGolden('coverage-reasons.json'));
    expect([...COVERAGE_REFUSAL_REASONS]).toEqual(declared.refusal);
    expect([...COVERAGE_EVALUATOR_REASONS]).toEqual(declared.evaluator);
  });

  it('the recording check engines: the golden parses, the mock answers the same engines and refuses the same unknown model (ADR 0841)', async () => {
    const golden = readGolden('coverage-engines.json');
    const parsed = parseWire(coverageEnginesSchema, golden, ctx('coverage engines'));
    expect(parsed.engines.map((engine) => engine.id)).toContain(parsed.default);
    expect(parsed.engines.every((engine) => engine.family === 'whisper')).toBe(true);
    expect(() => parseWire(coverageEnginesSchema, { ...parsed, extra: 1 }, ctx('coverage engines'))).toThrow();
    expect(() => parseWire(coverageEnginesSchema, { ...parsed, engines: [{ ...parsed.engines[0], family: 'moonshine' }] }, ctx('coverage engines'))).toThrow();
    expect(() => parseWire(coverageEnginesSchema, { ...parsed, engines: [{ ...parsed.engines[0], extra: 1 }] }, ctx('coverage engines'))).toThrow();

    const api = createMockApi();
    const mocked = await api.coverageEngines();
    expectMatches(coverageEnginesSchema, mocked, 'mock coverage engines');
    expect(mocked.engines.map((engine) => engine.id)).toContain(mocked.default);
    await expect(api.coverageStart('any-chapter', { model: 'moonshine-tiny' })).rejects.toThrow('not in the approved catalog');
    const chapters = await api.manuscriptChapters();
    const chapter = chapters.find((item) => item.recordedFraction !== undefined);
    if (!chapter) throw new Error('the mock chapters carry a measured recordedFraction');
    expect((await api.coverageStart(chapter.id, { model: mocked.default })).status).toBe('started');
  });

  it('a recording check gap review: the goldens parse, the mock answers the same shapes and refuses what the host refuses (ADR 0842)', async () => {
    const note = parseWire(findingSchema, readGolden('coverage-gap-review-accepted.json'), ctx('accepted gap'));
    expect(note).toMatchObject({ analyzer: 'recording-check', category: 'pickup', confidence: null, review: { status: 'accepted' } });
    const reviews = parseWire(coverageGapReviewsSchema, readGolden('coverage-gap-review-reviews.json'), ctx('gap reviews'));
    expect(Object.values(reviews)).toEqual(['accepted']);
    expect(() => parseWire(coverageGapReviewsSchema, { a: 'dismissed' }, ctx('gap reviews'))).toThrow();
    expect(() => parseWire(coverageGapReviewsSchema, { a: 1 }, ctx('gap reviews'))).toThrow();

    const measured = (await createMockApi().manuscriptChapters()).find((chapter) => chapter.recordedFraction !== undefined);
    if (!measured) throw new Error('the mock chapters carry a measured recordedFraction');
    const chapterId = measured.id;
    const api = createMockApi({}, { coverage: { pickups: [chapterId] } });
    const checked = await api.coverageResult(chapterId);
    const gaps = checked.result?.gaps ?? [];
    expect(checked.state).toBe('current');
    expect(gaps.length).toBeGreaterThan(1);
    const [first, second] = gaps;
    if (!first || !second) throw new Error('the mock check has two gaps');
    expect(await api.coverageGapReviews(chapterId)).toEqual({});

    const before = (await api.findingsSummary()).total;
    const accepted = await api.coverageGapAccept(chapterId, first.id);
    expectMatches(findingSchema, accepted, 'mock accepted gap');
    expect(accepted).toMatchObject({ category: 'pickup', confidence: null, review: { status: 'accepted' } });
    expect((await api.findingsSummary()).total).toBe(before + 1);
    expect(await api.coverageGapAccept(chapterId, first.id)).toEqual(accepted);
    expect((await api.findingsSummary()).total).toBe(before + 1);

    await api.coverageGapIgnore(chapterId, second.id);
    expect((await api.findingsSummary()).total).toBe(before + 1);
    const read = await api.coverageGapReviews(chapterId);
    expectMatches(coverageGapReviewsSchema, read, 'mock gap reviews');
    expect(read).toEqual({ [first.id]: 'accepted', [second.id]: 'ignored' });

    await expect(api.coverageGapAccept(chapterId, 'missing:nope:1')).rejects.toThrow('not in this chapter');
    await expect(api.coverageGapIgnore(chapterId, '../../x')).rejects.toThrow('not in this chapter');
    await expect(api.coverageGapAccept(chapterId, second.id)).rejects.toThrow('stays ignored');
    await expect(api.coverageGapIgnore(chapterId, first.id)).rejects.toThrow('already a note');
    await expect(api.coverageGapAccept('never-checked', first.id)).rejects.toThrow('out of date or was never run');

    // A new check is a new evidence key: the old reviews no longer match, the accepted note stays a note.
    expect((await api.coverageStart(chapterId)).status).toBe('started');
    await vi.waitFor(async () => expect((await api.coverageState()).phase).toBe('complete'), { timeout: 5000 });
    expect(await api.coverageGapReviews(chapterId)).toEqual({});
    expect((await api.findingsSummary()).total).toBe(before + 1);
  });

  it('a coverage region keeps its bounds, and a missing bound reads as absent (ADR 0168)', () => {
    const current = parseWire(coverageResultSchema, readGolden('coverage-result-current.json'), ctx('coverage result'));
    const [tail] = current.result?.regions ?? [];
    expect(tail.before).toEqual({ itemIndex: 1, itemGuid: '{ITEM-B}', sourceTime: 0.3 });
    expect(tail.after).toBeUndefined();
    // A result stored before the sidecar reported bounds has neither key.
    const golden = z
      .looseObject({ result: z.looseObject({ regions: z.array(z.record(z.string(), z.unknown())) }) })
      .parse(readGolden('coverage-result-current.json'));
    const regions = golden.result.regions.map(({ before: _before, after: _after, ...rest }) => rest);
    const older = { ...golden, result: { ...golden.result, regions } };
    const [oldTail] = parseWire(coverageResultSchema, older, ctx('coverage result')).result?.regions ?? [];
    expect([oldTail.before, oldTail.after]).toEqual([undefined, undefined]);
  });

  it('a coverage report carries the gap taxonomy; a result stored before it reads as no gaps (ADR 0830)', () => {
    for (const name of ['coverage-result-current.json', 'coverage-result-stale.json', 'coverage-result-cascade.json']) {
      const report = parseWire(coverageResultSchema, readGolden(name), ctx('coverage result')).result;
      expect(report?.gaps).toEqual([]);
      expect(report?.unfinished).toEqual({ start: 0, end: 0 });
    }
    const golden = z.looseObject({ result: z.looseObject({}) }).parse(readGolden('coverage-result-current.json'));
    const older = Object.fromEntries(Object.entries(golden.result).filter(([key]) => key !== 'gaps' && key !== 'unfinished'));
    const parsed = parseWire(coverageResultSchema, { ...golden, result: older }, ctx('coverage result'));
    expect([parsed.result?.gaps, parsed.result?.unfinished]).toEqual([[], { start: 0, end: 0 }]);
  });

  it('a gap has a known kind and a confidence that is null or comes with its reason (ADR 0830)', () => {
    const golden = z.looseObject({ result: z.looseObject({}) }).parse(readGolden('coverage-result-current.json'));
    const gap = {
      id: 'missing:p-1:0',
      kind: 'missing',
      paragraphIds: ['p-1'],
      tokenCount: 2,
      firstWord: 'a',
      lastWord: 'b',
      confidence: null,
      confReason: 'no_word_scores',
    };
    const withGap = (change: Record<string, unknown>) => ({ ...golden, result: { ...golden.result, gaps: [{ ...gap, ...change }] } });
    expect(parseWire(coverageResultSchema, withGap({}), ctx('coverage result')).result?.gaps[0].confidence).toBeNull();
    expect(() => parseWire(coverageResultSchema, withGap({ kind: 'bogus' }), ctx('coverage result'))).toThrow();
    expect(() => parseWire(coverageResultSchema, withGap({ confidence: 0.9, confReason: undefined }), ctx('coverage result'))).toThrow();
  });

  it("a coverage result carries the host's judgement, and the mock judges its reports by the same rule (ADR 0204)", () => {
    for (const name of ['coverage-result-current.json', 'coverage-result-stale.json']) {
      const golden = parseWire(coverageResultSchema, readGolden(name), ctx('coverage result'));
      expect(golden.judgement).toBeDefined();
      expect(golden.result && judgeMock(golden.result, golden.judgement?.thresholds)).toEqual(golden.judgement);
    }
    for (const name of ['coverage-result-never.json', 'coverage-result-unmapped.json']) {
      expect(parseWire(coverageResultSchema, readGolden(name), ctx('coverage result')).judgement).toBeUndefined();
    }
  });

  it('the mock last reading passes the reading schema, and a read past the last word does not', () => {
    expectMatches(teleprompterReadingSchema, mockLastReading('c-0001', 812, 900), 'mock teleprompter reading');
    const golden = z.looseObject({}).parse(readGolden('teleprompter-reading.json'));
    expect(() => parseWire(teleprompterReadingSchema, { ...golden, read: 5, tokens: 4 }, ctx('teleprompter reading'))).toThrow();
  });

  it('the mock meter sends a level, refuses while reading and ends with meter_stopped, all passing the event schema', async () => {
    const api = createMockApi({}, { teleprompterLevel: -18 });
    const events: unknown[] = [];
    api.subscribeTeleprompterEvent((event) => events.push(event));
    await api.teleprompterMeterStart('Microphone Array (Realtek(R) Audio)');
    await api.teleprompterMeterStop();
    expect(events).toEqual([
      { type: 'level', peak: -9, rms: -18 },
      { type: 'meter_stopped', error: null },
    ]);
    events.forEach((event) => expectMatches(teleprompterEventSchema, event, 'mock meter event'));
  });

  it('the mock pauses only a running session, and its paused state passes the state schema', async () => {
    const api = createMockApi({}, { teleprompter: 'listening' });
    const states: unknown[] = [];
    api.subscribeTeleprompterState((state) => states.push(state));
    await api.teleprompterState();
    await api.teleprompterPause(true);
    expect(await api.teleprompterState()).toMatchObject({ phase: 'running', paused: true, message: 'Paused.' });
    await api.teleprompterPause(false);
    expect(await api.teleprompterState()).toMatchObject({ phase: 'running', paused: false });
    states.forEach((state) => expectMatches(teleprompterStateSchema, state, 'mock paused state'));
    await api.teleprompterStop();
    await expect(api.teleprompterPause(true)).rejects.toThrow('no teleprompter session is running');
  });

  it("every mock REAPER state passes the schema and says what the host's golden says for the same case", async () => {
    const golden = z.record(z.string(), readAloudReaperStateSchema).parse(readGolden('read-aloud-reaper-states.json'));
    for (const seed of MOCK_REAPER_SEEDS) {
      const api = createMockApi({}, { reaperState: seed });
      const [chapter] = await api.manuscriptChapters();
      const state = await api.readAloudReaperState(chapter.id);
      expectMatches(readAloudReaperStateSchema, state, `mock reaper state ${seed}`);
      const host = golden[seed === 'unavailable' ? 'experimental_off' : seed];
      if (seed !== 'unavailable') expect([state.status, state.reason]).toEqual([host.status, host.reason]);
    }
  });

  it("the host's punch results all pass the schema, and the mock's answers pass it too", async () => {
    const golden = z.record(z.string(), teleprompterPunchResultSchema).parse(readGolden('teleprompter-punch-results.json'));
    Object.entries(golden).forEach(([name, result]) => expectMatches(teleprompterPunchResultSchema, result, `host teleprompter punch ${name}`));

    const pickupsGolden = z.record(z.string(), pickupsPunchResultSchema).parse(readGolden('pickups-punch-results.json'));
    Object.entries(pickupsGolden).forEach(([name, result]) => expectMatches(pickupsPunchResultSchema, result, `host pickups punch ${name}`));

    const api = createMockApi();
    const preview = await api.teleprompterPunchPreview(4);
    expectMatches(teleprompterPunchResultSchema, preview, 'mock teleprompter punch preview');
    expect(preview.outcome).toBe('resolved');
    const punched = await api.teleprompterPunch(4);
    expectMatches(teleprompterPunchResultSchema, punched, 'mock teleprompter punch');
    expect(punched.outcome).toBe('punched');
    const pickupsPunched = await api.pickupsPunch(10);
    expectMatches(pickupsPunchResultSchema, pickupsPunched, 'mock pickups punch');
    expect(pickupsPunched.outcome).toBe('punched');
  });

  it("every mock arm, record start and record stop passes the schema and agrees with the host's golden for the same REAPER state", async () => {
    const golden = z.record(z.string(), readAloudRecordingSchema).parse(readGolden('read-aloud-recordings.json'));
    for (const seed of MOCK_REAPER_SEEDS) {
      const api = createMockApi({}, { reaperState: seed });
      const [chapter] = await api.manuscriptChapters();
      const armed = await api.readAloudArmOnly(chapter.id);
      const started = await api.readAloudRecordStart(chapter.id);
      const stopped = await api.readAloudRecordStop();
      expectMatches(readAloudRecordingSchema, armed, `mock arm ${seed}`);
      expectMatches(readAloudRecordingSchema, started, `mock record start ${seed}`);
      expectMatches(readAloudRecordingSchema, stopped, `mock record stop ${seed}`);
      // "unavailable" is its own reason (standalone) in the mock, unlike "experimental_off"'s golden key - the same
      // case the read-aloud-reaper-states check above skips for the same reason.
      if (seed === 'unavailable') continue;
      expect([armed.outcome, armed.reason]).toEqual([golden[`${seed}.arm`].outcome, golden[`${seed}.arm`].reason]);
      expect([started.outcome, started.reason]).toEqual([golden[`${seed}.start`].outcome, golden[`${seed}.start`].reason]);
      expect([stopped.outcome, stopped.reason]).toEqual([golden[`${seed}.stop`].outcome, golden[`${seed}.stop`].reason]);
    }
  });

  it("every mock REAPER input answer passes the schema, preselects only a listed microphone, and matches the host's golden", async () => {
    const golden = z.record(z.string(), teleprompterReaperInputSchema).parse(readGolden('teleprompter-reaper-inputs.json'));
    for (const seed of MOCK_REAPER_INPUT_SEEDS) {
      const api = createMockApi({}, { reaperInput: seed });
      const input = await api.teleprompterReaperInput();
      expectMatches(teleprompterReaperInputSchema, input, `mock reaper input ${seed}`);
      expect([input.status, input.reason]).toEqual([golden[seed].status, golden[seed].reason]);
      const listed = (await api.teleprompterDevices()).devices.map((device) => device.name);
      if (input.device !== undefined) expect(listed).toContain(input.device);
    }
    expect(() => parseWire(teleprompterReaperInputSchema, { status: 'no_match', device: 'X', message: '', candidates: [] }, ctx('reaper input'))).toThrow();
  });

  it('the stage cause and refusal lists are the ones the host declares', () => {
    expect([...STAGE_UNKNOWN_CAUSES]).toEqual(z.array(z.string()).parse(readGolden('stages-causes.json')));
    expect([...STAGE_REFUSAL_REASONS]).toEqual(z.array(z.string()).parse(readGolden('stages-refusal-reasons.json')));
  });

  it('recordedFraction is only on the chapter the coverage measured', () => {
    const chapters = parseWire(chaptersSchema, readGolden('manuscript-chapters-measured.json'), ctx('chapters'));
    expect(chapters.map((chapter) => chapter.recordedFraction)).toEqual([0.75, ...chapters.slice(1).map(() => undefined)]);
    const unmeasured = parseWire(chaptersSchema, readGolden('manuscript-chapters.json'), ctx('chapters'));
    expect(unmeasured.every((chapter) => chapter.recordedFraction === undefined)).toBe(true);
  });

  it('recordedSeconds is only on a chapter with a linked track, and the others say why', () => {
    const chapters = parseWire(chaptersSchema, readGolden('manuscript-chapters-recorded.json'), ctx('chapters'));
    expect(chapters.map((chapter) => chapter.recordedSeconds)).toEqual([2520.5, ...chapters.slice(1).map(() => undefined)]);
    expect(chapters.map((chapter) => chapter.recordedUnavailable)).toEqual([undefined, 'unlinked', ...chapters.slice(2).map(() => undefined)]);
  });

  it('the golden completed run keeps its rows and marker states through the schema', () => {
    const state = parseWire(transcriptStateSchema, readGolden('transcript-success.json'), ctx('transcript'));
    expect(state.rows.map((row) => row.markerState)).toEqual(['pending', 'existing']);
    expect(state.runId).toBe('1789000000000000');
  });

  // The Keymap.overrides row carries a JSON document as its
  // text value; parseWireJson and keymapOverridesSchema are the one way to read it (never a bare JSON.parse).
  it('the golden Keymap.overrides default has no bindings yet, read with parseWireJson and its own schema', () => {
    const settings = parseWire(settingsForScopeSchema, readGolden('settings-global.json'), ctx('settings global'));
    const overrides = settings.Keymap?.find((field) => field.key === 'overrides');
    expect(overrides?.kind).toBe('text');
    const document = parseWireJson(keymapOverridesSchema, overrides?.effectiveValue ?? '', ctx('keymap overrides'));
    expect(document).toEqual({ version: 1, bindings: {} });
  });
});

describe('answers of the mock client (it must pass the schemas the real host answers are held to)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ready and the default bootstrap', async () => {
    const api = createMockApi();
    expectMatches(readySchema, await api.ready(), 'mock ready');
    expectMatches(bootstrapSchema, await api.bootstrap(), 'mock bootstrap');
  });

  it.each([
    ['a project with no manuscript', { noManuscript: true }],
    ['a project offering a manuscript file', { manuscriptCandidate: { path: 'C:/Projects/Alice/manuscript.docx', name: 'manuscript.docx' } }],
    ['a standalone launch with no project', { projectFolder: '' }],
  ])('bootstrap for %s', async (_name, initial) => {
    expectMatches(bootstrapSchema, await createMockApi({}, initial).bootstrap(), 'mock bootstrap');
  });

  it('the fixture transcript state', () => {
    expectMatches(transcriptStateSchema, WIRE_TRANSCRIPT, 'WIRE_TRANSCRIPT');
  });

  it('the transcript state through a whole comparison run, including marker export', async () => {
    vi.useFakeTimers();
    const api = createMockApi();
    const seen: unknown[] = [];
    api.subscribeTranscript((state) => seen.push(structuredClone(state)));
    await expect(api.transcriptStart({ model: 'small', chunk: '60', workers: '1', hints: '' })).resolves.toEqual({ status: 'started' });
    await vi.advanceTimersByTimeAsync(60_000);
    await api.transcriptExportMarkers();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(seen.length).toBeGreaterThan(3);
    for (const state of seen) expectMatches(transcriptStateSchema, state, 'mock transcript state');
    expect(new Set(seen.map((state) => (state as { phase: string }).phase)).size).toBeGreaterThan(2);
  });

  it('the teleprompter state and events through a session, from idle to stopped', async () => {
    vi.useFakeTimers();
    const api = createMockApi();
    const events: unknown[] = [];
    const states: unknown[] = [];
    api.subscribeTeleprompterEvent((event) => events.push(event));
    api.subscribeTeleprompterState((state) => states.push(state));
    expectMatches(teleprompterStateSchema, await api.teleprompterState(), 'mock teleprompter idle');
    const chapter = (await api.manuscriptChapters())[0];
    await api.teleprompterStart({ chapter: chapter?.id ?? '', device: 'Microphone' });
    await vi.advanceTimersByTimeAsync(120_000);
    await api.teleprompterStop();
    expect(new Set(events.map((event) => (event as { type: string }).type))).toEqual(new Set(['script', 'level', 'partial', 'position', 'flag']));
    for (const event of events) expectMatches(teleprompterEventSchema, event, 'mock teleprompter event');
    for (const state of states) expectMatches(teleprompterStateSchema, state, 'mock teleprompter state');
  });

  it.each(['listening', 'waiting', 'done'] as const)('a teleprompter session the host kept running (%s)', async (seed) => {
    const api = createMockApi({}, { teleprompter: seed });
    const state = await api.teleprompterState();
    expect(state.position?.status).toBe(seed);
    expectMatches(teleprompterStateSchema, state, `mock teleprompter ${seed}`);
  });

  it('a teleprompter session the host kept running with suspected flags raised (flagged)', async () => {
    const api = createMockApi({}, { teleprompter: 'flagged' });
    const events: unknown[] = [];
    api.subscribeTeleprompterEvent((event) => events.push(event));
    const state = await api.teleprompterState();
    expectMatches(teleprompterStateSchema, state, 'mock teleprompter flagged');
    expect(state.position?.status).toBe('listening');
    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0));
    for (const event of events) expectMatches(teleprompterEventSchema, event, 'mock teleprompter seeded flag');
    expect(new Set(events.map((event) => (event as { kind: string }).kind))).toEqual(new Set(['misread', 'skipped', 'restart', 'extra']));
  });

  it('the teleprompter device list', async () => {
    const api = createMockApi();
    expectMatches(teleprompterDevicesResultSchema, await api.teleprompterDevices(), 'mock teleprompter devices');
    const empty = createMockApi({}, { teleprompterDevices: [] });
    expectMatches(teleprompterDevicesResultSchema, await empty.teleprompterDevices(), 'mock teleprompter devices, none found');
  });

  it('teleprompterSeek moves a running session to the requested word, reported as a restart jump', async () => {
    const api = createMockApi();
    const events: unknown[] = [];
    api.subscribeTeleprompterEvent((event) => events.push(event));
    const chapter = (await api.manuscriptChapters())[0];
    await api.teleprompterStart({ chapter: chapter?.id ?? '', device: 'Microphone' });

    await api.teleprompterSeek(3);

    const seek = events.at(-1);
    expectMatches(teleprompterEventSchema, seek, 'mock teleprompter seek event');
    expect(seek).toMatchObject({ type: 'position', read: 3, committed: 3, jump: 'restart' });
  });

  it('the TeleprompterLocate answers, one per status the mock project reaches', async () => {
    const api = createMockApi();
    const chapters = await api.manuscriptChapters();
    const found = await api.teleprompterLocate(chapters[0].id);
    expectMatches(teleprompterLocateResultSchema, found, 'mock teleprompter locate, found');
    expect(found).toMatchObject({ status: 'found', tail: { to: 612.4 } });
    if (found.status === 'asset_required' || !found.located?.sentence) throw new Error('expected a located sentence');
    expect(found.located.sentence.start).toBeLessThanOrEqual(found.located.last ?? -1);
    expect(found.located.sentence.end).toBeGreaterThan(found.located.last ?? Infinity);

    const missing = await api.teleprompterLocate(chapters[1].id);
    expectMatches(teleprompterLocateResultSchema, missing, 'mock teleprompter locate, source missing');
    expect(missing.status).toBe('source_missing');

    const last = chapters[chapters.length - 1].id;
    const noTrack = await api.teleprompterLocate(last);
    expectMatches(teleprompterLocateResultSchema, noTrack, 'mock teleprompter locate, no track');
    expect(noTrack.status).toBe('no_track');

    const picked = await api.teleprompterLocate(last, { trackGuid: '{0E4D1D7F-D039-674D-87E6-719376DE95EC}' });
    expect(picked.status).toBe('found');
    await expect(api.teleprompterLocate(last, { trackGuid: '{00000000-0000-4000-8000-000000000000}' })).rejects.toThrow(/not in the selected/);
    await expect(api.teleprompterLocate('not-a-real-chapter')).rejects.toThrow();
  });

  it('the TeleprompterResumeFollow and Unfollow answers', async () => {
    const api = createMockApi();
    const chapters = await api.manuscriptChapters();
    const tracked = await api.teleprompterResumeFollow(chapters[0].id);
    expectMatches(teleprompterResumeFollowSchema, tracked, 'mock resume follow, a tracked chapter');
    expect(tracked).toEqual({ following: false, reason: 'unavailable' });
    const untracked = await api.teleprompterResumeFollow(chapters[chapters.length - 1].id);
    expectMatches(teleprompterResumeFollowSchema, untracked, 'mock resume follow, no track');
    expect(untracked).toEqual({ following: false, reason: 'no_track' });
    expectMatches(teleprompterResumeFollowSchema, await api.teleprompterResumeUnfollow(), 'mock resume unfollow');
    await expect(api.teleprompterResumeFollow(chapters[0].id, '{00000000-0000-4000-8000-000000000000}')).rejects.toThrow(/not in the selected/);
    await expect(api.teleprompterResumeFollow('not-a-real-chapter')).rejects.toThrow();
  });

  // `?mockResume=` (main.tsx) reaches every resume card state on the first chapter; each answer is still one the real host could send.
  it.each([
    ['low_confidence', 'low_confidence'],
    ['not_found', 'not_found'],
    ['ambiguous', 'no_track'],
    ['none', 'no_track'],
    ['no_recording', 'no_recording'],
    ['source_missing', 'source_missing'],
    ['source_unsupported', 'source_unsupported'],
  ] as const)('the ?mockResume=%s seed answers TeleprompterLocate with %s', async (resume, status) => {
    const api = createMockApi({}, { resume });
    const chapters = await api.manuscriptChapters();

    const result = await api.teleprompterLocate(chapters[0].id);

    expectMatches(teleprompterLocateResultSchema, result, `mock teleprompter locate, ${resume} seed`);
    expect(result.status).toBe(status);
  });

  it('the ambiguous seed offers the tied tracks, and reads the one the narrator picks', async () => {
    const api = createMockApi({}, { resume: 'ambiguous' });
    const chapters = await api.manuscriptChapters();

    const offered = await api.teleprompterLocate(chapters[0].id);
    if (offered.status === 'asset_required') throw new Error('expected a track match');
    expect(offered.match.status).toBe('ambiguous');
    expect(offered.match.candidates.length).toBeGreaterThan(1);

    const picked = await api.teleprompterLocate(chapters[0].id, { trackGuid: offered.match.candidates[0].trackGuid });
    expectMatches(teleprompterLocateResultSchema, picked, 'mock teleprompter locate, ambiguous seed after a pick');
    expect(picked.status).toBe('found');
  });

  it('the error seed rejects TeleprompterLocate, as a failed read of the .rpp or the sidecar does', async () => {
    const api = createMockApi({}, { resume: 'error' });
    const chapters = await api.manuscriptChapters();

    await expect(api.teleprompterLocate(chapters[0].id)).rejects.toThrow(/could not read/);
  });

  it('TeleprompterLocate asks for the model before transcribing a readable track', async () => {
    const api = createMockApi({}, { assets: 'missing' });
    const chapters = await api.manuscriptChapters();

    const required = await api.teleprompterLocate(chapters[0].id);

    expectMatches(teleprompterLocateResultSchema, required, 'mock teleprompter locate, asset required');
    expect(required.status).toBe('asset_required');
  });

  it('teleprompterSaveFlags answers one suspected finding per flag, and a dismissal is kept', async () => {
    const api = createMockApi();
    const chapter = (await api.manuscriptChapters())[0];
    const paragraph = (await api.manuscriptParagraphs(chapter?.id ?? ''))[0];
    const base = { paragraphId: paragraph?.id ?? '', scriptStart: 0, scriptEnd: 1, dismissed: false };
    const flags = [
      { ...base, kind: 'misread' as const, wordStart: 0, wordEnd: 1, heard: 'hello', dismissed: true },
      { ...base, kind: 'extra' as const, wordStart: 1, wordEnd: 2, heard: 'um' },
      { ...base, kind: 'skipped' as const, wordStart: 2, wordEnd: 3, heard: '' },
      { ...base, kind: 'restart' as const, wordStart: 0, wordEnd: 3, heard: 'the first words' },
    ];
    const saved = await api.teleprompterSaveFlags(chapter?.id ?? '', flags);
    expectMatches(teleprompterFlagFindingsSchema, saved, 'mock teleprompter saved flags');
    expect(saved.map((finding) => finding.review.status)).toEqual(['dismissed', 'unreviewed', 'unreviewed', 'unreviewed']);
    const again = await api.teleprompterSaveFlags(
      chapter?.id ?? '',
      flags.map((flag) => ({ ...flag, dismissed: false })),
    );
    expect(again[0].review.status).toBe('dismissed');
    await expect(
      api.teleprompterSaveFlags(chapter?.id ?? '', [{ ...base, kind: 'misread', paragraphId: 'nope', wordStart: 0, wordEnd: 1, heard: '' }]),
    ).rejects.toThrow(/nope/);
  });

  it('teleprompterSeek rejects when no session is running', async () => {
    const api = createMockApi();

    await expect(api.teleprompterSeek(3)).rejects.toThrow(/no teleprompter session/);
  });

  it('the project-attach event', () => {
    const attached: unknown[] = [];
    const api = createMockApi();
    api.subscribeProjectAttach((state) => attached.push(state));
    void api.switchProject('C:/Projects/Other', 'Other');
    expect(attached).toHaveLength(1);
    expectMatches(projectAttachStateSchema, attached[0], 'mock system:attached');
  });
});

describe('answers of the mock client for the manuscript, Story Bible and project bindings', () => {
  it('the reader, its chapters, paragraphs, notes, search and saved state', async () => {
    const api = createMockApi();
    const chapters = await api.manuscriptChapters();
    expectMatches(chaptersSchema, chapters, 'mock chapters');
    expectMatches(readerSchema, await api.manuscriptReader(), 'mock reader');
    expectMatches(readerStateSchema, await api.readerState(), 'mock reader state');
    expectMatches(paragraphsSchema, await api.manuscriptParagraphs(chapters[0]?.id ?? ''), 'mock paragraphs');
    expectMatches(searchHitsSchema, await api.manuscriptSearch('alice'), 'mock search');
    expectMatches(notesSchema, await api.noteList(), 'mock notes');
    expectMatches(
      readerStateSchema,
      await api.readerStateSave({ activeChapter: chapters[0]?.id, activeSourceLine: 3, expandedChapters: [] }),
      'mock saved state',
    );
    expectMatches(chapterSchema, await api.manuscriptSetChapterStatus(chapters[0]?.id ?? '', 'recording'), 'mock chapter status');
  });

  // Consent, the first sync and its batch, Undo, chaptersync:state, unsaved edits,
  // the Sync activity and each chapter's status.
  it('chapter sync answers and events', async () => {
    const quiet = await createMockApi().chapterSyncState();
    expectMatches(chapterSyncStateSchema, quiet, 'mock chapter sync, synced before');
    expect(quiet).toMatchObject({ consent: 'on', ask: false, batch: null });

    const api = createMockApi({}, { chapterSync: 'ask' });
    const seen: unknown[] = [];
    api.subscribeChapterSync((state) => seen.push(state));
    const asking = await api.chapterSyncState();
    expectMatches(chapterSyncStateSchema, asking, 'mock chapter sync, asking');
    expect(asking).toMatchObject({ consent: 'undecided', ask: true });
    const preview = await api.chapterSyncPreview();
    expectMatches(chapterSyncPreviewSchema, preview, 'mock chapter sync preview');
    expect(preview.autoLink.length).toBeGreaterThan(0);
    const synced = await api.chapterSyncSetEnabled(true);
    expectMatches(chapterSyncStateSchema, synced, 'mock chapter sync, synced');
    expect(synced.batch?.linked.map((link) => link.trackGuid)).toEqual(preview.autoLink.map((link) => link.trackGuid));
    const undone = await api.chapterSyncUndo(preview.autoLink[0].trackGuid);
    expectMatches(chapterSyncStateSchema, undone, 'mock chapter sync, undone');
    expect((await api.chapterSyncPreview()).autoLink.map((link) => link.trackGuid)).not.toContain(preview.autoLink[0].trackGuid);
    expect(synced.activity[0]).toEqual(synced.batch);
    for (const state of seen) expectMatches(chapterSyncStateSchema, state, 'mock chaptersync:state');
    expect(seen.length).toBeGreaterThanOrEqual(2);

    // REAPER holds unsaved edits, and the Sync activity keeps a row from a save in REAPER.
    const unsaved = await createMockApi({}, { chapterSync: 'unsaved' }).chapterSyncState();
    expectMatches(chapterSyncStateSchema, unsaved, 'mock chapter sync, unsaved edits');
    expect(unsaved).toMatchObject({ consent: 'on', unsavedEdits: true, batch: null });
    expect(unsaved.activity.map((row) => row.trigger)).toEqual(['watch']);

    // The engine panel's Sync activity: three batches, one automatic and one manual link.
    const activity = await createMockApi({}, { chapterSync: 'activity' }).chapterSyncState();
    expectMatches(chapterSyncStateSchema, activity, 'mock chapter sync, the engine panel activity');
    expect(activity.activity.map((row) => row.trigger)).toEqual(['watch', 'watch', 'consent']);
    expect(activity.chapters.slice(0, 2).map((row) => row.origin)).toEqual(['auto', 'manual']);

    // A status row per narration chapter, the recording check's own answer, with no Check press.
    expect(quiet.chapters.length).toBeGreaterThan(0);
    const staleApi = createMockApi({}, { coverage: { stale: [quiet.chapters[0].chapterId] } });
    const staleState = await staleApi.chapterSyncState();
    expectMatches(chapterSyncStateSchema, staleState, 'mock chapter sync, a stale row');
    expect(staleState.chapters[0]).toMatchObject({ freshness: 'stale', reasons: ['item_trimmed'] });

    // A chapter's pickup track, changed since its last scan.
    const pickups = await createMockApi({}, { chapterSync: 'pickups' }).chapterSyncState();
    expectMatches(chapterSyncStateSchema, pickups, 'mock chapter sync, pickups changed');
    expect(pickups.chapters.filter((row) => row.pickupsChanged)).toHaveLength(1);
  });

  // Remove from recording clears the chapter's links, and Restore brings it back.
  it('a chapter removed from recording and restored', async () => {
    const api = createMockApi();
    const [first] = await api.manuscriptChapters();
    const tracks = await api.chapterTrackLinks();
    const guid = tracks.tracks[0]?.guid ?? '';
    await api.chapterTrackSet(first.id, guid);
    const removed = await api.manuscriptSetChapterKind(first.id, 'reference');
    expectMatches(chapterKindResultSchema, removed, 'mock chapter removed');
    expect(removed).toMatchObject({ previousKind: 'narration', chapter: { contentKind: 'reference', removedFromRecording: true } });
    expect(removed.clearedLinks.map((link) => link.trackGuid)).toEqual([guid]);
    const restored = await api.manuscriptSetChapterKind(first.id, 'narration');
    expectMatches(chapterKindResultSchema, restored, 'mock chapter restored');
    expect(restored.chapter.removedFromRecording).toBeUndefined();
    expect(restored.clearedLinks).toEqual([]);
    await expect(api.manuscriptSetChapterKind('no-such-chapter', 'reference')).rejects.toThrow('unknown manuscript chapter');
  });

  it('the PrepMarkupList, PrepMarkupSave and PrepMarkupDelete answers, fresh and stale', async () => {
    const api = createMockApi({}, { prepMarkup: [{ chapter: 0, line: 0, words: 'Alice', kind: 'stress', stale: { reason: 'text_changed', was: 'Queen' } }] });
    const chapter = (await api.manuscriptChapters())[0];
    const paragraph = (await api.manuscriptParagraphs(chapter?.id ?? ''))[1];
    const saved = await api.prepMarkupSave(chapter?.id ?? '', paragraph?.id ?? '', 0, 5, 'character_tag', ' Alice ');
    expectMatches(prepMarkupSpanSchema, saved, 'mock markup span');
    expect(saved).toMatchObject({ stale: false, value: 'Alice', paragraph: paragraph?.index });
    const listed = await api.prepMarkupList(chapter?.id ?? '');
    expectMatches(prepMarkupChapterSchema, listed, 'mock markup list');
    expect(listed.spans.map((span) => span.stale)).toEqual([true, false]);
    expect(listed.spans[0]).toMatchObject({ staleReason: 'text_changed', anchorText: 'Queen' });
    await api.prepMarkupDelete(chapter?.id ?? '', listed.spans[0].id);
    expect((await api.prepMarkupList(chapter?.id ?? '')).spans).toHaveLength(1);
    await expect(api.prepMarkupSave(chapter?.id ?? '', 'no-such-line', 0, 1, 'stress', '')).rejects.toThrow('no longer in this chapter');
    await expect(api.prepMarkupSave(chapter?.id ?? '', paragraph?.id ?? '', 0, 5, 'pause', '')).rejects.toThrow('short or long');
  });

  // The per-chapter rollup reads the same two calls above, never a third store.
  it('the prep completeness summary rolls up open queries and stale markup per chapter', async () => {
    const api = createMockApi({}, { prepMarkup: [{ chapter: 0, line: 0, words: 'Alice', kind: 'stress', stale: { reason: 'text_changed', was: 'Queen' } }] });
    const chapters = await api.manuscriptChapters();
    const summary = await api.prepCompletenessSummary();
    expectMatches(prepCompletenessSummarySchema, summary, 'mock prep completeness summary');
    expect(summary.chapters.map((row) => row.chapterId)).toEqual(chapters.map((c) => c.id));
    expect(summary.totals.chapters).toBe(chapters.length);
    const firstChapter = summary.chapters.find((row) => row.chapterId === chapters[0]?.id);
    expect(firstChapter?.staleMarkupSpans).toBe(1);
    expect(firstChapter?.complete).toBe(false);
    const openAcrossChapters = summary.chapters.reduce((sum, row) => sum + row.openQueries, 0);
    expect(summary.totals.openQueries).toBe(openAcrossChapters + summary.totals.unattributedQueries);
    expect(summary.totals.staleMarkupSpans).toBeGreaterThanOrEqual(1);
  });

  it('a created note and bookmark', async () => {
    const api = createMockApi();
    const chapter = (await api.manuscriptChapters())[0];
    const paragraph = (await api.manuscriptParagraphs(chapter?.id ?? ''))[0];
    expectMatches(noteSchema, await api.noteCreate(chapter?.id ?? '', paragraph?.id ?? '', 'A note', 0, 4, 'Alic'), 'mock note');
    expectMatches(
      bookmarkSchema,
      await api.readerBookmarkCreate({
        kind: 'line',
        chapter: chapter?.title ?? '',
        chapterId: chapter?.id,
        paragraphId: paragraph?.id,
        paragraph: paragraph?.index,
      }),
      'mock bookmark',
    );
  });

  it('the manuscript import jobs from file selection to a committed import', async () => {
    const api = createMockApi();
    const selection = await api.selectManuscript();
    expectMatches(fileSelectionSchema, selection, 'mock file selection');
    const jobId = selection.jobId ?? '';
    expectMatches(workJobSchema, await api.manuscriptImportState(jobId), 'mock import state');
    expectMatches(workJobSchema, await api.manuscriptImportPreview(jobId, { markdownHeadingLevel: 1 }), 'mock import preview');
    expectMatches(workJobSchema, await api.manuscriptImportCommit(jobId, { confirmedReset: true }), 'mock import commit');
  });

  it.each(['docx', 'markdown', 'repaired', 'text'] as const)(
    'the %s import preview the review dialog is built on, sections of every kind and character suggestions',
    async (kind) => {
      const api = createMockApi({}, { importPreview: kind });
      const jobId = (await api.selectManuscript()).jobId ?? '';
      const job = await api.manuscriptImportPreview(jobId, { markdownHeadingLevel: 1 });
      expectMatches(workJobSchema, job, `mock ${kind} import preview`);
      expect(job.preview?.format).toBe({ docx: 'docx', markdown: 'markdown', repaired: 'docx', text: 'txt' }[kind]);
      // Every subtitle says where its line goes when it is turned off, as the host's does (a plain-text line returns to the text).
      const subtitled = job.preview?.sections?.filter((section) => section.subtitle) ?? [];
      expect(subtitled.length).toBeGreaterThan(0);
      for (const section of subtitled) expect(section.subtitleOff).toBe(kind === 'text' ? 'body' : 'title');
      expect(job.preview?.notices !== undefined).toBe(kind === 'repaired');
      expect(new Set(job.preview?.sections?.map((section) => section.contentKind))).toEqual(new Set(['narration', 'opening', 'reference']));
      expect(job.preview?.characterCandidates).toHaveLength(3);
      expectMatches(
        workJobSchema,
        await api.manuscriptImportCommit(jobId, { confirmedReset: false, selection: { subtitleOverrides: { [subtitled[0]?.id ?? '']: false } } }),
        `mock ${kind} import commit`,
      );
    },
  );

  it('the Story Bible entities, build job, created id and preview answers', async () => {
    const api = createMockApi();
    expectMatches(guideEntitiesSchema, await api.guideEntities(), 'mock entities');
    expectMatches(workJobSchema, await api.guideBuildState(), 'mock guide state');
    expectMatches(guideBuildResultSchema, await api.guideBuild(), 'mock guide build');
    expectMatches(guideBuildResultSchema, await api.guideBuild({ rulesOnly: true }), 'mock guide build, rules-only');
    expectMatches(guideBuildResultSchema, await createMockApi({}, { assets: 'downloading' }).guideBuild(), 'mock guide build, asking for the language model');
    expectMatches(guideCreatedSchema, { id: await api.guideCreate('New', 'Character', []) }, 'mock guide create');
    const entity = (await api.guideEntities())[0];
    expectMatches(guidePreviewSchema, await api.guidePreview(entity?.id ?? ''), 'mock preview');
    const queries = await api.guidePronunciationQueries();
    expectMatches(pronunciationQueriesSchema, queries, 'mock pronunciation queries');
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((row) => row.status !== 'author_confirmed')).toBe(true);
    const csv = await api.guidePronunciationQueriesCsv();
    expectMatches(pronunciationQueriesCsvSchema, csv, 'mock pronunciation queries CSV');
    expect(csv.count).toBe(queries.length);
  });

  it('the Story Bible dialogue cues and their correction', async () => {
    const api = createMockApi();
    const cues = await api.guideDialogueCues();
    expectMatches(guideDialogueCuesSchema, cues, 'mock dialogue cues');
    const unknown = cues.find((cue) => cue.speaker_entity_id === null);
    expect(unknown).toBeDefined();
    await api.guideCorrectCue(unknown?.id ?? '', 'alice');
    const corrected = (await api.guideDialogueCues()).find((cue) => cue.id === unknown?.id);
    expect(corrected).toMatchObject({ speaker_entity_id: 'alice', speaker_source: 'correction', corrected: true });
    // "unknown" clears a correction back to unknown, the same as an empty string.
    await api.guideCorrectCue(unknown?.id ?? '', 'unknown');
    const cleared = (await api.guideDialogueCues()).find((cue) => cue.id === unknown?.id);
    expect(cleared).toMatchObject({ speaker_entity_id: null, speaker_source: 'correction', corrected: true });
    await expect(api.guideCorrectCue('not-a-real-cue', 'alice')).rejects.toThrow();
  });

  it('the Story Bible review flags and speaker colour', async () => {
    const api = createMockApi();
    const entity = (await api.guideEntities()).find((row) => row.category === 'Character' && row.aliases.length > 0 && !row.locked);
    if (!entity) throw new Error('the mock has no unlocked character with an alias');
    const read = async () => (await api.guideEntities()).find((row) => row.id === entity.id);
    await api.guideFlagReview(entity.id);
    await api.guideFlagReview(entity.id, 0);
    expect((await read())?.review).toEqual({ entry: true, aliases: [entity.aliases[0].text] });
    await api.guideMarkReviewed(entity.id, 0);
    expect((await read())?.review).toEqual({ entry: true, aliases: [] });
    await api.guideMarkReviewed(entity.id);
    expect(await read()).toMatchObject({ review: { entry: false, aliases: [] }, review_state: 'reviewed' });
    await api.guideSetSpeakerColor(entity.id, 3);
    expect((await read())?.speaker_color).toBe(3);
    await api.guideSetSpeakerColor(entity.id, null);
    expect((await read())?.speaker_color).toBeUndefined();
    await expect(api.guideSetSpeakerColor(entity.id, 8)).rejects.toThrow('1 to 7');
    const place = (await api.guideEntities()).find((row) => row.category !== 'Character' && !row.locked);
    if (place) await expect(api.guideSetSpeakerColor(place.id, 2)).rejects.toThrow('Only a character speaks');
    expectMatches(guideEntitiesSchema, await api.guideEntities(), 'mock entities after review and colour');
  });

  it('the character bible: regions, approving a reference, revoking it and removing every reference', async () => {
    const api = createMockApi();
    const regions = await api.characterListRegions();
    expectMatches(characterRegionsSchema, regions, 'mock regions');
    expect(regions.length).toBeGreaterThan(0);
    const region = regions[0];
    const reference = await api.characterApprove('alice', region.guid, 'Anchor take.');
    expectMatches(characterReferenceSchema, reference, 'mock reference');
    expect(reference.characterId).toBe('alice');
    expect(reference.regionGuid).toBe(region.guid);
    const referenced = await api.characterReferences();
    expectMatches(approvedCharacterReferencesSchema, referenced, 'mock references');
    expect(referenced.some((row) => row.id === reference.id && !row.changedSinceApproval)).toBe(true);
    await api.characterRevoke(reference.id);
    expect((await api.characterReferences()).some((row) => row.id === reference.id)).toBe(false);
    // Approving a region that is not in the saved project is refused (the real host validates it too).
    await expect(api.characterApprove('alice', 'not-a-real-region', '')).rejects.toThrow();
    const seeded = await api.characterReferences();
    expect(seeded.length).toBeGreaterThan(0);
    await api.characterRemoveVoiceData();
    expect(await api.characterReferences()).toHaveLength(0);
  });

  it('the series voice bible: not in a series, a single-book series, and a multi-book series grouped by character', async () => {
    const solo = createMockApi({}, { seriesVoiceBible: 'not-in-series' });
    const notInSeries = await solo.seriesVoiceBible();
    expectMatches(seriesVoiceBibleSchema, notInSeries, 'mock series voice bible, not in a series');
    expect(notInSeries).toMatchObject({ inSeries: false });
    expect(notInSeries.characters).toBeUndefined();

    const oneBook = createMockApi({}, { seriesVoiceBible: 'single-book' });
    const single = await oneBook.seriesVoiceBible();
    expectMatches(seriesVoiceBibleSchema, single, 'mock series voice bible, one book so far');
    expect(single).toMatchObject({ inSeries: true, bookCount: 1 });
    expect(single.characters).toBeUndefined();

    const api = createMockApi();
    const bible = await api.seriesVoiceBible();
    expectMatches(seriesVoiceBibleSchema, bible, 'mock series voice bible');
    expect(bible.inSeries).toBe(true);
    expect(bible.bookCount).toBe(2);
    const alice = bible.characters?.find((character) => character.characterId === 'alice');
    expect(alice?.clips.length).toBeGreaterThanOrEqual(2);
    expect(alice?.clips.some((clip) => clip.isCurrentProject)).toBe(true);
    expect(alice?.clips.some((clip) => !clip.isCurrentProject)).toBe(true);

    const list = await api.seriesList();
    expectMatches(seriesListSchema, list, 'mock series list');
    expect(list.length).toBeGreaterThan(0);
    const created = await api.seriesSave('', 'New Series', ['/books/one']);
    expectMatches(seriesSchema, created, 'mock series save');
    expect(created.name).toBe('New Series');
    await expect(api.seriesSave('', '  ', [])).rejects.toThrow('needs a name');
    await api.seriesDelete(created.id);
    expect((await api.seriesList()).some((series) => series.id === created.id)).toBe(false);
  });

  it('re-importing an answered pronunciation query file applies a matched row and reports an unmatched one', async () => {
    const api = createMockApi();
    const queries = await api.guidePronunciationQueries();
    const row = queries[0];
    const aliasCell = row.aliasIndex === null ? '' : String(row.aliasIndex);
    const csvText =
      'word,entry_id,alias_index,status,note\n' +
      `${row.name},${row.entityId},${aliasCell},author_confirmed,Confirmed by the author\n` +
      'Ghost,not-a-real-entity,,researched,\n';
    const result = await api.guidePronunciationImportQueriesCsv(csvText);
    expectMatches(queryImportResultSchema, result, 'mock pronunciation query import');
    expect(result.applied).toBe(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain('line 3:');
    expect(result.issues[0]).toContain('Ghost');
    const after = await api.guidePronunciationQueries();
    expect(after.some((query) => query.entityId === row.entityId && query.aliasIndex === row.aliasIndex)).toBe(false);
  });

  it('the dictionary lookup answers: a word it has, one it does not, and the first-use gate', async () => {
    const api = createMockApi();
    const found = await api.systemLookup('“Curious,”');
    expectMatches(dictionaryLookupResultSchema, found, 'mock lookup');
    expect(found.status === 'ok' && found.query === 'curious' && found.entries.length).toBe(1);
    expectMatches(dictionaryLookupResultSchema, await api.systemLookup('zorblax'), 'mock lookup of a word it does not have');
    expectMatches(
      dictionaryLookupResultSchema,
      await createMockApi({}, { dictionary: 'missing' }).systemLookup('curious'),
      'mock lookup, asking for the dictionary',
    );
    await expect(api.systemLookup('two words')).rejects.toThrow(/single word/);
  });

  it('copy diagnostics answers the saved path', async () => {
    const api = createMockApi();
    expectMatches(copyDiagnosticsResultSchema, await api.systemCopyDiagnostics('last_run'), 'mock copy diagnostics');
  });

  it('the window zoom binding reads and sets a level', async () => {
    const api = createMockApi();
    const idle = await api.windowZoom();
    expectMatches(windowZoomSchema, idle, 'mock window zoom, idle');
    expect(idle.level).toBe(1.0);
    const zoomed = await api.windowSetZoom(1.25);
    expectMatches(windowZoomSchema, zoomed, 'mock window zoom, set to 125%');
    expect(zoomed.level).toBe(1.25);
    expect((await api.windowZoom()).level).toBe(1.25);
    // Defensively clamped, the same range the real host's `nearestZoomStep` promises (ADR 0201).
    expect((await api.windowSetZoom(5)).level).toBe(2.0);
    expect((await api.windowSetZoom(0.1)).level).toBe(1.0);
    const seeded = await createMockApi({}, { zoom: 1.5 }).windowZoom();
    expect(seeded.level).toBe(1.5);
    expectMatches(windowZoomSchema, readGolden('window-zoom.json'), 'window-zoom.json');
  });

  it('the project picker answers', async () => {
    const api = createMockApi({}, { projectFolder: '' });
    expectMatches(recentProjectsSchema, await api.projectRecents(), 'mock recents');
    expectMatches(recentProjectsSchema, await api.removeRecentProject('C:/Projects/Voltage-and-the-Undercroft'), 'mock recents after remove');
    expectMatches(projectFolderSelectionSchema, await api.selectProjectFolder(), 'mock folder selection');
    expectMatches(projectSwitchResultSchema, await api.switchProject('C:/Projects/Other', 'Other'), 'mock switch');
    expectMatches(projectSwitchResultSchema, await api.createProject('C:/Projects/New', 'New'), 'mock create');
  });

  it('the DAW link binding answers, linked and refused on a folder mismatch', async () => {
    expectMatches(dawLinkResultSchema, await createMockApi().linkDawFile(), 'mock link');
    expectMatches(dawLinkResultSchema, await createMockApi({}, { dawLinkMismatch: true }).linkDawFile(), 'mock link, folder mismatch');
  });

  it('the DAW launch binding answers', async () => {
    expectMatches(dawLaunchResultSchema, await createMockApi().launchDaw(), 'mock launch');
  });

  it('the credits template library, project values and preview answers', async () => {
    const api = createMockApi();
    const templates = await api.creditsTemplates();
    expectMatches(creditTemplatesSchema, templates, 'mock credit templates');
    expect(templates.length).toBeGreaterThan(0);
    const created = await api.saveCreditsTemplate('', 'opening', 'My opening', '[Title], by [Author].');
    expectMatches(creditTemplateSchema, created, 'mock saved credit template');
    const updated = await api.saveCreditsTemplate(created.id, 'opening', 'My opening (edited)', '[Title].');
    expect(updated.id).toBe(created.id);
    const duplicated = await api.duplicateCreditsTemplate(templates[0].id);
    expectMatches(creditTemplateSchema, duplicated, 'mock duplicated credit template');
    expect(duplicated.id).not.toBe(templates[0].id);
    await api.deleteCreditsTemplate(created.id);
    expect((await api.creditsTemplates()).some((template) => template.id === created.id)).toBe(false);

    const values = await api.creditsProjectValues();
    expectMatches(creditsProjectValuesResultSchema, values, 'mock credits project values');
    const saved = await api.saveCreditsProjectValues({ title: 'Neon', author: 'A. Writer' });
    expectMatches(creditsProjectValuesResultSchema.shape.values, saved, 'mock saved credits project values');
    const preview = await api.creditsPreview('[Title], written by [Author], narrated by [Narrator].');
    expectMatches(creditsRenderResultSchema, preview, 'mock credits preview');
    expect(preview.text).toBe('Neon, written by A. Writer, narrated by [Narrator].');
    expect(preview.unresolved).toEqual(['Narrator']);
  });

  // The prompt asks, "Not now", and a save that only fills.
  it('the credits setup prompt answers', async () => {
    const quiet = await createMockApi().creditsSetupState();
    expectMatches(creditsSetupStateSchema, quiet, 'mock credits setup, answered before');
    expect(quiet).toMatchObject({ needed: false, banner: false, dismissed: 'project' });

    const api = createMockApi({}, { creditsSetup: true });
    const asked = await api.creditsSetupState();
    expectMatches(creditsSetupStateSchema, asked, 'mock credits setup, asking');
    expect(asked.needed).toBe(true);
    expect(asked.fields.map((field) => field.token)).toEqual(['Title', 'Author', 'Narrator']);
    expect(asked.fields[0].candidate?.value).toBe('Alice’s Adventures in Wonderland');
    const notNow = await api.creditsSetupDismiss('session');
    expectMatches(creditsSetupStateSchema, notNow, 'mock credits setup, not now');
    expect(notNow).toMatchObject({ needed: false, banner: true, dismissed: 'session' });
    await api.saveCreditsProjectValues({ title: 'My Own Title' });
    const saved = await api.creditsSetupSave({ title: 'Alice', author: 'Lewis Carroll', narrator: 'Ada Finch' });
    expectMatches(creditsSetupStateSchema, saved, 'mock credits setup, saved');
    expect(saved).toMatchObject({ needed: false, banner: false, fields: [] });
    expect((await api.creditsProjectValues()).values.title).toBe('My Own Title');
  });

  it('the chapter announcements and retail sample answers', async () => {
    const api = createMockApi();
    const announcements = await api.creditsChapterAnnouncements('[Chapter]{: [Chapter Title]}.');
    expectMatches(creditsAnnouncementsSchema, announcements, 'mock chapter announcements');
    expect(announcements[0].result.text).toBe('Chapter 1: Down the Rabbit-Hole.');

    expectMatches(retailSampleAnswerSchema, await api.creditsRetailSample(), 'mock retail sample, none');
    const chapter = (await api.manuscriptChapters())[1];
    const [first, , third] = chapter.paragraphIds ?? [];
    const saved = await api.saveCreditsRetailSample(first.id, third.id);
    expectMatches(retailSampleAnswerSchema, saved, 'mock saved retail sample');
    expect(saved.sample).toMatchObject({ startChapterId: chapter.id, startLine: 1, endLine: 3 });
    expect(await api.creditsRetailSample()).toEqual(saved);
    await expect(api.saveCreditsRetailSample(first.id, 'p-9999')).rejects.toThrow(/pick the range again/);
    expectMatches(retailSampleAnswerSchema, await api.saveCreditsRetailSample('', ''), 'mock cleared retail sample');
  });

  it('the credits row statuses', async () => {
    const api = createMockApi();
    expectMatches(creditsStatusesSchema, await api.creditsStatuses(), 'mock credits statuses, empty');
    expect(await api.creditsStatuses()).toEqual({});

    const afterOpening = await api.setCreditsStatus('opening', 'finalized');
    expectMatches(creditsStatusesSchema, afterOpening, 'mock credits statuses, opening set');
    expect(afterOpening).toEqual({ opening: 'finalized' });

    const afterClosing = await api.setCreditsStatus('closing', 'recording');
    expectMatches(creditsStatusesSchema, afterClosing, 'mock credits statuses, both set');
    expect(afterClosing).toEqual({ opening: 'finalized', closing: 'recording' });
    expect(await api.creditsStatuses()).toEqual(afterClosing);
  });

  it('the credits rows recorded lengths, never leaking a manuscript chapter link', async () => {
    const api = createMockApi();
    const unlinked = await api.creditsRecordedLengths();
    expectMatches(creditsRecordedLengthsSchema, unlinked, 'mock credits recorded lengths, neither linked');
    expect(unlinked).toEqual({ opening: { recordedUnavailable: 'unlinked' }, closing: { recordedUnavailable: 'unlinked' } });

    const tracks = await api.tracksList();
    const confirmed = await api.chapterTrackMapConfirm(tracks.tracks[0].guid, 'credits-opening');
    expect(confirmed.chapterTitle).toBe('Opening credits');

    const afterLink = await api.creditsRecordedLengths();
    expectMatches(creditsRecordedLengthsSchema, afterLink, 'mock credits recorded lengths, opening linked');
    expect(afterLink.closing).toEqual({ recordedUnavailable: 'unlinked' });
    expect('recordedSeconds' in afterLink.opening).toBe(true);

    // The linked track went to credits-opening, never to a manuscript chapter of the same track.
    const chapters = await api.manuscriptChapters();
    expect(chapters.every((chapter) => chapter.recordedUnavailable === 'unlinked')).toBe(true);
  });

  it('the DAW catalog list and open-download-page answers, detected and not detected', async () => {
    const detected = await createMockApi().dawCatalogList();
    expectMatches(dawCatalogListSchema, detected, 'mock catalog, detected');
    expect(detected[0]?.installed).toBe(true);
    const notDetected = await createMockApi({}, { dawCatalogInstalled: false }).dawCatalogList();
    expectMatches(dawCatalogListSchema, notDetected, 'mock catalog, not detected');
    expect(notDetected[0]?.installed).toBe(false);
    expect(notDetected[0]?.path).toBeUndefined();
    await expect(createMockApi().dawCatalogOpenDownloadPage('reaper')).resolves.toBeUndefined();
    await expect(createMockApi().dawCatalogOpenDownloadPage('not-a-real-daw')).rejects.toThrow(/Unknown DAW catalog entry/);
  });

  it('pronunciation lookup opens for a known source and refuses an unknown one', async () => {
    const api = createMockApi();
    await expect(api.pronunciationLookupOpen('forvo', 'Mock Turtle')).resolves.toBeUndefined();
    await expect(api.pronunciationLookupOpen('youglish', 'café')).resolves.toBeUndefined();
    await expect(api.pronunciationLookupOpen('merriam_webster', 'croquet')).resolves.toBeUndefined();
    await expect(api.pronunciationLookupOpen('howjsay', 'croquet')).resolves.toBeUndefined();
    // @ts-expect-error an unknown source is a build-time error too; the mock also rejects it at runtime.
    await expect(api.pronunciationLookupOpen('wiktionary', 'croquet')).rejects.toThrow(/Unknown pronunciation lookup source/);
  });

  it('the Commons audio link opens for a word the fixture index has, and refuses one it does not', async () => {
    const api = createMockApi();
    await expect(api.pronunciationCommonsAudioOpen('Happy')).resolves.toBeUndefined();
    await expect(api.pronunciationCommonsAudioOpen('gloomy')).rejects.toThrow(/No Wikimedia Commons audio file/);
    await expect(api.pronunciationCommonsAudioOpen('   ')).rejects.toThrow(/empty word/);
  });

  it('the online pronunciation lookup: the key status, a lookup, the cache and a confirmed batch', async () => {
    const api = createMockApi();
    const absent = await api.pronunciationOnlineKeyStatus();
    expectMatches(pronunciationOnlineKeyStatusSchema, absent, 'mock key status');
    expect(absent.present).toBe(false);
    // Nothing is sent without the narrator's own key.
    await expect(api.pronunciationOnlineLookup('croquet')).rejects.toThrow(/key/);
    await expect(api.pronunciationOnlineKeySet('not a key')).rejects.toThrow(/does not look like/);
    const present = await api.pronunciationOnlineKeySet('0b5c1a3e-7d2f-4e6a-9c8b-2f1e0d9c8b7a');
    expectMatches(pronunciationOnlineKeyStatusSchema, present, 'mock key set');
    expect(JSON.stringify(present)).not.toContain('0b5c1a3e');
    const found = await api.pronunciationOnlineLookup('croquet');
    expectMatches(pronunciationOnlineResultSchema, found, 'mock lookup');
    expect(found).toMatchObject({ found: true, cached: false });
    expect((await api.pronunciationOnlineLookup('Croquet')).cached).toBe(true);
    expectMatches(pronunciationOnlineResultSchema, await api.pronunciationOnlineLookup('quorlen'), 'mock lookup, not found');
    // One word only: a passage or a file name is refused, as the host refuses it.
    await expect(api.pronunciationOnlineLookup('The Mock Turtle sighed deeply')).rejects.toThrow(/one word/);
    await expect(api.pronunciationOnlineLookup('C:\\Books\\alice.docx')).rejects.toThrow(/one word/);
    // A batch needs its distinct word count confirmed.
    await expect(api.pronunciationOnlineLookupBatch(['wren', 'Wren', 'alice'], 3)).rejects.toThrow(/confirmation/);
    const batch = await api.pronunciationOnlineLookupBatch(['wren', 'Wren', 'alice'], 2);
    expectMatches(pronunciationOnlineBatchResultSchema, batch, 'mock batch');
    expect(batch).toMatchObject({ words: 2, fetched: 2 });
    await expect(api.pronunciationOnlineSignUpOpen()).resolves.toBeUndefined();
    expectMatches(pronunciationOnlineKeyStatusSchema, await api.pronunciationOnlineKeyClear(), 'mock key clear');
  });
});

describe('answers of the mock client for the settings, voice, model, transcript and tracks bindings', () => {
  it('the Settings fields of both scopes, and a saved setting', async () => {
    const api = createMockApi();
    expectMatches(settingsForScopeSchema, await api.settingsForScope('global'), 'mock global settings');
    expectMatches(settingsForScopeSchema, await api.settingsForScope('project'), 'mock project settings');
    expectMatches(bootstrapSchema, await api.saveSettings('General', 'global', { log_verbosity: 'verbose' }), 'mock saved settings');
  });

  it('the voice and model catalogs and their install jobs', async () => {
    const api = createMockApi();
    expectMatches(ttsCatalogSchema, await api.ttsCatalog(), 'mock voice catalog');
    const voice = (await api.ttsCatalog()).voices[0]?.id ?? '';
    const started = await api.ttsInstall(voice);
    for (const job of [
      started,
      await api.ttsInstallState(started.id),
      await api.ttsInstallState(started.id),
      await api.ttsInstallState(started.id),
      await api.ttsInstallCancel(started.id),
    ]) {
      expectMatches(ttsInstallJobSchema, job, 'mock voice install job');
    }
    expectMatches(whisperCatalogSchema, await api.whisperCatalog(), 'mock model catalog');
    const model = (await api.whisperCatalog()).models[0]?.id ?? '';
    const running = await api.whisperInstall(model);
    for (const job of [
      running,
      await api.whisperInstallState(running.id),
      await api.whisperInstallState(running.id),
      await api.whisperInstallState(running.id),
    ]) {
      expectMatches(whisperInstallJobSchema, job, 'mock model install job');
    }
  });

  it('the list of every approved asset, its install job and a verify', async () => {
    const api = createMockApi();
    const catalog = await api.assetsList();
    expectMatches(assetCatalogSchema, catalog, 'mock asset list');
    expect(catalog.assets.map((asset) => asset.kind)).toEqual(['tts', 'whisper', 'spacy', 'dictionary']);
    const voice = catalog.assets[0];
    const started = await api.assetsInstall(voice.kind, voice.id);
    for (const job of [started, await api.assetsInstallState(started.id), await api.assetsInstallState(started.id), await api.assetsInstallState(started.id)]) {
      expectMatches(assetInstallJobSchema, job, 'mock asset install job');
    }
    expect((await api.assetsList()).assets[0].installState).toBe('installed');
    expectMatches(assetInstallJobSchema, await api.assetsInstallCancel(started.id), 'mock asset install cancel');
    expectMatches(assetVerifyResultSchema, await api.assetsVerify(voice.kind, voice.id), 'mock asset verify');
    await api.assetsRemove(voice.kind, voice.id);
    expect((await api.assetsList()).assets[0].installState).toBe('not_installed');
    await expect(api.assetsInstall('moonshine', 'x')).rejects.toThrow(/not in the approved catalog/);
  });

  it('the first-use gates for a model that is not installed, and a start that goes ahead', async () => {
    const api = createMockApi();
    const model = (await api.whisperCatalog()).models[0]?.id ?? '';
    expectMatches(startResultSchema, await api.transcriptStart({ model, chunk: '60', workers: '1', hints: '' }), 'mock transcript start');
    await api.whisperRemove(model);
    const gate = await api.transcriptStart({ model, chunk: '60', workers: '1', hints: '' });
    expect(gate.status).toBe('asset_required');
    expectMatches(startResultSchema, gate, 'mock transcript first-use gate');
    const chapter = (await api.manuscriptChapters())[0]?.id ?? '';
    expectMatches(teleprompterStartResultSchema, await api.teleprompterStart({ chapter, device: 'Microphone' }), 'mock teleprompter start');
  });

  it.each(['whisper', 'moonshine'] as const)('the teleprompter first-use gate names the engine whose model is missing (%s)', async (engine) => {
    const api = createMockApi({}, { assets: 'missing' });
    const chapter = (await api.manuscriptChapters())[0]?.id ?? '';
    const gate = await api.teleprompterStart({ chapter, device: 'Microphone', engine });
    expectMatches(teleprompterStartResultSchema, gate, `mock teleprompter first-use gate (${engine})`);
    expect(gate.status === 'asset_required' && gate.engine).toBe(engine);
  });

  it('the last completed run, the hints and the equivalence answer', async () => {
    const api = createMockApi();
    expectMatches(lastCompletedSchema, (await api.transcriptLastCompleted()) ?? null, 'mock last completed run');
    expectMatches(hintSuggestionsSchema, await api.transcriptSuggestHints(), 'mock hint suggestions');
    expectMatches(hintsSchema, await api.transcriptHints(), 'mock hints');
    expectMatches(equivalenceSchema, { message: await api.transcriptAddEquivalence('row-1') }, 'mock equivalence');
  });

  it.each(['available', 'found', 'failed', 'current', 'development', undefined] as const)('the update status the mock host answers (%s)', async (seed) => {
    const api = createMockApi({}, seed ? { update: seed } : {});
    expectMatches(updateStatusSchema, await api.updateStatus(), 'mock update status');
    expectMatches(updateStatusSchema, await api.updateCheck(), 'mock update check');
  });

  it.each(['downloading', 'available', 'download-fails'] as const)('the update download the mock host reports (%s)', async (seed) => {
    vi.useFakeTimers();
    const api = createMockApi({}, { update: seed });
    const started = await api.updateDownload();
    expectMatches(updateJobSchema, started, 'mock update download');
    for (let step = 0; step < 12; step++) {
      await vi.advanceTimersByTimeAsync(300);
      expectMatches(updateJobSchema, await api.updateJobState(started.id), 'mock update job');
    }
    expectMatches(updateJobSchema, await api.updateJobCancel(started.id), 'mock update job cancelled');
  });

  it('the update event the mock host sends when a background check found a release', async () => {
    vi.useFakeTimers();
    const seen: unknown[] = [];
    createMockApi({}, { update: 'found' }).subscribeUpdate((status) => seen.push(status));
    await vi.advanceTimersByTimeAsync(10);
    expect(seen).toHaveLength(1);
    expectMatches(updateStatusSchema, seen[0], 'mock update:status');
  });

  it('the Tracks answers', async () => {
    const api = createMockApi();
    expectMatches(tracksDiscoverySchema, await api.tracksDiscover(), 'mock tracks discovery');
    expectMatches(tracksProjectSchema, await api.tracksList(), 'mock tracks project');
    const several = createMockApi({}, { tracksCandidates: ['C:/A/A.rpp', 'C:/A/B.rpp'] });
    expectMatches(tracksDiscoverySchema, await several.tracksSelect('C:/A/B.rpp'), 'mock tracks selection');
    expectMatches(tracksDiscoverySchema, await createMockApi({}, { tracksCandidates: [] }).tracksDiscover(), 'mock tracks discovery, none found');
  });

  it('the ChapterTrackMap answers', async () => {
    const api = createMockApi();
    const empty = await api.chapterTrackMapList();
    expectMatches(chapterTrackMappingSchema, empty, 'mock chapter-track map, none confirmed');
    expect(empty.mappings).toHaveLength(0);

    const chapters = await api.manuscriptChapters();
    const confirmed = await api.chapterTrackMapConfirm('{0E4D1D7F-D039-674D-87E6-719376DE95EC}', chapters[0].id);
    expectMatches(trackMappingSchema, confirmed, 'mock chapter-track map confirmation');
    expect(confirmed.chapterTitle).toBe(chapters[0].title);

    const listed = await api.chapterTrackMapList();
    expectMatches(chapterTrackMappingSchema, listed, 'mock chapter-track map, one confirmed');
    expect(listed.mappings).toHaveLength(1);

    const cleared = await api.chapterTrackMapClear(confirmed.trackGuid);
    expectMatches(chapterTrackMappingSchema, cleared, 'mock chapter-track map after clear');
    expect(cleared.mappings).toHaveLength(0);

    await expect(api.chapterTrackMapConfirm('{0E4D1D7F-D039-674D-87E6-719376DE95EC}', 'not-a-real-chapter')).rejects.toThrow();
  });

  it('the ChapterTrackSet, ChapterTrackUnlink and ChapterTrackLinks answers', async () => {
    const api = createMockApi();
    const chapters = await api.manuscriptChapters();
    const ready = await api.chapterTrackLinks();
    expectMatches(chapterTrackLinksSchema, ready, 'mock chapter track links, ready');
    expect(ready.project).toBe('ready');
    expect(ready.tracks.length).toBeGreaterThan(0);

    const [first, second] = WIRE_TRACKS_PROJECT.tracks;
    await api.chapterTrackSet(chapters[0].id, first.guid);
    const moved = await api.chapterTrackSet(chapters[1].id, first.guid);
    expectMatches(chapterTrackSetSchema, moved, 'mock chapter track set, displacing a link');
    expect(moved.displaced?.chapterId).toBe(chapters[0].id);
    const relinked = await api.chapterTrackSet(chapters[1].id, second.guid);
    expect(relinked.displaced).toBeNull();
    expect(relinked.mappings.filter((mapping) => mapping.chapterId === chapters[1].id)).toHaveLength(1);

    const unlinked = await api.chapterTrackUnlink(chapters[1].id);
    expectMatches(chapterTrackMappingSchema, unlinked, 'mock chapter track unlink');
    expect(unlinked.mappings).toHaveLength(0);
    await expect(api.chapterTrackSet('not-a-real-chapter', first.guid)).rejects.toThrow();

    const noProject = await createMockApi({}, { tracksCandidates: [] }).chapterTrackLinks();
    expectMatches(chapterTrackLinksSchema, noProject, 'mock chapter track links, no project');
    expect(noProject.project).toBe('none');
    expect(noProject.tracks).toHaveLength(0);
  });

  it("TrackSelectInReaper selects the track, and agrees with the host's golden for standalone and experimental_off", async () => {
    const golden = z.record(z.string(), trackSelectResultSchema).parse(readGolden('track-select-results.json'));
    const [first] = WIRE_TRACKS_PROJECT.tracks;

    const selected = await createMockApi().trackSelectInReaper(first.guid);
    expectMatches(trackSelectResultSchema, selected, 'mock track select');
    expect(selected).toEqual({ outcome: 'selected', trackGuid: first.guid });

    const standalone = await createMockApi({}, { reaperState: 'unavailable' }).trackSelectInReaper(first.guid);
    expectMatches(trackSelectResultSchema, standalone, 'mock track select, standalone');
    expect([standalone.outcome, standalone.reason]).toEqual([golden.standalone.outcome, golden.standalone.reason]);

    const experimentalOff = await createMockApi({}, { reaperState: 'experimental_off' }).trackSelectInReaper(first.guid);
    expectMatches(trackSelectResultSchema, experimentalOff, 'mock track select, experimental off');
    expect([experimentalOff.outcome, experimentalOff.reason]).toEqual([golden.experimental_off.outcome, golden.experimental_off.reason]);

    await expect(createMockApi().trackSelectInReaper('')).rejects.toThrow();
  });

  it('the ChapterRegionsPreview and ChapterRegionsCreate answers', async () => {
    const api = createMockApi();
    const chapters = await api.manuscriptChapters();
    const [first] = WIRE_TRACKS_PROJECT.tracks;
    await api.chapterTrackSet(chapters[0].id, first.guid);
    const plan = await api.chapterRegionsPreview(first.guid, first.guid);
    expectMatches(chapterRegionPlanSchema, plan, 'mock chapter regions preview');
    expect(plan.rows.map((row) => row.kind)).toEqual(['opening', 'chapter', 'closing']);
    expect(plan.skipped.length).toBeGreaterThan(0);
    const created = await api.chapterRegionsCreate(first.guid, '', false);
    expectMatches(chapterRegionsCreatedSchema, created, 'mock chapter regions created');
    expect(created.sent).toBe(2);

    const noProject = createMockApi({}, { tracksCandidates: [] });
    expectMatches(chapterRegionPlanSchema, await noProject.chapterRegionsPreview('', ''), 'mock chapter regions, no project');
    await expect(noProject.chapterRegionsCreate('', '', false)).rejects.toThrow();
  });

  it('the chapter list carries recorded seconds only for a chapter with a linked track', async () => {
    const api = createMockApi();
    const chapters = await api.manuscriptChapters();
    expectMatches(chaptersSchema, chapters, 'mock chapters, nothing linked');
    expect(chapters.every((chapter) => chapter.recordedUnavailable === 'unlinked' && chapter.recordedSeconds === undefined)).toBe(true);

    const [first] = WIRE_TRACKS_PROJECT.tracks;
    await api.chapterTrackSet(chapters[0].id, first.guid);
    const linked = await api.manuscriptChapters();
    expectMatches(chaptersSchema, linked, 'mock chapters, one linked');
    expect(linked[0].recordedSeconds).toBeGreaterThan(0);
    expect(linked[0].recordedUnavailable).toBeUndefined();
  });

  it('the ChapterTrackMatch answers', async () => {
    const api = createMockApi();
    const chapters = await api.manuscriptChapters();
    const matched = await api.chapterTrackMatch(chapters[0].id);
    expectMatches(chapterTrackMatchSchema, matched, 'mock chapter-track match, matched by name');
    expect(matched.status).toBe('matched');
    expect(matched.recordedEnd).not.toBeNull();

    const last = chapters[chapters.length - 1].id;
    const unmatched = await api.chapterTrackMatch(last);
    expectMatches(chapterTrackMatchSchema, unmatched, 'mock chapter-track match, no track');
    expect(unmatched.status).toBe('none');
    expect(unmatched.track).toBeNull();

    await api.chapterTrackMapConfirm('{DA2D209F-D10F-5E46-93E7-098D96499ED0}', last);
    const confirmed = await api.chapterTrackMatch(last);
    expectMatches(chapterTrackMatchSchema, confirmed, 'mock chapter-track match, confirmed');
    expect(confirmed.status).toBe('confirmed');

    await expect(api.chapterTrackMatch('not-a-real-chapter')).rejects.toThrow();
  });

  it('the ChapterSuggestion answers', async () => {
    const none = await createMockApi().chapterSuggestion();
    expectMatches(chapterSuggestionSchema, none, 'mock chapter suggestion, nothing armed');
    expect(none.basis).toBe('none');

    const [chapter1, chapter2] = WIRE_TRACKS_PROJECT.tracks;
    const matched = await createMockApi({}, { armedTracks: [chapter2.guid] }).chapterSuggestion();
    expectMatches(chapterSuggestionSchema, matched, 'mock chapter suggestion, armed track matched');
    expect(matched.status).toBe('matched');
    expect(matched.chapter?.chapterTitle).toBe('Chapter 2');

    const ambiguous = await createMockApi({}, { armedTracks: [chapter1.guid, chapter2.guid] }).chapterSuggestion();
    expectMatches(chapterSuggestionSchema, ambiguous, 'mock chapter suggestion, two armed tracks');
    expect(ambiguous.status).toBe('ambiguous');
    expect(ambiguous.chapter).toBeNull();

    const linkedApi = createMockApi({}, { armedTracks: [chapter2.guid] });
    const chapters = await linkedApi.manuscriptChapters();
    await linkedApi.chapterTrackMapConfirm(chapter2.guid, chapters[4].id);
    const confirmed = await linkedApi.chapterSuggestion();
    expectMatches(chapterSuggestionSchema, confirmed, 'mock chapter suggestion, confirmed link');
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.chapter?.chapterId).toBe(chapters[4].id);
  });

  it('the ChaptersForTracks answers', async () => {
    const api = createMockApi();
    const [track1] = WIRE_TRACKS_PROJECT.tracks;
    const [item1] = track1.items;
    const result = await api.chaptersForTracks([track1.guid, item1.guid, item1.takeGuid, 'not-a-real-guid']);
    expectMatches(chaptersForTracksSchema, result, 'mock chapters for tracks');

    expect(result.tracks[track1.guid].status).toBe('matched');
    expect(result.tracks[track1.guid].chapter?.chapterTitle).toBe('Chapter 1');
    // The item and its active take resolve through the same track as the track GUID itself.
    expect(result.tracks[item1.guid]).toEqual(result.tracks[track1.guid]);
    expect(result.tracks[item1.takeGuid]).toEqual(result.tracks[track1.guid]);

    expect(result.tracks['not-a-real-guid'].status).toBe('');
    expect(result.tracks['not-a-real-guid'].error).toBeTruthy();
  });

  it('the line-identity state through a stamp and a read run, and its seeded states', async () => {
    vi.useFakeTimers();
    const api = createMockApi();
    const seen: unknown[] = [];
    api.subscribeLineIdentity((state) => seen.push(structuredClone(state)));
    expectMatches(
      lineIdentityStartResultSchema,
      await api.lineIdentityStamp([{ itemGuid: '{A}', lineId: 'c-0001', text: 'Chapter One' }], false),
      'mock stamp start',
    );
    await vi.advanceTimersByTimeAsync(300);
    expectMatches(lineIdentityStartResultSchema, await api.lineIdentityRead(), 'mock read start');
    await vi.advanceTimersByTimeAsync(300);
    expect(seen.length).toBeGreaterThan(3);
    for (const state of seen) expectMatches(lineIdentityStateSchema, state, 'mock lineidentity:state');
    expectMatches(lineIdentityStateSchema, await api.lineIdentityState(), 'mock line-identity state');
    for (const seed of ['success', 'conflict', 'error'] as const) {
      expectMatches(lineIdentityStateSchema, await createMockApi({}, { lineIdentity: seed }).lineIdentityState(), `mock line-identity seed ${seed}`);
    }
  });

  it('lineIdentityStamp refuses an empty row list, the way the Go service does', async () => {
    await expect(createMockApi().lineIdentityStamp([], false)).rejects.toThrow(/select at least one item/);
  });

  it('the pickups state through import, export, next, resolve and count, and its seeded states', async () => {
    vi.useFakeTimers();
    const api = createMockApi();
    const seen: unknown[] = [];
    api.subscribePickups((state) => seen.push(structuredClone(state)));
    const imported = await api.pickupsImport('start,note,tag\n1.5,Mispronounced,narrator\n9.25,Second pickup,\n');
    expectMatches(pickupsImportResultSchema, imported, 'mock import start');
    expect(imported.rowErrors).toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    expectMatches(pickupsStartResultSchema, await api.pickupsNext(), 'mock next start');
    await vi.advanceTimersByTimeAsync(300);
    expectMatches(pickupsStartResultSchema, await api.pickupsResolve(1.5), 'mock resolve start');
    await vi.advanceTimersByTimeAsync(300);
    expectMatches(pickupsStartResultSchema, await api.pickupsExport(), 'mock export start');
    await vi.advanceTimersByTimeAsync(300);
    expectMatches(pickupsStartResultSchema, await api.pickupsCount(), 'mock count start');
    await vi.advanceTimersByTimeAsync(300);
    expect(seen.length).toBeGreaterThan(5);
    for (const state of seen) expectMatches(pickupsStateSchema, state, 'mock pickups:state');
    expectMatches(pickupsStateSchema, await api.pickupsState(), 'mock pickups state');
    for (const seed of ['import-success', 'next-success', 'export-success', 'error'] as const) {
      expectMatches(pickupsStateSchema, await createMockApi({}, { pickups: seed }).pickupsState(), `mock pickups seed ${seed}`);
    }
  });

  it('pickupsImport reports every unusable row and throws when none are usable', async () => {
    const api = createMockApi();
    await expect(api.pickupsImport('not-a-number,First\n')).rejects.toThrow(/no valid pickups/);
    const result = await api.pickupsImport('1.5,Good row\nnot-a-number,Bad row\n');
    expect(result.rowErrors).toEqual(['line 2: could not parse this row']);
  });

  it('the render-config state through a configure run, and its seeded states', async () => {
    vi.useFakeTimers();
    const api = createMockApi();
    const seen: unknown[] = [];
    api.subscribeRenderConfig((state) => seen.push(structuredClone(state)));
    expectMatches(renderConfigSuggestedFolderSchema, await api.renderConfigSuggestFolder(), 'mock suggested folder');
    expectMatches(renderConfigStartResultSchema, await api.renderConfigConfigure('C:/Books/Alice/renders'), 'mock configure start');
    await vi.advanceTimersByTimeAsync(300);
    expect(seen.length).toBeGreaterThan(1);
    for (const state of seen) expectMatches(renderConfigStateSchema, state, 'mock renderconfig:state');
    expectMatches(renderConfigStateSchema, await api.renderConfigState(), 'mock render-config state');
    for (const seed of ['success', 'no-regions', 'error'] as const) {
      expectMatches(renderConfigStateSchema, await createMockApi({}, { renderConfig: seed }).renderConfigState(), `mock render-config seed ${seed}`);
    }
  });

  it('renderConfigConfigure refuses an empty folder, the way the Go service does', async () => {
    await expect(createMockApi().renderConfigConfigure('   ')).rejects.toThrow(/output folder is required/);
  });

  it('the cleanup-tools state through a launch, and its seeded states', async () => {
    vi.useFakeTimers();
    const api = createMockApi();
    const seen: unknown[] = [];
    api.subscribeCleanupTools((state) => seen.push(structuredClone(state)));
    expectMatches(cleanupToolsStartResultSchema, await api.cleanupToolsLaunch('repair_pops_clicks'), 'mock cleanup launch start');
    await vi.advanceTimersByTimeAsync(300);
    expect(seen.length).toBeGreaterThan(2);
    for (const state of seen) expectMatches(cleanupToolsStateSchema, state, 'mock cleanuptools:state');
    expectMatches(cleanupToolsStateSchema, await api.cleanupToolsState(), 'mock cleanup-tools state');
    for (const seed of ['launched', 'error'] as const) {
      expectMatches(cleanupToolsStateSchema, await createMockApi({}, { cleanupTools: seed }).cleanupToolsState(), `mock cleanup-tools seed ${seed}`);
    }
  });

  it('the retake-lane list and state through a pick, and their seeded states', async () => {
    vi.useFakeTimers();
    const api = createMockApi();
    const seen: unknown[] = [];
    api.subscribeRetakeLanes((state) => seen.push(structuredClone(state)));
    const list = await api.retakeLanesList();
    expectMatches(retakeLanesListSchema, list, 'mock retake-lanes list');
    const [line] = list.lines;
    expectMatches(retakeLanesStartResultSchema, await api.retakeLanesPick(line.lineId, line.retakes[1].itemGuid), 'mock retake-lane pick start');
    await vi.advanceTimersByTimeAsync(300);
    expect(seen.length).toBeGreaterThan(2);
    for (const state of seen) expectMatches(retakeLanesStateSchema, state, 'mock retakelanes:state');
    expectMatches(retakeLanesStateSchema, await api.retakeLanesState(), 'mock retake-lanes state');
    for (const seed of ['picked', 'error', 'none'] as const) {
      const seeded = createMockApi({}, { retakeLanes: seed });
      expectMatches(retakeLanesStateSchema, await seeded.retakeLanesState(), `mock retake-lanes seed ${seed}`);
      expectMatches(retakeLanesListSchema, await seeded.retakeLanesList(), `mock retake-lanes list seed ${seed}`);
    }
  });

  it('retakeLanesPick refuses a retake the list does not hold, the way the Go service does', async () => {
    const api = createMockApi();
    const [line] = (await api.retakeLanesList()).lines;
    await expect(api.retakeLanesPick('line-000099', line.retakes[0].itemGuid)).rejects.toThrow(/not on a fixed-lane track/);
  });

  it('the project-state check against the last comparison baseline', async () => {
    vi.useFakeTimers();
    try {
      const api = createMockApi();
      const seen: ProjectStateState[] = [];
      api.subscribeProjectState((state) => seen.push(structuredClone(state)));
      expectMatches(projectStateStartResultSchema, await api.projectStateCheck(), 'mock project-state check start');
      await vi.advanceTimersByTimeAsync(200);
      for (const state of seen) expectMatches(projectStateStateSchema, state, 'mock projectstate:state');
      const checked = await api.projectStateState();
      expectMatches(projectStateStateSchema, checked, 'mock project-state state');
      const baseline = (await api.transcriptLastCompleted())?.projectChangeCount;
      expect(baseline).toBe(41);
      const changed = await api.projectStateChangedSince(checked.changeCount ?? 0, baseline ?? 0);
      expectMatches(projectStateChangedSchema, changed, 'mock project-state changed since');
      expect(changed.changed).toBe(true);
      await expect(createMockApi({}, { projectState: 'error' }).projectStateCheck()).rejects.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cleanupToolsLaunch refuses a tool off the allow-list, the way the Go service does', async () => {
    await expect(createMockApi().cleanupToolsLaunch('40209' as never)).rejects.toThrow(/unknown cleanup tool/);
  });

  it('dawCapabilities and its subscribe emit the same picture, and match the host goldens for every launch kind', async () => {
    const api = createMockApi();
    expectMatches(dawCapabilitiesSchema, await api.dawCapabilities(), 'mock daw capabilities (default REAPER seed)');
    const seen: unknown[] = [];
    const unsubscribe = api.subscribeDawCapabilities((state) => seen.push(structuredClone(state)));
    expect(seen).toHaveLength(1);
    expectMatches(dawCapabilitiesSchema, seen[0], 'mock daw_capabilities_changed');
    unsubscribe();

    const standalone = await createMockApi({}, { daw: { daw: 'none' } }).dawCapabilities();
    expectMatches(dawCapabilitiesSchema, standalone, 'mock daw capabilities (standalone)');
    expect(standalone).toEqual(readGolden('daw-capabilities-standalone.json'));

    const audacity = await createMockApi({}, { daw: { daw: 'Audacity' } }).dawCapabilities();
    expectMatches(dawCapabilitiesSchema, audacity, 'mock daw capabilities (Audacity)');
    expect(audacity).toEqual(readGolden('daw-capabilities-audacity.json'));

    const builtIn = await createMockApi({}, { daw: { daw: 'Built-in' } }).dawCapabilities();
    expectMatches(dawCapabilitiesSchema, builtIn, 'mock daw capabilities (built-in recorder)');
    expect(builtIn).toEqual(readGolden('daw-capabilities-builtin.json'));

    // The host's own "daw-capabilities-reaper" golden is a REAPER launch with no live bridge at all (Bridge: false); the
    // mock's disconnected seed is the same shape.
    const disconnectedReaper = await createMockApi({}, { daw: { daw: 'REAPER', connected: false } }).dawCapabilities();
    expectMatches(dawCapabilitiesSchema, disconnectedReaper, 'mock daw capabilities (REAPER, not connected)');
    expect(disconnectedReaper).toEqual(readGolden('daw-capabilities-reaper.json'));
  });

  it('dawCapabilities reports a connected-but-unreachable REAPER as not_running, except the heartbeat capability itself', async () => {
    const state = await createMockApi({}, { daw: { daw: 'REAPER', connected: true, reachable: false } }).dawCapabilities();
    expect(state.reachable).toBe(false);
    expect(state.capabilities.navigate).toMatchObject({ available: false, reason: 'not_running' });
    expect(state.capabilities.heartbeat).toMatchObject({ available: true });
  });

  it('dawCapabilities turns an experimental capability on only when its own toggle, or the master switch, is on', async () => {
    const off = await createMockApi({}, { daw: {} }).dawCapabilities();
    expect(off.capabilities.punch).toMatchObject({ available: false, reason: 'experimental_off' });
    const toggledOn = await createMockApi({}, { daw: { toggles: { punch: 'on' } } }).dawCapabilities();
    expect(toggledOn.capabilities.punch).toMatchObject({ available: true });
    const masterOn = await createMockApi({}, { daw: { experimentalOn: true } }).dawCapabilities();
    expect(masterOn.capabilities.punch).toMatchObject({ available: true });
    const turnedOff = await createMockApi({}, { daw: { experimentalOn: true, toggles: { punch: 'off' } } }).dawCapabilities();
    expect(turnedOff.capabilities.punch).toMatchObject({ available: false, reason: 'turned_off' });
  });

  // SN-D2 (ADR 0810): the call result and the capability depth fields.
  it('dawResult parses the host goldens and rejects an undo count outside 0..12', () => {
    expectMatches(dawResultSchema, readGolden('daw-result-ok.json'), 'daw-result-ok.json');
    expectMatches(dawResultSchema, readGolden('daw-result-refused-stale.json'), 'daw-result-refused-stale.json');
    expectMatches(dawResultSchema, readGolden('daw-result-multi-step.json'), 'daw-result-multi-step.json');
    const ok = { ok: true, changed: true, message: 'Marker added.', undoSteps: 1 };
    expect(dawResultSchema.safeParse({ ...ok, undoSteps: -1 }).success).toBe(false);
    expect(dawResultSchema.safeParse({ ...ok, undoSteps: 13 }).success).toBe(false);
    expect(dawResultSchema.safeParse({ ...ok, undoSteps: 1.5 }).success).toBe(false);
  });

  // SN-D42 (ADR 0861): one refusal code, `stale`, beside the sentence.
  it('schema-accepts-the-code-and-nothing-else: dawResult takes code "stale" and rejects any other code', () => {
    const golden = dawResultSchema.parse(readGolden('daw-result-refused-stale.json'));
    expect(golden.code).toBe('stale');
    expect(golden.refused).toBe(golden.message);
    const sentence = 'The project changed in REAPER since this was read. Read it again, then try again.';
    const stale = { ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence, code: 'stale' };
    expect(dawResultSchema.safeParse(stale).success).toBe(true);
    expect(dawResultSchema.parse({ ...stale, code: null }).code).toBeUndefined();
    for (const code of ['Stale', 'track_missing', 'recording', '']) expect(dawResultSchema.safeParse({ ...stale, code }).success, code).toBe(false);
    expect(dawResultSchema.safeParse({ ...stale, undoSteps: 13 }).success).toBe(false);
  });

  it('dawCapabilities carries destructive and mode only where the declaration sets them, and rejects an unknown mode', async () => {
    const api = createMockApi({}, { daw: { toggles: { punch: 'off' }, depth: { punch: { destructive: true, mode: 'steps' }, record: { mode: 'native' } } } });
    const state = await api.dawCapabilities();
    expectMatches(dawCapabilitiesSchema, state, 'mock daw capabilities (with depth)');
    expect(state.capabilities.punch).toMatchObject({ available: false, reason: 'turned_off', destructive: true, mode: 'steps' });
    expect(state.capabilities.record).toMatchObject({ mode: 'native' });
    expect(state.capabilities.record).not.toHaveProperty('destructive');
    expect(state.capabilities.markers).not.toHaveProperty('mode');
    const golden = dawCapabilitiesSchema.parse(readGolden('daw-capabilities-reaper.json'));
    const withMode = (mode: string) => ({
      ...golden,
      capabilities: { ...golden.capabilities, punch: { ...golden.capabilities.punch, destructive: true, mode } },
    });
    expect(dawCapabilitiesSchema.safeParse(withMode('steps')).success).toBe(true);
    expect(dawCapabilitiesSchema.safeParse(withMode('other')).success).toBe(false);
  });

  it('providerCapabilities matches the host goldens on Windows and on the Linux development host', async () => {
    const windows = await createMockApi().providerCapabilities();
    expectMatches(providerCapabilitiesSchema, windows, 'mock provider capabilities (default Windows seed)');
    expect(windows).toEqual(readGolden('provider-capabilities-windows.json'));

    const linux = await createMockApi({}, { providers: { platform: 'linux' } }).providerCapabilities();
    expectMatches(providerCapabilitiesSchema, linux, 'mock provider capabilities (Linux development host)');
    expect(linux).toEqual(readGolden('provider-capabilities-linux.json'));
    expect(linux.asr.moonshine?.support).toMatchObject({ available: false, reason: 'unsupported' });
    expect(linux.capture.dshow?.default).toBe(false);
  });

  it('providerCapabilities reports an installed count only for an asset kind with a catalog', async () => {
    const state = await createMockApi({}, { providers: { installed: { whisper: 2, tts: 0 } } }).providerCapabilities();
    expectMatches(providerCapabilitiesSchema, state, 'mock provider capabilities (seeded installs)');
    expect(state.asr.whisper?.asset).toEqual({ kind: 'whisper', installed: 2 });
    expect(state.tts.piper?.asset).toEqual({ kind: 'tts', installed: 0 });
    expect(state.asr.moonshine?.asset).toEqual({ kind: 'moonshine' });
    expect(state.pronunciation.cmu?.asset).toBeUndefined();
  });

  it('masteringProviders and masteringChooseProvider match the host goldens (mastering port, ADR 0306)', async () => {
    const none = await createMockApi({}, { mastering: { hasProject: false } }).masteringProviders();
    expectMatches(masteringProvidersSchema, none, 'mock mastering chains (no project)');
    expect(none).toEqual(readGolden('mastering-providers-no-project.json'));

    const api = createMockApi();
    const chosen = await api.masteringChooseProvider('builtin');
    expectMatches(masteringProvidersSchema, chosen, 'mock mastering chains (builtin chosen)');
    expect(chosen).toEqual(readGolden('mastering-providers-builtin-chosen.json'));
    // The DAW row is Experimental: it can be chosen, and the project masters with it.
    const daw = await api.masteringChooseProvider('daw');
    expectMatches(masteringProvidersSchema, daw, 'mock mastering chains (daw chosen)');
    expect(daw).toEqual(readGolden('mastering-providers-daw-chosen.json'));
    // The Audacity row is Experimental too (ADR 0460): it can be chosen the same way.
    const audacity = await api.masteringChooseProvider('audacity');
    expectMatches(masteringProvidersSchema, audacity, 'mock mastering chains (audacity chosen)');
    expect(audacity).toEqual(readGolden('mastering-providers-audacity-chosen.json'));
    // A row this version does not have is refused, and the saved choice stays.
    await expect(api.masteringChooseProvider('dolby-atmos')).rejects.toThrow('There is no mastering chain called "dolby-atmos".');
    expect((await api.masteringProviders()).choice).toBe('audacity');
    expect((await api.masteringChooseProvider('')).choice).toBeNull();

    const stale = await createMockApi({}, { mastering: { choice: 'dolby-atmos' } }).masteringProviders();
    expectMatches(masteringProvidersSchema, stale, 'mock mastering chains (a stored choice this version does not have)');
    expect(stale).toEqual(readGolden('mastering-providers-unknown-choice.json'));
  });

  it('the built-in recorder matches the host goldens and records a take (ADR 0455)', async () => {
    const none = await createMockApi({}, { recording: { hasProject: false } }).recorderState();
    expectMatches(recorderStateSchema, none, 'mock recorder (no project)');
    expect(none).toEqual(readGolden('recorder-state-no-project.json'));
    expectMatches(recorderStateSchema, readGolden('recorder-state-recording.json'), 'recorder-state-recording.json');
    expect(await createMockApi().recorderDevices()).toEqual(readGolden('recorder-devices.json'));
    expectMatches(recorderDevicesResultSchema, await createMockApi({}, { recording: { devices: 'error' } }).recorderDevices(), 'mock recorder devices (error)');

    const api = createMockApi({}, { recording: { takes: 'none' } });
    const states: unknown[] = [];
    const levels: unknown[] = [];
    api.subscribeRecorderState((state) => states.push(state));
    api.subscribeRecorderLevel((level) => levels.push(level));
    await expect(api.recorderStart('Mic')).rejects.toThrow('choose the built-in recorder');
    expect((await api.recorderChooseEngine('builtin')).engine).toBe('builtin');
    const recording = await api.recorderStart('Analogue 1 + 2 (Focusrite USB Audio)');
    expectMatches(recorderStateSchema, recording, 'mock recorder (recording)');
    expect(recording).toMatchObject({ phase: 'recording', take: 'Take 001' });
    expect((await api.recorderStop()).phase).toBe('stopping');
    await vi.waitFor(async () => expect((await api.recorderState()).phase).toBe('idle'));
    const done = await api.recorderState();
    expectMatches(recorderStateSchema, done, 'mock recorder (a take finished)');
    expect(done.takes.map((take) => take.name)).toEqual(['Take 001']);
    expect(done.last?.name).toBe('Take 001');
    for (const state of states) expectMatches(recorderStateSchema, state, 'mock recording:state');
    expect(levels.length).toBeGreaterThan(0);
    for (const level of levels) expectMatches(recorderLevelSchema, level, 'mock recording:level');

    const golden = readGolden('recorder-state-takes.json') as { takes: unknown[] };
    expect(Object.keys((await createMockApi({}, { recording: { engine: 'builtin' } }).recorderState()).takes[0]).sort()).toEqual(
      Object.keys(golden.takes[0] as object).sort(),
    );
    await expect(createMockApi({}, { recording: { unavailable: true } }).recorderChooseEngine('builtin')).rejects.toThrow('not available');
  });

  it('recorderSetTakeLine and recorderSetTakeKeeper mark and undo', async () => {
    const api = createMockApi({}, { recording: { engine: 'builtin' } });
    const seeded = await api.recorderState();
    const [first, second] = seeded.takes;

    const assigned = await api.recorderSetTakeLine(first.name, 'p-000001');
    expectMatches(recorderStateSchema, assigned, 'mock recorder (a take assigned a line)');
    expect(assigned.takes.find((take) => take.name === first.name)?.lineId).toBe('p-000001@mock-sha');

    const cleared = await api.recorderSetTakeLine(first.name, '');
    expect(cleared.takes.find((take) => take.name === first.name)?.lineId).toBeNull();
    await expect(api.recorderSetTakeLine('Take 999', 'p-000001')).rejects.toThrow('not a take in this project');

    // Two takes sharing a line: marking one the keeper hands the mark over from the other.
    await api.recorderSetTakeLine(first.name, 'p-000002');
    await api.recorderSetTakeLine(second.name, 'p-000002');
    const firstKept = await api.recorderSetTakeKeeper(first.name, true);
    expectMatches(recorderStateSchema, firstKept, 'mock recorder (a take marked keeper)');
    expect(firstKept.takes.find((take) => take.name === first.name)?.keeper).toBe(true);
    const secondKept = await api.recorderSetTakeKeeper(second.name, true);
    expect(secondKept.takes.find((take) => take.name === first.name)?.keeper).toBe(false);
    expect(secondKept.takes.find((take) => take.name === second.name)?.keeper).toBe(true);
    const undone = await api.recorderSetTakeKeeper(second.name, false);
    expect(undone.takes.every((take) => !take.keeper)).toBe(true);

    await expect(createMockApi({}, { recording: { hasProject: false } }).recorderSetTakeLine('Take 001', 'p-000001')).rejects.toThrow('open a project');
    await expect(createMockApi({}, { recording: { hasProject: false } }).recorderSetTakeKeeper('Take 001', true)).rejects.toThrow('open a project');
  });

  it('subscribeDawTransport pushes the seeded transport once, and matches the host goldens', () => {
    const seen = (seed: Parameters<typeof createMockApi>[1]): unknown[] => {
      const events: unknown[] = [];
      createMockApi({}, seed).subscribeDawTransport((state) => events.push(structuredClone(state)))();
      expect(events).toHaveLength(1);
      expectMatches(dawTransportSchema, events[0], 'mock daw_transport_changed');
      return events;
    };
    expect(seen({})[0]).toEqual(readGolden('daw-transport-stopped.json'));
    expect(seen({ daw: { transport: { playing: true, recording: false, position: 12.5 } } })[0]).toEqual(readGolden('daw-transport-playing.json'));
    expect(seen({ daw: { transport: { playing: true, recording: true, position: 12.5 } } })[0]).toEqual(readGolden('daw-transport-recording.json'));
    // With no heartbeat to read, the host reports neither, whatever REAPER was last doing.
    const quiet = { playing: false, recording: false };
    const recording = { playing: true, recording: true, position: 1 };
    expect(seen({ daw: { daw: 'none', transport: recording } })[0]).toEqual(quiet);
    expect(seen({ daw: { connected: true, reachable: false, transport: recording } })[0]).toEqual(quiet);
    expect(seen({ daw: { toggles: { heartbeat: 'off' }, transport: recording } })[0]).toEqual(quiet);
  });

  it('dawProjectState and its subscribe answer the seeded project state, and match the host goldens', async () => {
    const read = async (seed: Parameters<typeof createMockApi>[1]): Promise<unknown> => {
      const api = createMockApi({}, seed);
      const answered = await api.dawProjectState();
      expectMatches(dawProjectStateSchema, answered, 'mock DawProjectState');
      const events: unknown[] = [];
      api.subscribeDawProjectState((state) => events.push(structuredClone(state)))();
      expect(events).toEqual([answered]);
      expectMatches(dawProjectStateSchema, events[0], 'mock daw_project_state_changed');
      return answered;
    };
    const savedAt = '2026-09-26T08:40';
    expect(await read({})).toEqual(readGolden('daw-project-state-idle.json'));
    expect(await read({ daw: { savedAt } })).toEqual(readGolden('daw-project-state-saved.json'));
    expect(await read({ daw: { savedAt, unsavedChanges: true, transport: { playing: true, recording: false, position: 12.5 } } })).toEqual(
      readGolden('daw-project-state-unsaved.json'),
    );
    expect(await read({ daw: { savedAt, transport: { playing: true, recording: true, position: 40.25 } } })).toEqual(
      readGolden('daw-project-state-recording.json'),
    );
    // With no heartbeat to read (no DAW, the built-in recorder, REAPER not answering, the capability off) it is the idle payload.
    const idle = readGolden('daw-project-state-idle.json');
    const live = { savedAt, unsavedChanges: true, transport: { playing: true, recording: true, position: 1 } };
    for (const daw of [
      { daw: 'none' as const, ...live },
      { daw: 'Built-in' as const, ...live },
      { daw: 'Audacity' as const, ...live },
      { reachable: false, ...live },
      { toggles: { heartbeat: 'off' as const }, ...live },
    ]) {
      expect(await read({ daw })).toEqual(idle);
    }
  });

  it('dawProjectStateSchema rejects a negative position, an unknown play state and an unknown key', () => {
    const valid = readGolden('daw-project-state-unsaved.json') as Record<string, unknown>;
    expect(dawProjectStateSchema.safeParse(valid).success).toBe(true);
    expect(dawProjectStateSchema.safeParse({ ...valid, playPosition: -1 }).success).toBe(false);
    expect(dawProjectStateSchema.safeParse({ ...valid, playState: 'paused' }).success).toBe(false);
    expect(dawProjectStateSchema.safeParse({ ...valid, projectFile: 'C:/Alice.rpp' }).success).toBe(false);
    expect(dawProjectStateSchema.safeParse({ ...valid, savedAt: undefined }).success).toBe(false);
  });

  it('chapterTagsPreview and its seeded states', async () => {
    expectMatches(chapterTagsPreviewSchema, await createMockApi().chapterTagsPreview(), 'mock chapter-tags preview idle');
    for (const seed of ['ready', 'not-rendered'] as const) {
      expectMatches(chapterTagsPreviewSchema, await createMockApi({}, { chapterTags: seed }).chapterTagsPreview(), `mock chapter-tags preview seed ${seed}`);
    }
  });

  it('chapterTagsEmbed writes a tagged copy, refuses a blank destination, and can be seeded to error', async () => {
    const api = createMockApi({}, { chapterTags: 'ready' });
    expectMatches(chapterTagsEmbedResultSchema, await api.chapterTagsEmbed('C:/Books/Alice/renders/Alice.mp3'), 'mock chapter-tags embed success');
    await expect(api.chapterTagsEmbed('   ')).rejects.toThrow(/choose the MP3 file/);
    await expect(
      createMockApi({}, { chapterTags: 'ready', chapterTagsEmbedAlwaysErrors: true }).chapterTagsEmbed('C:/Books/Alice/renders/Alice.mp3'),
    ).rejects.toThrow();
  });

  it('the take-review scan job answers, and the reads of every finding it saves', async () => {
    const api = createMockApi();
    expectMatches(takeReviewScanJobSchema, await api.takeReviewScanState(), 'mock take-review scan, idle');
    const started = await api.takeReviewScanStart({ chapterTrackName: 'Chapter 1' });
    expectMatches(takeReviewScanJobSchema, started, 'mock take-review scan, started');
    let job = started;
    while (job.phase === 'running') {
      job = await api.takeReviewScanState();
      expectMatches(takeReviewScanJobSchema, job, `mock take-review scan, ${job.phase} at ${job.percent}%`);
    }
    expect(job).toMatchObject({ phase: 'success', found: 2 });
    const { findings } = await api.findingsList({ analyzer: 'take-review' });
    expect(findings).toHaveLength(2);
    for (const finding of findings) expectMatches(takeReviewEvidenceSchema, finding.evidence, `mock take-review evidence of ${finding.id}`);
    await api.takeReviewScanStart({ chapterTrackName: 'Chapter 2' });
    expectMatches(takeReviewScanJobSchema, await api.takeReviewScanCancel(), 'mock take-review scan, cancelled');
    await expect(api.takeReviewScanStart({ chapterTrackName: '' })).rejects.toThrow(/choose a track/);
  });

  it('the evidence of the take comparison the host pins, and of the mock fixture', () => {
    const pinned = findingsPageSchema.parse(readGolden('findings-list-take-comparison.json'));
    expect(pinned.findings).toHaveLength(1);
    for (const finding of [...pinned.findings, WIRE_TAKE_COMPARISON_FINDING]) {
      expectMatches(takeComparisonEvidenceSchema, finding.evidence, `take-comparison evidence of ${finding.id}`);
    }
  });

  it('the take comparison job answers, and the comparison it saves', async () => {
    const api = createMockApi({}, { findings: WIRE_TAKE_REVIEW_FINDINGS });
    expectMatches(takeComparisonJobSchema, await api.takeComparisonState(), 'mock take comparison, idle');
    let job = await api.takeComparisonStart(WIRE_TAKE_REVIEW_FINDINGS[0].id);
    expectMatches(takeComparisonJobSchema, job, 'mock take comparison, started');
    await expect(api.takeComparisonStart(WIRE_TAKE_REVIEW_FINDINGS[0].id)).rejects.toThrow(/already running/);
    while (job.phase === 'running') {
      job = await api.takeComparisonState();
      expectMatches(takeComparisonJobSchema, job, `mock take comparison, ${job.phase} at ${job.percent}%`);
    }
    expect(job.phase).toBe('success');
    const saved = await api.findingsGet(job.comparisonId ?? '');
    expectMatches(takeComparisonEvidenceSchema, saved.evidence, 'mock take comparison evidence');
    await api.takeComparisonStart(WIRE_TAKE_REVIEW_FINDINGS[1].id);
    expectMatches(takeComparisonJobSchema, await api.takeComparisonCancel(), 'mock take comparison, cancelled');
    await expect(api.takeComparisonStart('missing')).rejects.toThrow(/not in the review list/);
  });

  it('the measurement job answers, with every file measured, unavailable or refused', async () => {
    const api = createMockApi();
    expectMatches(measureJobSchema, await api.measureState(), 'mock measurement, idle');
    await expect(api.measureAnalyze(MOCK_MEASURE_PATHS)).rejects.toThrow(/not chosen in the file picker/);
    const picked = await api.measurePickFiles();
    expectMatches(measurePickResultSchema, picked, 'mock measurement picker');
    await expect(api.measureAnalyze([])).rejects.toThrow(/at least one file/);
    let job = await api.measureAnalyze(picked.paths);
    expectMatches(measureJobSchema, job, 'mock measurement, started');
    await expect(api.measureAnalyze(picked.paths)).rejects.toThrow(/already running/);
    let percent = job.percent;
    while (job.phase === 'running') {
      job = await api.measureState();
      expectMatches(measureJobSchema, job, `mock measurement, ${job.phase} at ${job.percent}%`);
      expect(job.percent).toBeGreaterThanOrEqual(percent);
      percent = job.percent;
    }
    expect(job.phase).toBe('success');
    expect(job.files.map((file) => file.status)).toEqual(['measured', 'measured', 'failed']);
    expect(job.files[1].report?.integrated_lufs).toBeNull();
    const pinned = measureJobSchema.parse(readGolden('measure-success.json'));
    expect(job.message).toBe(pinned.message);
    await api.measureAnalyze(picked.paths);
    await api.measureState();
    const cancelled = await api.measureCancel();
    expectMatches(measureJobSchema, cancelled, 'mock measurement, cancelled');
    expect(cancelled.files.map((file) => file.status)).toEqual(['cancelled', 'cancelled', 'cancelled']);
  });

  it('the export job masters (when asked) and encodes every picked file, in the shape the host pins', async () => {
    const api = createMockApi();
    expectMatches(exportJobSchema, await api.exportState(), 'mock export, idle');
    await expect(api.exportStart({ items: MOCK_EXPORT_ITEMS, master: false, format: 'mp3' })).rejects.toThrow(/not chosen in the file picker/);
    const picked = await api.exportPickFiles();
    expectMatches(measurePickResultSchema, picked, 'mock export picker');
    expect(picked.paths).toEqual(MOCK_EXPORT_PATHS);
    await expect(api.exportStart({ items: [], master: false, format: 'mp3' })).rejects.toThrow(/at least one file/);
    let job = await api.exportStart({ items: MOCK_EXPORT_ITEMS, master: true, format: 'mp3' });
    expectMatches(exportJobSchema, job, 'mock export, started');
    await expect(api.exportStart({ items: MOCK_EXPORT_ITEMS, master: true, format: 'mp3' })).rejects.toThrow(/already running/);
    let percent = job.percent;
    while (job.phase === 'running') {
      job = await api.exportState();
      expectMatches(exportJobSchema, job, `mock export, ${job.phase} at ${job.percent}%`);
      expect(job.percent).toBeGreaterThanOrEqual(percent);
      percent = job.percent;
    }
    expect(job.phase).toBe('success');
    expect(job.files.every((file) => file.status === 'done' && file.encodedPath && file.mastering)).toBe(true);

    await api.exportStart({ items: MOCK_EXPORT_ITEMS, master: false, format: 'mp3' });
    await api.exportState();
    const cancelledExport = await api.exportCancel();
    expectMatches(exportJobSchema, cancelledExport, 'mock export, cancelled');
    expect(cancelledExport.files.some((file) => file.status === 'cancelled')).toBe(true);
  });

  it("the package job assembles the profile's book checklist from an export's own encoded files, in the shape the host pins", async () => {
    const api = createMockApi();
    expectMatches(packageJobSchema, await api.packageState(), 'mock package, idle');
    const profile = await api.deliveryProfiles();
    const acx = profile.profiles.find((candidate) => candidate.id === 'acx')!;

    await expect(
      api.packageStart({ profileId: acx.id, profileVersion: acx.version, items: [{ kind: 'chapter', title: 'Chapter 01', path: 'C:/not-encoded.mp3' }] }),
    ).rejects.toThrow(/not encoded in this session/);

    await api.exportPickFiles();
    let job = await api.exportStart({ items: MOCK_EXPORT_ITEMS, master: false, format: 'mp3' });
    while (job.phase === 'running') job = await api.exportState();
    const items = job.files.map((file) => ({ kind: file.kind, title: file.title, path: file.encodedPath! }));

    const missingRetailSample = items.filter((item) => item.kind !== 'retail_sample');
    const refused = await api.packageStart({ profileId: acx.id, profileVersion: acx.version, items: missingRetailSample });
    expectMatches(packageJobSchema, refused, 'mock package, refused (missing retail sample)');
    expect(refused.phase).toBe('error');
    expect(refused.checklist.find((entry) => entry.ruleId === 'acx.retail_sample')?.status).toBe('missing');

    const built = await api.packageStart({ profileId: acx.id, profileVersion: acx.version, items });
    expectMatches(packageJobSchema, built, 'mock package, success');
    expect(built.phase).toBe('success');
    expect(built.files).toHaveLength(items.length);
    expect(built.checklist.every((entry) => entry.status !== 'missing')).toBe(true);
  });

  it(
    "packageStartMulti reuses one profile's encoded files for a matching format and re-encodes once for a " + 'differing one, in the shape the host pins',
    async () => {
      const api = createMockApi();
      expectMatches(multiPackageJobSchema, await api.packageMultiState(), 'mock multi-package, idle');
      const profilesState = await api.deliveryProfiles();
      const acx = profilesState.profiles.find((candidate) => candidate.id === 'acx')!;

      await expect(api.packageStartMulti({ selections: [], items: [] })).rejects.toThrow(/at least one platform/);
      await expect(api.packageStartMulti({ selections: [{ profileId: 'not-a-real-profile', profileVersion: '' }], items: [] })).rejects.toThrow(
        /no delivery profile/,
      );

      await api.exportPickFiles();
      let job = await api.exportStart({ items: MOCK_EXPORT_ITEMS, master: false, format: 'mp3' });
      while (job.phase === 'running') job = await api.exportState();
      const items = job.files.map((file) => ({ kind: file.kind, title: file.title, path: file.encodedPath! }));

      // Two selections of the same (mp3-requiring) built-in profile reuse one encoded file per format and bitrate.
      const built = await api.packageStartMulti({
        selections: [
          { profileId: acx.id, profileVersion: acx.version },
          { profileId: acx.id, profileVersion: acx.version },
        ],
        items,
      });
      expectMatches(multiPackageJobSchema, built, 'mock multi-package, success (matching format)');
      expect(built.phase).toBe('success');
      expect(built.results).toHaveLength(2);
      expect(built.results.every((result) => result.phase === 'success')).toBe(true);
      expect(built.results.every((result) => result.files.every((file) => file.name.endsWith('.mp3')))).toBe(true);

      const missingRetailSample = items.filter((item) => item.kind !== 'retail_sample');
      const refused = await api.packageStartMulti({ selections: [{ profileId: acx.id, profileVersion: acx.version }], items: missingRetailSample });
      expectMatches(multiPackageJobSchema, refused, 'mock multi-package, error');
      expect(refused.phase).toBe('error');
      expect(refused.results[0].phase).toBe('error');
    },
  );

  it(
    "the mock's own multi-package re-encode logic runs once per differing format, not once per selected profile: " +
      'a synthetic profile requiring M4B (no built-in profile asks for anything ' +
      'but MP3 today) turns credits and retail sample off so it can be judged from chapters alone',
    async () => {
      const m4b = structuredClone(MOCK_ACX);
      m4b.id = 'm4b-mock';
      m4b.builtIn = false;
      m4b.name = 'M4B Platform';
      m4b.platform = 'M4B Platform';
      for (const rule of m4b.rules) {
        if (rule.id === 'acx.format') rule.metric = 'm4b_format';
        if (rule.id === 'acx.credits' || rule.id === 'acx.retail_sample') rule.off = true;
      }
      const published: unknown[] = [];
      const api = createRenderEncodeMasterMock(
        (event) => published.push(event),
        undefined,
        () => MOCK_ACX,
        () => [MOCK_ACX, m4b],
      );
      await api.exportPickFiles();
      let job = await api.exportStart({ items: MOCK_EXPORT_ITEMS, master: false, format: 'mp3' });
      while (job.phase === 'running') job = await api.exportState();
      const items = job.files.map((file) => ({ kind: file.kind, title: file.title, path: file.encodedPath! }));

      const built = await api.packageStartMulti({
        selections: [
          { profileId: 'm4b-mock', profileVersion: '' },
          { profileId: MOCK_ACX.id, profileVersion: MOCK_ACX.version },
        ],
        items,
      });
      expectMatches(multiPackageJobSchema, built, 'mock multi-package, success (mixed reuse and re-encode)');
      expect(built.phase).toBe('success');
      const m4bResult = built.results.find((result) => result.profile === 'm4b-mock')!;
      const acxResult = built.results.find((result) => result.profile === MOCK_ACX.id)!;
      expect(m4bResult.files.every((file) => file.name.endsWith('.m4b'))).toBe(true);
      expect(acxResult.files.every((file) => file.name.endsWith('.mp3'))).toBe(true);
    },
  );

  it('an MP3 is judged on its container, and the mock judges it as the host pins', () => {
    const pinned = measureJobSchema.parse(readGolden('measure-mp3.json'));
    expect(pinned.profile).not.toBeNull();
    for (const file of pinned.files) {
      expect(file.report?.mp3).toBeDefined();
      const mock = evaluateMockFile(file.report!, file.path, pinned.profile!);
      expect(mock.rules).toEqual(file.rules);
      expect(mock.findings.map((finding) => deliveryQcEvidenceSchema.parse(finding.evidence))).toEqual(
        file.findings.map((finding) => deliveryQcEvidenceSchema.parse(finding.evidence)),
      );
    }
    expect(pinned.files.map((file) => file.rules.find((rule) => rule.ruleId === 'acx.format')?.violation)).toEqual([undefined, 'not_cbr']);
  });

  it("a measurement is judged by the host against the project's profile, rule by rule, in the shape the host pins", async () => {
    const pinned = measureJobSchema.parse(readGolden('measure-success.json'));
    const pinnedFindings = pinned.files.flatMap((file) => file.findings);
    expect(pinnedFindings.map((finding) => deliveryQcEvidenceSchema.parse(finding.evidence).rule)).toEqual([
      'acx.sample_rate',
      'acx.rms',
      'acx.peak',
      'acx.noise_floor',
      'acx.room_tone_head',
      'acx.room_tone_tail',
    ]);
    const api = createMockApi();
    const picked = await api.measurePickFiles();
    let job = await api.measureAnalyze(picked.paths);
    while (job.phase === 'running') job = await api.measureState();
    expectMatches(measureJobSchema, job, 'mock measurement, judged');
    const shape = (files: typeof job.files) =>
      files.map((file) => [
        file.rules.map((rule) => [rule.ruleId, rule.status, rule.violation]),
        file.findings.map((finding) => [
          finding.severity,
          deliveryQcEvidenceSchema.parse(finding.evidence).rule,
          deliveryQcEvidenceSchema.parse(finding.evidence).violation,
        ]),
      ]);
    expect(shape(job.files)).toEqual(shape(pinned.files));
    expect(job.bookRules).toEqual(pinned.bookRules);
    expect(job.profile).toEqual(pinned.profile);
    const copy = await api.deliveryDuplicateProfile('acx', '2026-09');
    await api.deliverySelectProfile('project', copy.id, '');
    expect((await api.measureState()).profile?.id).toBe(copy.id);
  });

  it('the delivery findings the Review page lists carry their rule, as the host pins them and the mock saves them', async () => {
    const pinned = findingsPageSchema.parse(readGolden('findings-list-delivery-qc.json'));
    const api = createMockApi();
    let job = await api.measureAnalyze((await api.measurePickFiles()).paths);
    while (job.phase === 'running') job = await api.measureState();
    const saved = await api.findingsList({ category: 'delivery_qc' });
    expectMatches(findingsPageSchema, saved, 'mock delivery findings on the Review page');
    expect(saved.total).toBeGreaterThan(0);
    // The same ids Master & QC gives them, so a decision on either page is one decision.
    const judged = new Set(job.files.flatMap((file) => file.findings.map((finding) => finding.id)));
    expect(saved.findings.every((finding) => judged.has(finding.id))).toBe(true);
    const shape = (finding: (typeof saved.findings)[number]) => {
      const evidence = deliveryQcEvidenceSchema.parse(finding.evidence);
      return [
        finding.analyzer,
        finding.category,
        Boolean(finding.evidence_version),
        Boolean(evidence.rule_label && evidence.requirement && evidence.profile_name),
        Boolean(finding.source.file),
      ];
    };
    for (const finding of [...pinned.findings, ...saved.findings]) expect(shape(finding)).toEqual(['measure', 'delivery_qc', true, true, true]);
  });

  it('the delivery profiles answer as the host pins them, and refuse the way the host does', async () => {
    const pinned = deliveryProfilesStateSchema.parse(readGolden('delivery-profiles.json'));
    expect(pinned.profiles[0]).toEqual(MOCK_ACX);
    const api = createMockApi();
    const state = await api.deliveryProfiles();
    expectMatches(deliveryProfilesStateSchema, state, 'mock delivery profiles');
    expect(state).toMatchObject({ globalDefault: pinned.globalDefault, projectProfile: 'acx@2026-09', projectChoice: null });
    const copy = await api.deliveryDuplicateProfile('acx', '2026-09');
    expectMatches(deliveryProfileSchema, copy, 'mock duplicate');
    expect(copy).toMatchObject({ builtIn: false, revision: 1, basedOn: 'acx@2026-09', name: 'ACX (September 2026) copy' });
    const rules = copy.rules.map((rule) => ({
      id: rule.id,
      off: rule.id === 'acx.room_tone_head',
      min: rule.min,
      max: rule.id === 'acx.peak' ? -3.5 : rule.max,
    }));
    const saved = await api.deliverySaveProfile({ id: copy.id, name: 'My ACX, tighter peak', rules });
    expectMatches(deliveryProfileSchema, saved, 'mock saved profile');
    const pinnedSaved = deliveryProfileSchema.parse(readGolden('delivery-profile-saved.json'));
    expect({ ...saved, id: pinnedSaved.id }).toEqual({ ...pinnedSaved, revision: 2 });
    await expect(api.deliverySaveProfile({ id: 'acx', name: 'ACX', rules: [] })).rejects.toThrow(/built-in/);
    await expect(api.deliverySaveProfile({ id: copy.id, name: 'x', rules: rules.slice(1) })).rejects.toThrow(/cannot add or drop/);
    const chosen = await api.deliverySelectProfile('project', copy.id, '');
    expect(chosen.projectProfile).toBe(`${copy.id}@r2`);
    await expect(api.deliverySelectProfile('project', 'missing', '')).rejects.toThrow(/no delivery profile/);
    const deleted = await api.deliveryDeleteProfile(copy.id);
    expectMatches(deliveryProfilesStateSchema, deleted, 'mock after delete');
    expect(deleted.notice).toMatch(/no longer there/);
    await expect(api.deliveryDeleteProfile('acx')).rejects.toThrow(/built-in/);
    expect((await createMockApi({}, { deliveryProfile: 'custom' }).deliveryProfiles()).projectProfile).toBe(`${mockCustomProfile().id}@r3`);
  });

  it('the report export answers what it wrote, and refuses the way the host does', async () => {
    const pinned = deliveryReportExportSchema.parse(readGolden('delivery-report-export.json'));
    const api = createMockApi();
    await expect(api.deliveryExportReport(false)).rejects.toThrow(/nothing has been measured or checked/);
    const picked = await api.measurePickFiles();
    let job = await api.measureAnalyze(picked.paths);
    await expect(api.deliveryExportReport(false)).rejects.toThrow(/wait for the measurement/);
    while (job.phase === 'running') job = await api.measureState();
    const written = await api.deliveryExportReport(false);
    expectMatches(deliveryReportExportSchema, written, 'mock report export');
    expect(written).toMatchObject({ folder: pinned.folder, htmlFile: pinned.htmlFile, files: 3, findings: 6, openFindings: 6, pathsIncluded: false });
    const again = await api.deliveryExportReport(true);
    expect(again.htmlFile).toBe('delivery-report-20260923-140000Z-2.html');
    expect(again.pathsIncluded).toBe(true);
  });

  it('the diagnostics job answers over the picked files, with the findings and thresholds the host pins', async () => {
    const api = createMockApi();
    const idle = await api.diagnosticsState();
    expectMatches(diagnosticsJobSchema, idle, 'mock diagnostics, idle');
    const pinnedIdle = diagnosticsJobSchema.parse(readGolden('diagnostics-idle.json'));
    expect(idle.thresholds).toEqual(pinnedIdle.thresholds);
    await expect(api.diagnosticsAnalyze(MOCK_MEASURE_PATHS, 'processed_render')).rejects.toThrow(/not chosen in the file picker/);
    const picked = await api.measurePickFiles();
    await expect(api.diagnosticsAnalyze(picked.paths, 'master' as never)).rejects.toThrow(/raw recordings or processed renders/);
    await expect(api.diagnosticsAnalyze([], 'processed_render')).rejects.toThrow(/at least one file/);
    let job = await api.diagnosticsAnalyze(picked.paths, 'processed_render');
    expectMatches(diagnosticsJobSchema, job, 'mock diagnostics, started');
    await expect(api.diagnosticsAnalyze(picked.paths, 'processed_render')).rejects.toThrow(/already running/);
    let percent = job.percent;
    while (job.phase === 'running') {
      job = await api.diagnosticsState();
      expectMatches(diagnosticsJobSchema, job, `mock diagnostics, ${job.phase} at ${job.percent}%`);
      expect(job.percent).toBeGreaterThanOrEqual(percent);
      percent = job.percent;
    }
    const pinned = diagnosticsJobSchema.parse(readGolden('diagnostics-success.json'));
    expect(job.message).toBe(pinned.message);
    expect(job.files.map((file) => file.status)).toEqual(pinned.files.map((file) => file.status));
    expect(job.files[0].findings).toEqual(pinned.files[0].findings.map((finding) => ({ ...finding, source: { file: MOCK_MEASURE_PATHS[0] } })));
    expect(job.files[1].findings).toEqual([]);
    const raw = await api.diagnosticsAnalyze(picked.paths, 'raw_recording');
    expect(raw.sourceKind).toBe('raw_recording');
    const cancelled = await api.diagnosticsCancel();
    expectMatches(diagnosticsJobSchema, cancelled, 'mock diagnostics, cancelled');
    expect(cancelled.files.map((file) => file.status)).toEqual(['cancelled', 'cancelled', 'cancelled']);
  });

  it('the evidence of every take-review finding the host pins, and of the mock fixture', () => {
    const pinned = findingsPageSchema.parse(readGolden('findings-list-take-review.json'));
    for (const finding of [...pinned.findings, ...WIRE_TAKE_REVIEW_FINDINGS]) {
      expectMatches(takeReviewEvidenceSchema, finding.evidence, `take-review evidence of ${finding.id}`);
    }
  });

  it('the answers for going to and looping one read of a take-review finding', async () => {
    const api = createMockApi();
    await api.takeReviewScanStart({ chapterTrackName: 'Chapter 1' });
    while ((await api.takeReviewScanState()).phase === 'running');
    const [finding] = (await api.findingsList({ analyzer: 'take-review' })).findings;
    expectMatches(findingNavigationSchema, await api.findingsGoToRead(finding.id, 1), 'mock go to read');
    expectMatches(findingNavigationSchema, await api.findingsLoopRead(finding.id, 1), 'mock loop read');
    for (const reaper of ['standalone', 'stale'] as const) {
      const refusing = createMockApi({}, { reaper, findings: WIRE_TAKE_REVIEW_FINDINGS });
      expectMatches(findingNavigationSchema, await refusing.findingsGoToRead(WIRE_TAKE_REVIEW_FINDINGS[0].id, 0), `mock ${reaper} go to read`);
    }
  });

  it('the review bindings answers', async () => {
    const api = createMockApi();
    const page = await api.findingsList({ includeNotInLatestRun: true });
    expectMatches(findingsPageSchema, page, 'mock findings list');
    expect(page.total).toBe(page.findings.length);
    expect(page.findings.length).toBeGreaterThan(0);
    const shown = page.findings[0];
    expectMatches(findingSchema, await api.findingsGet(shown.id), 'mock findings get');
    const reviewed = await api.findingsReview({ id: shown.id, evidenceVersion: shown.evidence_version ?? '', status: 'deferred', note: 'Check tomorrow.' });
    expectMatches(findingSchema, reviewed, 'mock findings review');
    const retyped = await api.findingsSetType(shown.id, shown.evidence_version ?? '', 'breath');
    expectMatches(findingSchema, retyped, 'mock findings retype');
    expect(retyped.review).toMatchObject({ status: 'deferred', type: 'breath' });
    expectMatches(findingsSummarySchema, await api.findingsSummary(), 'mock findings summary');
    const empty = createMockApi({}, { findings: [] });
    expectMatches(findingsPageSchema, await empty.findingsList({}), 'mock findings list, empty queue');
    expectMatches(findingsSummarySchema, await empty.findingsSummary(), 'mock findings summary, empty queue');
  });

  it('the findings summary schema rejects a negative or fractional decided or cleared count', () => {
    const summary = {
      total: 1,
      unreviewed: 0,
      accepted: 0,
      dismissed: 1,
      deferred: 0,
      decided: 1,
      cleared: 1,
      notInLatestRun: 0,
      analyzers: [],
      categories: [],
      chapters: [],
    };
    expect(findingsSummarySchema.safeParse(summary).success).toBe(true);
    expect(findingsSummarySchema.safeParse({ ...summary, cleared: -1 }).success).toBe(false);
    expect(findingsSummarySchema.safeParse({ ...summary, decided: 0.5 }).success).toBe(false);
  });

  it('the review REAPER bindings answers, every outcome and refusal', async () => {
    const api = createMockApi();
    const { findings } = await api.findingsList({ includeNotInLatestRun: true });
    const placed = findings.find((finding) => finding.source.item_guid && finding.time_range?.source_start !== undefined);
    const older = findings.find((finding) => finding.analyzer === 'transcript-compare' && !finding.source.item_guid);
    if (!placed || !older) throw new Error('the mock findings lost the finding with an item or the one from an older comparison');
    const answers: Array<[string, Promise<unknown>]> = [
      ['go to', api.findingsGoTo(placed.id)],
      ['loop', api.findingsLoop(placed.id)],
      ['status while looping', api.findingsReaperStatus()],
      ['stop', api.findingsStopLoop()],
      ['no item', api.findingsGoTo(older.id)],
    ];
    for (const reaper of ['standalone', 'not-running', 'stale', 'recording', 'outdated'] as const) {
      const refusing = createMockApi({}, { reaper });
      answers.push([`${reaper} status`, refusing.findingsReaperStatus()], [`${reaper} go to`, refusing.findingsGoTo(placed.id)]);
      answers.push([`${reaper} loop`, refusing.findingsLoop(placed.id)], [`${reaper} stop`, refusing.findingsStopLoop()]);
    }
    for (const [name, answer] of answers) {
      const value = await answer;
      const schema = name.endsWith('status') || name === 'status while looping' ? reaperStatusSchema : findingNavigationSchema;
      expectMatches(schema, value, `mock ${name}`);
    }
  });

  it('the approved marker answers, every outcome and refusal', async () => {
    const api = createMockApi();
    const { findings } = await api.findingsList({ includeNotInLatestRun: true });
    const placed = findings.find((finding) => finding.source.item_guid && finding.time_range?.source_start !== undefined);
    if (!placed) throw new Error('the mock findings lost the finding with an item');
    const accept = { id: placed.id, evidenceVersion: placed.evidence_version ?? '', status: 'accepted', note: '' } as const;
    const answers: Array<[string, unknown]> = [['not accepted', await api.findingsAddMarker(placed.id)]];
    await api.findingsReview(accept);
    answers.push(['added', await api.findingsAddMarker(placed.id)], ['existing', await api.findingsAddMarker(placed.id)]);
    for (const reaper of ['standalone', 'not-running', 'stale', 'recording', 'outdated'] as const) {
      const refusing = createMockApi({}, { reaper });
      await refusing.findingsReview(accept);
      answers.push([reaper, await refusing.findingsAddMarker(placed.id)]);
    }
    for (const [name, answer] of answers) expectMatches(findingMarkerSchema, answer, `mock add marker, ${name}`);
  });

  it('the take-creation answer', async () => {
    const api = createMockApi();
    const result = await api.takeReviewCreateTake({
      findingId: 'finding-1',
      targetItemGuid: '{AAAAAAAA-0000-4000-8000-000000000001}',
      candidateItemGuid: '',
      sourceFile: 'C:/Projects/Alice/media/chapter1-take2.wav',
      sourceRangeStart: 0,
      sourceRangeEnd: 3,
    });
    expectMatches(takeReviewCreateTakeResultSchema, result, 'mock take creation');
    expect(result.targetItemGuid).toBe('{AAAAAAAA-0000-4000-8000-000000000001}');
  });

  it('the recording coverage answers: a current, a never and a stale result, a check to its end, and every refusal', async () => {
    const api = createMockApi();
    const chapters = await api.manuscriptChapters();
    const measured = chapters.find((chapter) => chapter.recordedFraction !== undefined);
    if (!measured) throw new Error('the mock chapters carry a measured recordedFraction');
    const current = await api.coverageResult(measured.id);
    expectMatches(coverageResultSchema, current, 'mock coverage result, current');
    expect(current.state).toBe('current');
    expect(current.recordedFraction).toBe(measured.recordedFraction);
    const unknown = await api.coverageResult('no-such-chapter');
    expectMatches(coverageResultSchema, unknown, 'mock coverage result, never');
    expect(unknown).toMatchObject({ state: 'never', reasons: ['chapter_not_found'] });
    expectMatches(coverageStateSchema, await api.coverageState(), 'mock coverage state, idle');

    const staleApi = createMockApi({}, { coverage: { stale: [measured.id] } });
    const stale = await staleApi.coverageResult(measured.id);
    expectMatches(coverageResultSchema, stale, 'mock coverage result, stale');
    expect(stale.state).toBe('stale');
    expect(stale.recordedFraction).toBeUndefined();
    const staleChapter = (await staleApi.manuscriptChapters()).find((chapter) => chapter.id === measured.id);
    expect(staleChapter?.recordedFraction).toBeUndefined();

    vi.useFakeTimers();
    try {
      const states: unknown[] = [];
      const ended: string[] = [];
      api.subscribeCoverage((state) => states.push(state));
      api.subscribeJobEnded((event) => ended.push(`${event.kind}:${event.outcome}`));
      const started = await api.coverageStart(measured.id);
      expectMatches(coverageStartResultSchema, started, 'mock coverage start');
      expect(started.status).toBe('started');
      const busy = await api.coverageStart(measured.id);
      expectMatches(coverageStartResultSchema, busy, 'mock coverage start, busy');
      expect(busy).toMatchObject({ status: 'refused', reason: 'busy' });
      await vi.runAllTimersAsync();
      states.forEach((state, index) => expectMatches(coverageStateSchema, state, `mock coverage:state ${index}`));
      expect(await api.coverageState()).toMatchObject({ phase: 'complete', percent: 100 });
      expect(ended).toEqual(['recording_coverage:success']);
    } finally {
      vi.useRealTimers();
    }

    for (const reason of COVERAGE_REFUSAL_REASONS) {
      const refused = await createMockApi({}, { coverage: { refusal: reason } }).coverageStart(measured.id);
      expectMatches(coverageStartResultSchema, refused, `mock coverage start, refused ${reason}`);
      expect(refused).toMatchObject({ status: 'refused', reason });
    }
    const gated = await createMockApi({}, { assets: 'missing' }).coverageStart(measured.id);
    expectMatches(coverageStartResultSchema, gated, 'mock coverage start, model not installed');
    expect(gated.status).toBe('asset_required');
  });

  it('the model cascade names both models, gates on the re-check model, and "Check with tiny only" skips it', async () => {
    const api = createMockApi();
    const chapters = await api.manuscriptChapters();
    const measured = chapters.find((chapter) => chapter.recordedFraction !== undefined);
    if (!measured) throw new Error('the mock chapters carry a measured recordedFraction');

    const cascadeApi = createMockApi({}, { coverage: { cascade: [measured.id] } });
    const result = await cascadeApi.coverageResult(measured.id);
    expectMatches(coverageResultSchema, result, 'mock coverage result, cascade');
    expect(result.result?.recheck).toMatchObject({ model: 'large-v3-turbo', wholeChapter: false, windows: 1 });

    const gate = await createMockApi({}, { coverage: { recheckAssetRequired: true } }).coverageStart(measured.id);
    expectMatches(coverageStartResultSchema, gate, 'mock coverage start, re-check model not installed');
    expect(gate).toMatchObject({ status: 'recheck_asset_required', model: { id: 'large-v3-turbo' } });

    vi.useFakeTimers();
    try {
      const skipApi = createMockApi({}, { coverage: { recheckAssetRequired: true } });
      const started = await skipApi.coverageStart(measured.id, { skipRecheck: true });
      expectMatches(coverageStartResultSchema, started, 'mock coverage start, tiny only');
      expect(started.status).toBe('started');
      await vi.runAllTimersAsync();
      expect(await skipApi.coverageState()).toMatchObject({ phase: 'complete' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('the workspace alignment shares the coverage result state and reads the chapter as tokens', async () => {
    const api = createMockApi();
    const chapters = await api.manuscriptChapters();
    const measured = chapters.find((chapter) => chapter.recordedFraction !== undefined);
    if (!measured) throw new Error('the mock chapters carry a measured recordedFraction');

    const current = await api.workspaceAlignment(measured.id);
    expectMatches(workspaceAlignmentResultSchema, current, 'mock workspace alignment, current');
    expect(current.state).toBe('current');
    expect(current.needsAlignAgain).toBe(false);
    expect(current.paragraphs.length).toBeGreaterThan(0);
    expect(current.tokens.length).toBeGreaterThan(0);
    expect(current.tokens.every((token) => token.status === 'read')).toBe(true);

    const unknown = await api.workspaceAlignment('no-such-chapter');
    expectMatches(workspaceAlignmentResultSchema, unknown, 'mock workspace alignment, never');
    expect(unknown).toMatchObject({ state: 'never', paragraphs: [], tokens: [] });
  });

  it('the heard words (ADR 0855): a score is null with a reason, only an extra run is added, and the mock carries both', async () => {
    const golden = JSON.parse(readFileSync(`${GOLDEN_DIR}workspace-alignment-added-words.json`, 'utf8'));
    const parsed = workspaceAlignmentResultSchema.parse(golden);
    expect(parsed.engine).toEqual({ id: 'whisper:small', name: 'Whisper small' });
    expect(parsed.tokens.every((token) => token.conf === null && token.confReason === 'no_word_scores')).toBe(true);
    expect(parsed.extras.flatMap((extra) => extra.words ?? []).map((word) => word.timing)).toEqual(['spread', 'spread', 'unplaced', 'unplaced', 'spread']);

    const withToken = (patch: Record<string, unknown>) => ({ ...golden, tokens: [{ ...golden.tokens[0], ...patch }] });
    expect(workspaceAlignmentResultSchema.safeParse(withToken({ conf: 0.9, confReason: 'no_word_scores' })).success).toBe(false);
    expect(workspaceAlignmentResultSchema.safeParse(withToken({ conf: null, confReason: null })).success).toBe(false);
    expect(workspaceAlignmentResultSchema.safeParse(withToken({ added: true })).success).toBe(false);
    // A later score needs no wire change: a number beside no reason is accepted.
    expect(workspaceAlignmentResultSchema.safeParse(withToken({ conf: 0.9, confReason: null })).success).toBe(true);

    const measured = (await createMockApi().manuscriptChapters()).find((chapter) => chapter.recordedFraction !== undefined);
    if (!measured) throw new Error('the mock chapters carry a measured recordedFraction');
    // A confirmed link to a live item, so the mock times its words (as the workspace peaks row below seeds it).
    const [linkedTrack] = WIRE_TRACKS_PROJECT.tracks;
    const link = {
      trackGuid: linkedTrack.guid,
      chapterId: measured.id,
      chapterTitle: measured.title,
      confirmedAt: '2026-09-24T09:00:00Z',
      origin: 'manual' as const,
      match: null,
    };
    const mock = await createMockApi({}, { chapterTrackMappings: [link] }).workspaceAlignment(measured.id);
    expectMatches(workspaceAlignmentResultSchema, mock, 'mock workspace alignment, heard words');
    expect(mock.engine).toBeDefined();
    expect(mock.tokens.every((token) => token.conf === null && token.confReason === 'no_word_scores')).toBe(true);
    expect(mock.tokens.some((token) => token.status === 'misread')).toBe(true);
    expect(mock.extras.flatMap((extra) => extra.words ?? []).every((word) => word.added && word.timing === 'spread')).toBe(true);
    expect(mock.extras.flatMap((extra) => extra.words ?? []).length).toBeGreaterThan(0);
  });

  it('the workspace snap moves a cut within 2 ms, the same for the same time, and the schema refuses what the host never sends', async () => {
    const api = createMockApi();
    for (const t of [0, 12.3456, 166.5, 200]) {
      const first = await api.workspaceSnap('chapter-1', '{MOCK-ITEM}', t);
      expectMatches(workspaceSnapResultSchema, first, 'mock workspace snap');
      expect(Math.abs(first.time - t)).toBeLessThanOrEqual(0.002 + 1e-9);
      expect(await api.workspaceSnap('chapter-1', '{MOCK-ITEM}', t)).toEqual(first);
    }
    const snapped = { chapterId: 'c', itemGuid: '{I}', sourceTime: 1, outcome: 'snapped', time: 1, moved: 0 };
    expect(workspaceSnapResultSchema.safeParse(snapped).success).toBe(true);
    expect(workspaceSnapResultSchema.safeParse({ ...snapped, sourceTime: -1 }).success).toBe(false);
    expect(workspaceSnapResultSchema.safeParse({ ...snapped, time: -0.001 }).success).toBe(false);
    expect(workspaceSnapResultSchema.safeParse({ ...snapped, moved: 0.01 }).success).toBe(false);
    expect(workspaceSnapResultSchema.safeParse({ ...snapped, path: '/x.wav' }).success).toBe(false);
    expect(workspaceSnapResultSchema.safeParse({ ...snapped, outcome: 'refused', reason: 'silent', message: 'x', moved: 0.001 }).success).toBe(false);
  });

  it("the workspace peaks answer the live item's waveform, deterministically", async () => {
    const chapters = await createMockApi().manuscriptChapters();
    const measured = chapters.find((chapter) => chapter.recordedFraction !== undefined);
    if (!measured) throw new Error('the mock chapters carry a measured recordedFraction');
    // WIRE_TRACKS_PROJECT's own "Chapter 1" track is the only one with a supported, source-available item -
    // workspacePeaks needs a confirmed link to a live item, which the base mock fixtures don't seed by default.
    const [linkedTrack] = WIRE_TRACKS_PROJECT.tracks;
    const api = createMockApi(
      {},
      {
        chapterTrackMappings: [
          {
            trackGuid: linkedTrack.guid,
            chapterId: measured.id,
            chapterTitle: measured.title,
            confirmedAt: '2026-09-24T09:00:00Z',
            origin: 'manual',
            match: null,
          },
        ],
      },
    );

    const first = await api.workspacePeaks(measured.id);
    expectMatches(workspacePeaksResultSchema, first, 'mock workspace peaks');
    expect(first.chapterId).toBe(measured.id);
    expect(first.items.length).toBeGreaterThan(0);
    expect(first.items[0].peaks?.buckets).toBeGreaterThan(0);
    expect(first.items[0].reason).toBeUndefined();

    const second = await api.workspacePeaks(measured.id);
    expect(second).toEqual(first);

    const unknown = await api.workspacePeaks('no-such-chapter');
    expectMatches(workspacePeaksResultSchema, unknown, 'mock workspace peaks, no live item');
    expect(unknown.items).toEqual([]);
  });

  it('the workspace REAPER bindings answers, every outcome and refusal', async () => {
    const api = createMockApi();
    const chapters = await api.manuscriptChapters();
    const measured = chapters.find((chapter) => chapter.recordedFraction !== undefined);
    if (!measured) throw new Error('the mock chapters carry a measured recordedFraction');
    const alignment = await api.workspaceAlignment(measured.id);
    if (alignment.tokens.length < 2) throw new Error('the mock chapter needs at least two heard tokens');

    const answers: Array<[string, Promise<unknown>]> = [
      ['go to', api.workspaceGoTo(measured.id, 0)],
      ['loop', api.workspaceLoop(measured.id, 0, 1)],
    ];
    for (const reaper of ['standalone', 'not-running', 'stale', 'recording', 'outdated'] as const) {
      const refusing = createMockApi({}, { reaper });
      answers.push([`${reaper} go to`, refusing.workspaceGoTo(measured.id, 0)], [`${reaper} loop`, refusing.workspaceLoop(measured.id, 0, 1)]);
    }
    for (const [name, answer] of answers) expectMatches(findingNavigationSchema, await answer, `mock workspace ${name}`);
  });

  it("workspaceListFXChains lists the narrator's FX chains, and rejects when REAPER is not connected", async () => {
    const chains = await createMockApi().workspaceListFXChains();
    expectMatches(workspaceFXChainsResultSchema, chains, 'mock workspace FX chains');
    expect(chains.names.length).toBeGreaterThan(0);
    expect(chains.truncated).toBe(false);

    await expect(createMockApi({}, { reaper: 'standalone' }).workspaceListFXChains()).rejects.toThrow();
  });

  it('the passage effects: the plug-in list, add-to-passage and chain-on-track answer the schema, and refuse what the host refuses', async () => {
    const measured = (await createMockApi().manuscriptChapters()).find((chapter) => chapter.recordedFraction !== undefined);
    if (!measured) throw new Error('the mock chapters carry a measured recordedFraction');
    // A live item needs a confirmed chapter link (the peaks test above seeds the same one).
    const [linkedTrack] = WIRE_TRACKS_PROJECT.tracks;
    const chapterTrackMappings = [
      {
        trackGuid: linkedTrack.guid,
        chapterId: measured.id,
        chapterTitle: measured.title,
        confirmedAt: '2026-09-24T09:00:00Z',
        origin: 'manual' as const,
        match: null,
      },
    ];
    const api = createMockApi({}, { chapterTrackMappings });
    const plugins = await api.workspaceListFX();
    expectMatches(workspaceFXPluginsResultSchema, plugins, 'mock workspace plug-ins');
    expect(plugins.names.length).toBeGreaterThan(0);
    await expect(createMockApi({}, { reaper: 'standalone' }).workspaceListFX()).rejects.toThrow();

    const alignment = await api.workspaceAlignment(measured.id);
    const heard = alignment.tokens.filter((token) => token.item !== undefined);
    expect(heard.length).toBeGreaterThan(1);
    const answers: [string, Promise<unknown>][] = [
      ['added', api.workspaceAddTakeFX(measured.id, heard[0].i, heard[1].i, 'ReaEQ (Cockos)')],
      ['applied', api.workspaceApplyFXChain(measured.id, 'Podcast Voice.RfxChain')],
      ['bad range', api.workspaceAddTakeFX(measured.id, 5, 2, 'ReaEQ (Cockos)')],
      ['outside the alignment', api.workspaceAddTakeFX(measured.id, 0, 999999, 'ReaEQ (Cockos)')],
    ];
    for (const reaper of ['standalone', 'not-running', 'stale', 'recording', 'outdated'] as const) {
      const refusing = createMockApi({}, { reaper, chapterTrackMappings });
      answers.push([`${reaper} add`, refusing.workspaceAddTakeFX(measured.id, heard[0].i, heard[1].i, 'ReaEQ (Cockos)')]);
      answers.push([`${reaper} chain`, refusing.workspaceApplyFXChain(measured.id, 'Podcast Voice.RfxChain')]);
    }
    for (const [name, answer] of answers) expectMatches(workspaceFXResultSchema, await answer, `mock workspace effect ${name}`);
    expect(await answers[0][1]).toMatchObject({ outcome: 'added', plugin: 'ReaEQ (Cockos)' });
    expect(await answers[1][1]).toMatchObject({ outcome: 'applied', chain: 'Podcast Voice.RfxChain' });
    expect(await answers[2][1]).toMatchObject({ outcome: 'refused', reason: 'bad_range' });
  });

  it('the Takes panel bindings answer: the passage takes, their comparison and every outcome of using one', async () => {
    const chapters = await createMockApi().manuscriptChapters();
    const measured = chapters.find((chapter) => chapter.recordedFraction !== undefined);
    if (!measured) throw new Error('the mock chapters carry a measured recordedFraction');
    const [linkedTrack] = WIRE_TRACKS_PROJECT.tracks;
    const linked = {
      chapterTrackMappings: [
        {
          trackGuid: linkedTrack.guid,
          chapterId: measured.id,
          chapterTitle: measured.title,
          confirmedAt: '2026-09-24T09:00:00Z',
          origin: 'manual' as const,
          match: null,
        },
      ],
    };
    const api = createMockApi({}, linked);

    const takes = await api.workspaceTakes(measured.id, 0, 1);
    expectMatches(workspaceTakesResultSchema, takes, 'mock workspace takes');
    expect(takes.candidates.map((candidate) => candidate.source)).toEqual(['item_take', 'item_take', 'lane_retake', 'take_review']);
    expect(takes.candidates.filter((candidate) => candidate.active)).toHaveLength(1);
    expect(takes.candidates.find((candidate) => candidate.source === 'take_review')?.confirm).toBe(true);
    expect(takes.comparisonId).toBeUndefined();
    await expect(api.workspaceTakes(measured.id, 0, 99999)).rejects.toThrow(/not in this chapter's alignment/);

    // A passage nothing was heard on has no takes and says why (the mock chapter's unheard words are its skipped paragraph).
    const alignment = await api.workspaceAlignment(measured.id);
    const unheard = alignment.tokens.findIndex((token) => token.item === undefined);
    if (unheard >= 0) {
      const none = await api.workspaceTakes(measured.id, unheard, unheard);
      expectMatches(workspaceTakesResultSchema, none, 'mock workspace takes, none');
      expect(none.candidates).toEqual([]);
      expect(none.message).toMatch(/wasn't heard/);
    }

    // Comparing them is the one take comparison job, and it marks what it covered.
    let job = await api.workspaceTakesCompareStart(measured.id, 0, 1);
    expectMatches(takeComparisonJobSchema, job, 'mock passage comparison, started');
    expect(job.findingId).toBe(takes.passageId);
    while (job.phase === 'running') job = await api.takeComparisonState();
    expect(job.phase).toBe('success');
    const saved = await api.findingsGet(job.comparisonId ?? '');
    expectMatches(takeComparisonEvidenceSchema, saved.evidence, 'mock passage comparison evidence');
    const compared = await api.workspaceTakes(measured.id, 0, 1);
    expect(compared.comparisonId).toBe(saved.id);
    expect(compared.candidates.every((candidate) => candidate.compared && candidate.fidelity !== undefined)).toBe(true);

    // Using a take: another take is made active, an already-playing one changes nothing, a lane pick starts, a read is added.
    const [first, second, lane, read] = takes.candidates;
    const changed = await api.workspaceUseTake(measured.id, 0, 1, second.id);
    expectMatches(workspaceUseTakeResultSchema, changed, 'mock use take, done');
    expect(changed).toMatchObject({ outcome: 'done', changed: true });
    expect((await api.workspaceTakes(measured.id, 0, 1)).candidates.find((candidate) => candidate.active)?.id).toBe(second.id);
    expect(await api.workspaceUseTake(measured.id, 0, 1, second.id)).toMatchObject({ outcome: 'done', changed: false });
    expect(await api.workspaceUseTake(measured.id, 0, 1, lane.id)).toMatchObject({ outcome: 'started' });
    expect(await api.workspaceUseTake(measured.id, 0, 1, read.id)).toMatchObject({ outcome: 'done', changed: true });
    expect(await api.workspaceUseTake(measured.id, 0, 1, first.id)).toMatchObject({ outcome: 'done', changed: true });
    const notOffered = await api.workspaceUseTake(measured.id, 0, 1, 'take:{NOT-OFFERED}:{TAKE}');
    expectMatches(workspaceUseTakeResultSchema, notOffered, 'mock use take, not offered');
    expect(notOffered).toMatchObject({ outcome: 'refused', reason: 'not_offered', changed: false });

    // REAPER's refusals: each one refuses in the host's words and changes nothing.
    const refusals = { standalone: 'standalone', 'not-running': 'not_running', stale: 'stale', recording: 'recording', outdated: 'script_outdated' } as const;
    for (const [reaper, reason] of Object.entries(refusals)) {
      const refusing = createMockApi({}, { ...linked, reaper: reaper as keyof typeof refusals });
      const answer = await refusing.workspaceUseTake(measured.id, 0, 1, second.id);
      expectMatches(workspaceUseTakeResultSchema, answer, `mock use take, ${reaper}`);
      expect(answer).toMatchObject({ outcome: 'refused', reason, changed: false });
    }
    await expect(createMockApi().workspaceTakes(measured.id, 0, 1)).resolves.toMatchObject({ itemGuid: '' });
  });

  it("the mock's stale refusal of a take says what the host says (tests/fixtures/contracts/workspace-use-take-refused.json)", () => {
    const golden = workspaceUseTakeResultSchema.parse(readGolden('workspace-use-take-refused.json'));
    expect(golden).toMatchObject({ outcome: 'refused', reason: 'stale', message: USE_TAKE_MESSAGES.stale });
  });

  it('the preview candidates: ok with candidates, no manuscript, and nothing eligible', async () => {
    const withCandidates = await createMockApi().previewCandidates();
    expectMatches(previewResultSchema, withCandidates, 'mock preview candidates, ok');
    expect(withCandidates.outcome).toBe('ok');
    expect(withCandidates.candidates.length).toBeGreaterThan(0);
    expect(withCandidates.candidates.every((candidate) => candidate.reasons.length > 0)).toBe(true);

    const noManuscript = await createMockApi({}, { preview: { outcome: 'no_manuscript' } }).previewCandidates();
    expectMatches(previewResultSchema, noManuscript, 'mock preview candidates, no manuscript');
    expect(noManuscript).toEqual({ outcome: 'no_manuscript', candidates: [] });

    const nothingEligible = await createMockApi({}, { preview: { outcome: 'nothing_eligible' } }).previewCandidates();
    expectMatches(previewResultSchema, nothingEligible, 'mock preview candidates, nothing eligible');
    expect(nothingEligible).toEqual({ outcome: 'nothing_eligible', candidates: [] });
  });

  it('the preview pin: not present, set, adjust and clear', async () => {
    const api = createMockApi();
    const notPinned = await api.previewPin();
    expectMatches(pinnedPreviewSchema, notPinned, 'mock preview pin, none');
    expect(notPinned).toEqual({ present: false, stale: false, canExtendStart: false, canShrinkStart: false, canExtendEnd: false, canShrinkEnd: false });

    const { candidates } = await api.previewCandidates();
    const [firstCandidate, secondCandidate] = candidates;
    expect(firstCandidate.paragraphIds.length).toBeGreaterThan(0);

    const set = await api.previewPinSet(firstCandidate.chapterId, firstCandidate.paragraphIds);
    expectMatches(pinnedPreviewSchema, set, 'mock preview pin, set');
    expect(set.present).toBe(true);
    expect(set.stale).toBe(false);
    expect(set.candidate?.chapterId).toBe(firstCandidate.chapterId);
    expect(set.candidate?.paragraphIds).toEqual(firstCandidate.paragraphIds);

    const read = await api.previewPin();
    expectMatches(pinnedPreviewSchema, read, 'mock preview pin, read back');
    expect(read).toEqual(set);

    if (secondCandidate) {
      const replaced = await api.previewPinSet(secondCandidate.chapterId, secondCandidate.paragraphIds);
      expect(replaced.candidate?.chapterId).toBe(secondCandidate.chapterId);
    } else {
      const cleared = await api.previewPinClear();
      expectMatches(pinnedPreviewSchema, cleared, 'mock preview pin, cleared');
      expect(cleared.present).toBe(false);
      await expect(api.previewPinAdjust('end', true)).rejects.toThrow();
    }
  });

  it('the preview pin is stale when its text changes or a paragraph disappears', async () => {
    const chapters = await createMockApi().manuscriptChapters();
    const chapter = chapters[0];
    const paragraphs = await createMockApi().manuscriptParagraphs(chapter.id);
    const paragraphId = paragraphs[0].id;

    const textChanged = await createMockApi(
      {},
      { preview: { pin: { chapterId: chapter.id, paragraphIds: [paragraphId], stale: 'text_changed' } } },
    ).previewPin();
    expectMatches(pinnedPreviewSchema, textChanged, 'mock preview pin, stale text_changed');
    expect(textChanged).toMatchObject({ present: true, stale: true, staleReason: 'text_changed' });
    expect(textChanged.candidate).toBeDefined();

    const paragraphMissing = await createMockApi(
      {},
      { preview: { pin: { chapterId: chapter.id, paragraphIds: [paragraphId], stale: 'paragraph_missing' } } },
    ).previewPin();
    expectMatches(pinnedPreviewSchema, paragraphMissing, 'mock preview pin, stale paragraph_missing');
    expect(paragraphMissing).toMatchObject({ present: true, stale: true, staleReason: 'paragraph_missing' });
    expect(paragraphMissing.candidate).toBeUndefined();
  });

  it('the stage recommendations: every verdict, every unknown cause, a confirmation, the notice, and every refusal', async () => {
    const api = createMockApi(
      {},
      {
        stages: {
          recording: { 'chapter-4': 'met', 'chapter-5': 'met', 'chapter-7': 'not_met' },
          dismissed: ['chapter-5'],
          confirmed: ['chapter-7', 'chapter-8'],
        },
      },
    );
    await api.manuscriptSetChapterStatus('chapter-11', 'recording');
    const chapters = await api.manuscriptChapters();
    const answer = await api.stageRecommendations();
    expectMatches(stageRecommendationsSchema, answer, 'mock stage recommendations');
    expect(answer.chapters.map((chapter) => chapter.chapterId)).toEqual(chapters.map((chapter) => chapter.id));
    const byId = new Map(answer.chapters.map((chapter) => [chapter.chapterId, chapter]));
    expect(new Set(answer.chapters.map((chapter) => chapter.verdict))).toEqual(new Set(['recommended', 'not_ready', 'unknown', 'dismissed', 'none']));
    expect(byId.get('chapter-1')).toMatchObject({ verdict: 'none', noneReason: 'stage_not_evaluated' });
    // chapter-7 is in Editing, unseeded in `editing`: the mock keeps its pre-existing no-required-signal shape (stagesMock.ts).
    expect(byId.get('chapter-7')).toMatchObject({ verdict: 'none', noneReason: 'no_required_signals' });
    // chapter-9 is in Proofing, unseeded in `proofing`: unlike editing, the mock always evaluates the real pickups
    // signal for a proofing chapter, so it reads unknown, not none.
    expect(byId.get('chapter-9')).toMatchObject({ verdict: 'unknown', causes: ['never_analyzed'] });
    expect(byId.get('chapter-6')).toMatchObject({ verdict: 'not_ready' });
    expect(byId.get('chapter-11')).toMatchObject({ verdict: 'unknown', causes: ['never_analyzed'] });
    for (const cause of STAGE_UNKNOWN_CAUSES) {
      const unknown = await createMockApi({}, { stages: { recording: { 'chapter-4': { unknown: cause } } } }).stageRecommendations();
      expectMatches(stageRecommendationsSchema, unknown, `mock stage recommendations, ${cause}`);
      expect(unknown.chapters.find((chapter) => chapter.chapterId === 'chapter-4')).toMatchObject({ verdict: 'unknown', causes: [cause] });
    }
    expect(byId.get('chapter-7')).toMatchObject({ confirmation: { from: 'recording', evidenceChanged: true }, contradiction: { revertTo: 'recording' } });
    expect(byId.get('chapter-8')?.confirmation?.evidenceChanged).toBe(true);
    expect(byId.get('chapter-8')?.contradiction).toBeUndefined();

    const recommended = byId.get('chapter-4');
    if (!recommended?.target || !recommended.basisKey) throw new Error('chapter-4 is recommended');
    const changed = await api.stageConfirm('chapter-4', recommended.target, 'not-the-key');
    expectMatches(stageDecisionResultSchema, changed, 'mock stage confirm, basis changed');
    expect(changed).toMatchObject({ status: 'refused', reason: 'basis_changed' });
    const notRecommended = await api.stageConfirm('chapter-6', 'editing', byId.get('chapter-6')?.basisKey ?? '');
    expect(notRecommended).toMatchObject({ status: 'refused', reason: 'not_recommended' });
    const confirmed = await api.stageConfirm('chapter-4', recommended.target, recommended.basisKey);
    expectMatches(stageDecisionResultSchema, confirmed, 'mock stage confirm');
    expect(confirmed).toMatchObject({ status: 'ok', chapter: { from: 'editing', confirmation: { from: 'recording', evidenceChanged: false } } });
    expect((await api.manuscriptChapters()).find((chapter) => chapter.id === 'chapter-4')?.status).toBe('editing');
    const reverted = await api.stageRevert('chapter-4');
    expectMatches(stageDecisionResultSchema, reverted, 'mock stage revert');
    expect(reverted).toMatchObject({ status: 'ok', chapter: { from: 'recording', verdict: 'recommended' } });
    const nothing = await api.stageRevert('chapter-4');
    expectMatches(stageDecisionResultSchema, nothing, 'mock stage revert, nothing to revert');
    expect(nothing).toMatchObject({ status: 'refused', reason: 'nothing_to_revert' });
    const dismissed = await api.stageDismiss('chapter-4', recommended.target, recommended.basisKey);
    expectMatches(stageDecisionResultSchema, dismissed, 'mock stage dismiss');
    expect(dismissed).toMatchObject({ status: 'ok', chapter: { verdict: 'dismissed' } });
    await expect(api.stageRevert('no-such-chapter')).rejects.toThrow('not a narration chapter');
  });

  it('the proofing render association: none, choosing, a re-read, staleness, a measurement and clearing', async () => {
    const api = createMockApi({}, { proofingRender: { 'chapter-2': { state: 'stale' }, 'chapter-3': { state: 'current', measured: true } } });

    const none = await api.proofingRenderState('chapter-1');
    expectMatches(proofingRenderSchema, none, 'mock proofing render, none');
    expect(none).toMatchObject({ state: 'none', cause: 'never_analyzed' });

    const stale = await api.proofingRenderState('chapter-2');
    expectMatches(proofingRenderSchema, stale, 'mock proofing render, stale');
    expect(stale).toMatchObject({ state: 'stale', cause: 'stale' });

    const measured = await api.proofingRenderState('chapter-3');
    expectMatches(proofingRenderSchema, measured, 'mock proofing render, already measured');
    expect(measured).toMatchObject({ state: 'current', measurementFailed: false });
    expect(measured.measurement?.integrated_lufs).toBeTypeOf('number');

    const chosen = await api.proofingChooseRender('chapter-1');
    expectMatches(proofingChooseRenderResultSchema, chosen, 'mock proofing choose render');
    if (chosen.status !== 'ok') throw new Error('choosing a render must succeed in the mock');
    expect(chosen.render).toMatchObject({ state: 'current', measurementFailed: false });
    expect(chosen.render.path).toBeTruthy();
    expect(chosen.render.measurement).toBeUndefined();

    const reread = await api.proofingRenderState('chapter-1');
    expect(reread).toEqual(chosen.render);

    // Measuring the chosen render (DX-1's job) records the result against this chapter, the same as
    // apps/desktop/internal/proofing/renders.go's RecordRenderMeasurements.
    let job = await api.measureAnalyze([chosen.render.path!]);
    while (job.phase === 'running') job = await api.measureState();
    const afterMeasuring = await api.proofingRenderState('chapter-1');
    expectMatches(proofingRenderSchema, afterMeasuring, 'mock proofing render, measured');
    expect(afterMeasuring.measurement?.sample_rate).toBeTypeOf('number');
    expect(afterMeasuring.measuredAt).toBeTruthy();

    const cleared = await api.proofingClearRender('chapter-1');
    expectMatches(proofingRenderSchema, cleared, 'mock proofing render, cleared');
    expect(cleared).toMatchObject({ state: 'none' });

    // The two ProofingChooseRender branches the mock never produces (the dialog is not simulated): pinned directly
    // against the schema, the same convention as ProjectLinkDawFile's untested cancel-or-mismatch shapes.
    expectMatches(proofingChooseRenderResultSchema, { status: 'cancelled' }, 'proofing choose render, cancelled');
    expectMatches(
      proofingChooseRenderResultSchema,
      { status: 'refused', message: 'Link this chapter to the REAPER track it is recorded on.' },
      'proofing choose render, refused',
    );
  });

  it('the CleanupPreview, CleanupApply, LevelMatchPreview and LevelMatchApply answers', async () => {
    const chapterId = 'chapter-1';
    const api = createMockApi({}, { findings: [editingCandidateFor(chapterId, 'Chapter One')] });

    const preview = await api.cleanupPreview(chapterId);
    expectMatches(cleanupPreviewResultSchema, preview, 'mock cleanup preview');
    expect(preview).toMatchObject({ candidates: 1, added: 1, existing: 0, stale: [] });

    const applied = await api.cleanupApply(chapterId);
    expectMatches(cleanupApplyResultSchema, applied, 'mock cleanup apply');
    expect(applied).toMatchObject({ candidates: 1, applied: 1, stale: [] });

    const noCandidates = createMockApi({}, { findings: [] });
    await expect(noCandidates.cleanupPreview(chapterId)).rejects.toThrow();
    await expect(noCandidates.cleanupApply(chapterId)).rejects.toThrow();

    const levelPreview = await api.levelMatchPreview(chapterId, 'rms_dbfs', -6, 1);
    expectMatches(levelMatchPreviewResultSchema, levelPreview, 'mock level match preview');
    expect(levelPreview.candidates.length).toBeGreaterThan(0);

    const levelApplied = await api.levelMatchApply(chapterId, 'rms_dbfs', -6, 1);
    expectMatches(levelMatchApplyResultSchema, levelApplied, 'mock level match apply');
    expect(levelApplied.changed.length).toBe(levelPreview.candidates.length);

    await expect(api.levelMatchPreview(chapterId, 'rms_dbfs', -6, 1)).rejects.toThrow();
  });

  it('the editing source choice defaults to items and round-trips through Set', async () => {
    const api = createMockApi();
    const chapterId = 'chapter-7'; // WIRE_CHAPTERS[6] is the fixture's one Editing-status chapter.

    const initial = await api.editingSourceChoice(chapterId);
    expectMatches(editingSourceChoiceSchema, initial, 'mock editing source choice');
    expect(initial).toBe('items');

    const set = await api.editingSetSourceChoice(chapterId, 'render');
    expectMatches(editingSourceChoiceSchema, set, 'mock editing set source choice');
    expect(set).toBe('render');

    expect(await api.editingSourceChoice(chapterId)).toBe('render');
    // A different chapter is unaffected.
    expect(await api.editingSourceChoice('chapter-1')).toBe('items');
  });

  it('the production plan: empty, a deadline and amount set and cleared, milestones saved, and every refusal', async () => {
    const api = createMockApi();
    const empty = await api.productionPlan();
    expectMatches(productionPlanSchema, empty, 'mock production plan, empty');
    expect(empty).toEqual({ deadline: null, contractedAmount: null, payment: 'none', milestones: [] });

    const set = await api.setProductionDeadline(' 2026-12-01 ', 2400);
    expectMatches(productionPlanSchema, set, 'mock production plan, deadline set');
    expect(set).toMatchObject({ deadline: '2026-12-01', contractedAmount: 2400 });

    const withMilestones = await api.saveProductionMilestones([
      { name: ' ACX 15-minute checkpoint ', dueDate: '2026-10-15', note: 'The rights holder approves the first 15 minutes.' },
      { name: 'Final delivery', dueDate: '2026-12-01', note: ' ' },
    ]);
    expectMatches(productionPlanSchema, withMilestones, 'mock production plan, milestones');
    expect(withMilestones.milestones).toEqual([
      { name: 'ACX 15-minute checkpoint', dueDate: '2026-10-15', note: 'The rights holder approves the first 15 minutes.' },
      { name: 'Final delivery', dueDate: '2026-12-01' },
    ]);

    await expect(api.setProductionDeadline('2026-02-30', null)).rejects.toThrow('YYYY-MM-DD');
    await expect(api.setProductionDeadline('2026-12-01', -1)).rejects.toThrow('zero or more');
    await expect(api.saveProductionMilestones([{ name: '', dueDate: '2026-10-15' }])).rejects.toThrow('needs a name');
    expect(await api.productionPlan()).toEqual(withMilestones);

    const cleared = await api.setProductionDeadline('', null);
    expectMatches(productionPlanSchema, cleared, 'mock production plan, cleared');
    expect(cleared).toMatchObject({ deadline: null, contractedAmount: null });
  });

  it('the production plan payment type: royalty share and none clear the amount and refuse one; an unknown type saves nothing', async () => {
    const api = createMockApi();
    const set = await api.setProductionDeadline('2026-12-01', 2400);
    expect(set.payment).toBe('per_finished_hour');
    for (const payment of ['royalty_share', 'none'] as const) {
      const chosen = await api.setProductionPayment(payment);
      expectMatches(productionPlanSchema, chosen, `mock production plan, ${payment}`);
      expect(chosen).toMatchObject({ deadline: '2026-12-01', contractedAmount: null, payment });
      await expect(api.setProductionDeadline('2026-12-01', 2400)).rejects.toThrow('per finished hour');
      expect((await api.productionOverview()).totals).toMatchObject({ contractedAmount: null, effectiveRate: null });
    }
    const before = await api.productionPlan();
    await expect(api.setProductionPayment('royalty' as never)).rejects.toThrow('not a payment type');
    expect(await api.productionPlan()).toEqual(before);
    const back = await api.setProductionPayment('per_finished_hour');
    expectMatches(productionPlanSchema, back, 'mock production plan, per finished hour');
    expect(await api.setProductionDeadline('2026-12-01', 2400)).toMatchObject({ payment: 'per_finished_hour', contractedAmount: 2400 });
  });

  it('the production milestones keep a measure, an estimate, done and a template, and a bad one refuses the whole list', async () => {
    const api = createMockApi();
    const saved = await api.saveProductionMilestones([
      { name: 'ACX 15-minute checkpoint', dueDate: '2026-10-15', measure: ' checkpoint ', estimate: '2026-10-12', template: 'checkpoint15' },
      { name: 'First 4 chapters', dueDate: '2026-10-20', measure: 'ch4', done: true },
      { name: 'Cover art', dueDate: '2026-11-01', measure: 'custom', done: false },
    ]);
    expectMatches(productionPlanSchema, saved, 'mock production plan, measured milestones');
    expect(saved.milestones).toEqual([
      { name: 'ACX 15-minute checkpoint', dueDate: '2026-10-15', measure: 'checkpoint', estimate: '2026-10-12', template: 'checkpoint15' },
      { name: 'First 4 chapters', dueDate: '2026-10-20', measure: 'ch4', done: true },
      { name: 'Cover art', dueDate: '2026-11-01', measure: 'custom' },
    ]);
    const refused = [
      { name: 'M', dueDate: '2026-10-15', measure: 'everything' },
      { name: 'M', dueDate: '2026-10-15', measure: 'custom', estimate: '2026-10-10' },
      { name: 'M', dueDate: '2026-10-15', measure: 'rec', estimate: 'soon' },
      { name: 'M', dueDate: '2026-10-15', template: 'has spaces' },
    ];
    for (const bad of refused) {
      await expect(api.saveProductionMilestones([{ name: 'Fine', dueDate: '2026-10-01' }, bad])).rejects.toThrow('milestone 2');
    }
    expect(await api.productionPlan()).toEqual(saved);
  });

  it('the production plan schema reads an older host without the new fields and refuses an unknown payment type', () => {
    const older = { deadline: '2026-12-01', contractedAmount: 2400, milestones: [{ name: 'Final delivery', dueDate: '2026-12-01', note: 'n' }] };
    expectMatches(productionPlanSchema, older, 'production plan from an older host');
    expect(productionPlanSchema.safeParse({ ...older, payment: 'royalty' }).success).toBe(false);
    expect(productionPlanSchema.safeParse({ ...older, milestones: [{ name: 'M', dueDate: '2026-10-15', done: 'yes' }] }).success).toBe(false);
  });

  it('the production plan schedule basis: own is stored, standard is the absent field, an unknown basis saves nothing', async () => {
    const api = createMockApi();
    expect(await api.productionPlan()).not.toHaveProperty('rateBasis');
    const own = await api.setProductionRateBasis('own');
    expectMatches(productionPlanSchema, own, 'mock production plan, own pace');
    expect(own.rateBasis).toBe('own');
    expect((await api.productionPlan()).rateBasis).toBe('own');
    await expect(api.setProductionRateBasis('fast' as never)).rejects.toThrow('not a schedule basis');
    expect((await api.productionPlan()).rateBasis).toBe('own');
    expect(await api.setProductionRateBasis('standard')).not.toHaveProperty('rateBasis');
    expect(productionPlanSchema.safeParse({ deadline: null, contractedAmount: null, milestones: [], rateBasis: 'fast' }).success).toBe(false);
  });

  it('every method of the API is either checked in this file, void, or not a request', () => {
    // A new binding fails this until it has a schema and a row above (ADR 0069). The list of what is checked is kept by hand.
    const CHECKED = [
      'coverageEngines',
      'coverageGapAccept',
      'coverageGapIgnore',
      'coverageGapReviews',
      'exportPickFiles',
      'exportStart',
      'exportState',
      'exportCancel',
      'packageStart',
      'packageState',
      'packageCancel',
      'packageStartMulti',
      'packageMultiState',
      'packageMultiCancel',
      'teleprompterPunchPreview',
      'teleprompterPunch',
      'pickupsPunch',
      'ready',
      'bootstrap',
      'systemLookup',
      'systemCopyDiagnostics',
      'windowZoom',
      'windowSetZoom',
      'saveSettings',
      'settingsForScope',
      'selectManuscript',
      'manuscriptBeginImport',
      'manuscriptImportState',
      'manuscriptImportPreview',
      'manuscriptImportCommit',
      'manuscriptChapters',
      'manuscriptParagraphs',
      'manuscriptSearch',
      'manuscriptSetChapterStatus',
      'manuscriptSetChapterKind',
      'noteList',
      'noteCreate',
      'prepMarkupList',
      'prepMarkupSave',
      'bookmarksList',
      'bookmarksAdd',
      'bookmarksUpdate',
      'bookmarksRemove',
      'passageMapRecordRun',
      'passageMapList',
      'editingAcceptedList',
      'editingAccept',
      'editingUnaccept',
      'editingCutsList',
      'editingCutRecord',
      'editingCutRemove',
      'editingWordFxList',
      'editingWordFxRecord',
      'editingWordFxRemove',
      'marksList',
      'marksAdd',
      'marksRemove',
      'marksSaveTypes',
      'marksReply',
      'marksEditMessage',
      'marksDeleteMessage',
      'marksRestoreMessage',
      'marksSetStatus',
      'extractionList',
      'extractionAccept',
      'extractionReject',
      'extractionReview',
      'extractionReopen',
      'pronunciationSources',
      'pronunciationCandidate',
      'manuscriptReader',
      'readerState',
      'readerStateSave',
      'readerBookmarkCreate',
      'guideBuild',
      'guideBuildState',
      'guideEntities',
      'guideCreate',
      'guidePreview',
      'guidePronunciationQueries',
      'guidePronunciationQueriesCsv',
      'guidePronunciationImportQueriesCsv',
      'guideDialogueCues',
      'characterListRegions',
      'characterApprove',
      'characterReferences',
      'seriesVoiceBible',
      'seriesList',
      'seriesSave',
      'assetsList',
      'assetsInstall',
      'assetsInstallState',
      'assetsInstallCancel',
      'assetsVerify',
      'ttsCatalog',
      'ttsInstall',
      'ttsInstallState',
      'ttsInstallCancel',
      'whisperCatalog',
      'whisperInstall',
      'whisperInstallState',
      'whisperInstallCancel',
      'transcriptStart',
      'transcriptLastCompleted',
      'transcriptAddEquivalence',
      'transcriptSuggestHints',
      'transcriptHints',
      'projectRecents',
      'selectProjectFolder',
      'switchProject',
      'createProject',
      'removeRecentProject',
      'linkDawFile',
      'launchDaw',
      'dawCapabilities',
      'dawProjectState',
      'providerCapabilities',
      'masteringProviders',
      'masteringChooseProvider',
      'recorderState',
      'recorderChooseEngine',
      'recorderDevices',
      'recorderMeterStart',
      'recorderMeterStop',
      'recorderStart',
      'recorderStop',
      'recorderSetTakeLine',
      'recorderSetTakeKeeper',
      'dawCatalogList',
      'tracksDiscover',
      'tracksSelect',
      'tracksList',
      'chapterTrackMapList',
      'chapterTrackMapConfirm',
      'chapterTrackMapClear',
      'chapterTrackSet',
      'chapterTrackUnlink',
      'chapterSyncState',
      'chapterSyncPreview',
      'chapterSyncSetEnabled',
      'chapterSyncUndo',
      'chapterTrackLinks',
      'trackSelectInReaper',
      'chapterRegionsPreview',
      'chapterRegionsCreate',
      'chapterTrackMatch',
      'chapterSuggestion',
      'chaptersForTracks',
      'lineIdentityStamp',
      'lineIdentityRead',
      'lineIdentityState',
      'pickupsImport',
      'pickupsExport',
      'pickupsNext',
      'pickupsResolve',
      'pickupsCount',
      'pickupsState',
      'renderConfigConfigure',
      'renderConfigSuggestFolder',
      'renderConfigState',
      'cleanupToolsLaunch',
      'cleanupToolsState',
      'projectStateCheck',
      'projectStateChangedSince',
      'projectStateState',
      'retakeLanesList',
      'retakeLanesPick',
      'retakeLanesState',
      'chapterTagsPreview',
      'chapterTagsEmbed',
      'takeReviewScanStart',
      'takeReviewScanState',
      'takeReviewScanCancel',
      'takeReviewCreateTake',
      'coverageStart',
      'coverageState',
      'coverageResult',
      'workspaceAlignment',
      'workspaceGoTo',
      'workspaceListFXChains',
      'workspaceListFX',
      'workspaceAddTakeFX',
      'workspaceApplyFXChain',
      'workspaceLoop',
      'workspaceTakes',
      'workspaceTakeEvidence',
      'workspaceTakesCompareStart',
      'workspaceUseTake',
      'workspacePeaks',
      'workspaceSnap',
      'previewCandidates',
      'previewPin',
      'previewPinSet',
      'previewPinAdjust',
      'previewPinClear',
      'productionPlan',
      'setProductionDeadline',
      'setProductionPayment',
      'setProductionRateBasis',
      'saveProductionMilestones',
      'stageRecommendations',
      'stageConfirm',
      'stageDismiss',
      'stageRevert',
      'proofingRenderState',
      'proofingChooseRender',
      'proofingClearRender',
      'productionOverview',
      'productionStartTimer',
      'productionStopTimer',
      'prepCompletenessSummary',
      'productionStatusReport',
      'productionStatusReportPreview',
      'productionBurndown',
      'takeComparisonStart',
      'takeComparisonState',
      'takeComparisonCancel',
      'measurePickFiles',
      'measureAnalyze',
      'measureState',
      'measureCancel',
      'deliveryExportReport',
      'deliveryProfiles',
      'deliverySelectProfile',
      'deliveryDuplicateProfile',
      'deliverySaveProfile',
      'deliveryDeleteProfile',
      'diagnosticsAnalyze',
      'diagnosticsState',
      'diagnosticsCancel',
      'editingStart',
      'editingState',
      'editingCandidates',
      'editingSourceChoice',
      'editingSetSourceChoice',
      'cleanupPreview',
      'cleanupApply',
      'levelMatchPreview',
      'levelMatchApply',
      'findingsList',
      'findingsGet',
      'findingsReview',
      'findingsSetType',
      'findingsSummary',
      'findingsReaperStatus',
      'findingsGoTo',
      'findingsLoop',
      'findingsGoToRead',
      'findingsLoopRead',
      'findingsStopLoop',
      'findingsAddMarker',
      'teleprompterStart',
      'teleprompterState',
      'teleprompterDevices',
      'teleprompterLocate',
      'teleprompterResumeFollow',
      'teleprompterResumeUnfollow',
      'teleprompterSaveFlags',
      'readAloudReaperState',
      'readAloudArmOnly',
      'readAloudRecordStart',
      'readAloudRecordStop',
      'teleprompterReaperInput',
      'updateStatus',
      'updateCheck',
      'updateDownload',
      'updateJobState',
      'updateJobCancel',
      'updateInstall',
      'creditsTemplates',
      'saveCreditsTemplate',
      'duplicateCreditsTemplate',
      'creditsProjectValues',
      'saveCreditsProjectValues',
      'creditsSetupState',
      'creditsSetupDismiss',
      'creditsSetupSave',
      'creditsPreview',
      'creditsChapterAnnouncements',
      'creditsRetailSample',
      'saveCreditsRetailSample',
      'creditsStatuses',
      'setCreditsStatus',
      'creditsRecordedLengths',
      'pronunciationOnlineKeyStatus',
      'pronunciationOnlineKeySet',
      'pronunciationOnlineKeyClear',
      'pronunciationOnlineLookup',
      'pronunciationOnlineLookupBatch',
    ];
    const VOID = [
      'manuscriptImportCancel',
      'clearProjectData',
      'readerBookmarkDelete',
      'noteDelete',
      'prepMarkupDelete',
      'guideEdit',
      'guideSetLocked',
      'guideRescan',
      'guidePronounce',
      'guidePronounceUser',
      'guidePronunciationUseAlternate',
      'guidePronunciationSetStatus',
      'guideMerge',
      'guideDelete',
      'guideRelate',
      'guideUnrelate',
      'guideCorrectCue',
      'guideMarkReviewed',
      'guideFlagReview',
      'guideSetSpeakerColor',
      'characterRevoke',
      'characterRemoveVoiceData',
      'seriesDelete',
      'ttsRemove',
      'whisperRemove',
      'assetsRemove',
      'transcriptCancel',
      'coverageCancel',
      'editingCancel',
      'transcriptReset',
      'transcriptJump',
      'transcriptExportMarkers',
      'transcriptSaveHints',
      'teleprompterStop',
      'teleprompterMeterStart',
      'teleprompterMeterStop',
      'teleprompterPause',
      'dawCatalogOpenDownloadPage',
      'pronunciationLookupOpen',
      'pronunciationCommonsAudioOpen',
      'pronunciationOnlineSignUpOpen',
      'teleprompterSeek',
      'reportClientDiagnostic',
      'systemNotify',
      'systemOpenLogFolder',
      'updateOpenNotes',
      'updateShowDownload',
      'deleteCreditsTemplate',
      'companionModeEnter',
      'companionModeExit',
      'windowSaveZoom',
    ];
    const NOT_A_REQUEST = [
      'mediaUrl',
      'subscribeProjectAttach',
      'subscribeLiveUpdateHealth',
      'subscribeNotices',
      'subscribeJobEnded',
      'subscribeTranscript',
      'subscribeCoverage',
      'subscribeTeleprompterEvent',
      'subscribeTeleprompterState',
      'subscribeTeleprompterResumeFollow',
      'subscribeUpdate',
      'subscribeLineIdentity',
      'subscribePickups',
      'subscribeChapterSync',
      'subscribeRenderConfig',
      'subscribeCleanupTools',
      'subscribeProjectState',
      'subscribeRetakeLanes',
      'subscribeDawCapabilities',
      'subscribeDawTransport',
      'subscribeDawProjectState',
      'subscribeRecorderState',
      'subscribeRecorderLevel',
    ];
    expect([...CHECKED, ...VOID, ...NOT_A_REQUEST].sort()).toEqual(Object.keys(createMockApi()).sort());
  });
});

describe('one deliberately broken sample per boundary fails with a specific message', () => {
  const failure = (schema: z.ZodType, value: unknown, payload: string): WireError => {
    try {
      parseWire(schema, value, ctx(payload));
    } catch (error) {
      if (error instanceof WireError) return error;
    }
    throw new Error(`${payload} was accepted`);
  };

  it('a binding result (Bootstrap with a numeric project name)', () => {
    const broken = { ...(readGolden('bootstrap-manuscript.json') as object), projectName: 42 };
    expect(failure(bootstrapSchema, broken, 'Bootstrap').details()).toMatch(
      /Bootstrap did not match its schema: projectName: Invalid input: expected string, received number/,
    );
  });

  it('a live event (a position with a text read index)', () => {
    const position = (readGolden('teleprompter-events.json') as Array<{ type: string }>).find((event) => event.type === 'position');
    expect(failure(teleprompterEventSchema, { ...position, read: 'four' }, 'teleprompter:event').issues.map((issue) => issue.path)).toEqual(['read']);
  });

  it('a live event (a flag of a kind the UI does not know)', () => {
    const flags = (readGolden('teleprompter-events.json') as Array<{ type: string; kind?: string }>).filter((event) => event.type === 'flag');
    expect(new Set(flags.map((flag) => flag.kind))).toEqual(new Set(['misread', 'extra', 'skipped', 'restart']));
    expect(failure(teleprompterEventSchema, { ...flags[0], kind: 'mumbled' }, 'teleprompter:event').issues.map((issue) => issue.path)).toEqual(['kind']);
  });

  it('a state snapshot (a transcript phase the UI does not know)', () => {
    const broken = { ...(readGolden('transcript-idle.json') as object), phase: 'paused' };
    expect(failure(transcriptStateSchema, broken, 'transcript:state').issues[0]?.path).toBe('phase');
  });
});

// The sidecar's credits script (chapter_script.text_script, ADR 0150) and the reader's `creditsRows` split the same text the
// same way: every span of the golden lands on a line of the text the Python test built it from, with every word tracked.
describe('the credits script the sidecar sends', () => {
  it('lays over the reader rows of the same text with no drift', () => {
    const text = 'You have been listening to Alice, written by Lewis Carroll,\nnarrated by Ada Finch.\n\nThe End.';
    const script = parseWire(teleprompterEventSchema, readGolden('teleprompter-credits-script.json'), ctx('teleprompter:event'));
    if (script.type !== 'script') throw new Error('the golden is not a script event');

    const rows = creditsRows('closing', text, script);

    expect(rows.map((row) => [row.key, row.start, row.words?.length])).toEqual(script.spans.map((span) => [span.id, span.start, span.count]));
  });
});

describe('the production tracking mock', () => {
  it('answers every production binding with a payload its schema accepts, with nothing logged before a seed', async () => {
    const api = createMockApi();
    const empty = await api.productionOverview();
    expectMatches(productionOverviewSchema, empty, 'mock production overview, nothing logged');
    expect(empty.totals).toMatchObject({ hoursLogged: 0, bookPfh: null, effectiveRate: null, contractedAmount: null });
    expect([empty.deadline, empty.running]).toEqual([null, null]);

    const started = await api.productionStartTimer('chapter-4', 'recording');
    expectMatches(productionStartResultSchema, started, 'mock production timer started');
    expect(started.status).toBe('started');
    const refused = await api.productionStartTimer('chapter-5', 'recording');
    expectMatches(productionStartResultSchema, refused, 'mock production timer refused');
    expect(refused).toMatchObject({ status: 'refused', reason: 'timer_running' });
    expect((await api.productionOverview()).running?.chapterId).toBe('chapter-4');
    expectMatches(productionStopResultSchema, await api.productionStopTimer(), 'mock production timer stopped');
    expectMatches(productionStopResultSchema, await api.productionStopTimer(), 'mock production timer, nothing to stop');
    await expect(api.productionStartTimer('chapter-99', 'recording')).rejects.toThrow(/no chapter/);
  });

  it('the status report export leaves out the contracted amount unless asked, and never repeats a file name', async () => {
    const pinned = productionReportExportSchema.parse(readGolden('production-status-report.json'));
    const api = createMockApi();
    const left = await api.productionStatusReport(false);
    expectMatches(productionReportExportSchema, left, 'mock production status report, default');
    expect(left).toMatchObject({ folder: pinned.folder, contractedAmountIncluded: false });
    const included = await api.productionStatusReport(true);
    expectMatches(productionReportExportSchema, included, 'mock production status report, opted in');
    expect(included.contractedAmountIncluded).toBe(true);
    expect(included.jsonFile).not.toBe(left.jsonFile);
  });

  it('the status report preview parses the golden, rejects an unknown key, and the mock gives a document the schema parses', async () => {
    const pinned = productionReportPreviewSchema.parse(readGolden('production-status-report-preview.json'));
    expect(() => productionReportPreviewSchema.parse({ ...pinned, extra: 1 })).toThrow();
    const api = createMockApi();
    const left = await api.productionStatusReportPreview(false);
    expectMatches(productionReportPreviewSchema, left, 'mock production status report preview, default');
    expect(left).toMatchObject({ folder: pinned.folder, contractedAmountIncluded: false });
    expect(left.html).not.toMatch(/<script/i);
    expect(left.json).toContain('Not available');
    const included = await api.productionStatusReportPreview(true);
    expectMatches(productionReportPreviewSchema, included, 'mock production status report preview, opted in');
    expect(included.contractedAmountIncluded).toBe(true);
  });

  it('the burndown is empty with nothing logged, and cumulative by day once a seed logs some', async () => {
    const empty = await createMockApi().productionBurndown();
    expectMatches(productionBurndownSchema, empty, 'mock production burndown, nothing logged');
    expect(empty).toEqual([]);

    const seeded = await createMockApi({}, { production: PRODUCTION_SCENARIOS['on-pace'] }).productionBurndown();
    expectMatches(productionBurndownSchema, seeded, 'mock production burndown, on-pace');
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.at(-1)?.hoursLogged).toBeCloseTo(seeded.reduce((max, point) => Math.max(max, point.hoursLogged), 0));
    for (let i = 1; i < seeded.length; i++) expect(seeded[i].hoursLogged).toBeGreaterThanOrEqual(seeded[i - 1].hoursLogged);
  });

  it.each(['on-pace', 'at-risk'] as const)('seeds a %s book whose figures come from its log and measured audio only', async (seed) => {
    const overview = await createMockApi({}, { production: PRODUCTION_SCENARIOS[seed] }).productionOverview();
    expectMatches(productionOverviewSchema, overview, `mock production overview, ${seed}`);
    expect(overview.deadline).not.toBeNull();
    const { totals } = overview;
    expect(totals.bookPfh).toBeCloseTo(totals.hoursLogged / (totals.recordedSeconds / 3600));
    expect(totals.effectiveRate).toBeCloseTo((totals.contractedAmount ?? 0) / totals.hoursLogged);
    // An unmeasured chapter has no PFH, whatever was logged on it.
    for (const chapter of overview.chapters.filter((row) => row.recordedSeconds === null)) expect(chapter.pfh).toBeNull();
    expect(overview.nextUp.length).toBeGreaterThan(0);
    expect(overview.nextUp.every((item) => item.stage !== 'finalized')).toBe(true);
  });
});

// The pronunciation sources and candidate (SNB-2b, ADR 0792): the mock answers through the same schemas as the host's goldens.
describe('the pronunciation sources bindings', () => {
  it('the mock lists the sources and answers a candidate from fixture data, offline, through the schemas', async () => {
    const api = createMockApi();
    const list = await api.pronunciationSources();
    expectMatches(pronunciationSourcesSchema, list, 'mock pronunciation sources');
    expect(list.sources.at(-1)?.id).toBe('manual');
    expect(list.sources.find((source) => source.id === list.default)?.available).toBe(true);
    const hit = await api.pronunciationCandidate('Croquet', list.default);
    expectMatches(pronunciationCandidateSchema, hit, 'mock candidate');
    expect(hit.ok).toBe(true);
    for (const [word, source] of [
      ['croquet', 'manual'],
      ['croquet', 'forvo'],
      ['zzzz', 'cmu'],
      ['  ', 'cmu'],
      ['a'.repeat(81), 'cmu'],
    ] as const) {
      const miss = await api.pronunciationCandidate(word, source);
      expectMatches(pronunciationCandidateSchema, miss, `mock candidate miss for ${source}`);
      expect(miss.ok).toBe(false);
    }
  });

  it('the schemas parse the host goldens and refuse an unknown kind, an unknown key and ok:true without say', () => {
    const list = parseWire(pronunciationSourcesSchema, readGolden('pronunciation-sources.json'), ctx('pronunciation sources'));
    expect(list.sources.map((source) => source.id)).toContain('manual');
    const source = list.sources[0];
    expect(pronunciationSourceSchema.safeParse({ ...source, kind: 'scraped' }).success).toBe(false);
    expect(pronunciationSourceSchema.safeParse({ ...source, icon: 'globe' }).success).toBe(false);
    expect(pronunciationSourcesSchema.safeParse({ ...list, path: '/etc' }).success).toBe(false);
    const ok = parseWire(pronunciationCandidateSchema, readGolden('pronunciation-candidate-ok.json'), ctx('pronunciation candidate ok'));
    const miss = parseWire(pronunciationCandidateSchema, readGolden('pronunciation-candidate-miss.json'), ctx('pronunciation candidate miss'));
    expect(ok.ok).toBe(true);
    expect(miss.ok).toBe(false);
    expect(pronunciationCandidateSchema.safeParse({ ok: true }).success).toBe(false);
    expect(pronunciationCandidateSchema.safeParse({ ok: false }).success).toBe(false);
    expect(pronunciationCandidateSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });

  it('the story bible pronunciation takes source manual and still takes the older user, status, note and alternate', () => {
    const entity = (source: string) => ({
      ipa: 'x',
      source,
      confidence: 'narrator',
      status: 'author_confirmed',
      note: 'n',
      alternate: { ipa: 'y', source: 'user', confidence: '' },
    });
    for (const source of ['manual', 'user', 'cmu']) {
      expect(guidePronunciationSchema.parse(entity(source))).toMatchObject({ source, status: 'author_confirmed', note: 'n', alternate: { source: 'user' } });
    }
  });
});

// The evidence of a passage's takes (SNE-5a, ADR 0140): the host's goldens parse, a figure is a value or a reason and never
// both, the answer names no file or GUID field, and the mock answers through the same schema.
describe('the take evidence binding', () => {
  it('the schema parses the host goldens and refuses a figure that is both or neither, and a field the host never sends', () => {
    const full = parseWire(takeEvidenceResultSchema, readGolden('workspace-take-evidence-full.json'), ctx('take evidence full'));
    const partial = parseWire(takeEvidenceResultSchema, readGolden('workspace-take-evidence-partial.json'), ctx('take evidence partial'));
    const none = parseWire(takeEvidenceResultSchema, readGolden('workspace-take-evidence-none.json'), ctx('take evidence none'));
    expect(full.takes.every((take) => take.measure.rms.ok && take.measure.nf.ok && take.matched.ok)).toBe(true);
    expect(partial.takes.some((take) => !take.measure.rms.ok)).toBe(true);
    expect(none.takes).toEqual([]);
    expect(none.message).toMatch(/wasn't heard/);
    for (const take of [...full.takes, ...partial.takes]) {
      expect(take.measure.clarity).toEqual({ ok: false, reason: 'Not measured' });
      expect(take.via).toBe('aligned');
    }
    expect(takeFigureSchema.safeParse({ ok: true, value: 1, reason: 'x' }).success).toBe(false);
    expect(takeFigureSchema.safeParse({ ok: false, value: 1, reason: 'x' }).success).toBe(false);
    expect(takeFigureSchema.safeParse({ ok: true }).success).toBe(false);
    expect(takeEvidenceResultSchema.safeParse({ ...full, takes: [{ ...full.takes[0], sourceFile: 'a.wav' }] }).success).toBe(false);
    expect(takeEvidenceResultSchema.safeParse({ ...full, takes: [{ ...full.takes[0], via: 'guessed' }] }).success).toBe(false);
  });

  it('the mock answers one entry per offered take through the schema, and refuses what workspaceTakes refuses', async () => {
    const [chapter] = WIRE_CHAPTERS;
    const [track] = WIRE_TRACKS_PROJECT.tracks;
    const api = createMockApi(
      {},
      {
        chapterTrackMappings: [
          { trackGuid: track.guid, chapterId: chapter.id, chapterTitle: chapter.title, confirmedAt: '2026-10-11T09:00:00Z', origin: 'manual', match: null },
        ],
      },
    );
    const evidence = await api.workspaceTakeEvidence(chapter.id, 0, 1);
    expectMatches(takeEvidenceResultSchema, evidence, 'mock take evidence');
    expect(evidence.takes.map((take) => take.id)).toEqual((await api.workspaceTakes(chapter.id, 0, 1)).candidates.map((candidate) => candidate.id));
    await expect(api.workspaceTakeEvidence(chapter.id, 0, 99999)).rejects.toThrow(/not in this chapter's alignment/);
  });
});

// The narrator's bookmarks (ADR 0820): the mock answers through the same schemas as the host's goldens, and the schemas refuse
// what the host never sends.
describe('the bookmarks bindings', () => {
  it('the mock answers BookmarksList, Add, Update and Remove through their schemas, in reading order', async () => {
    const api = createMockApi();
    const [first, second] = await api.manuscriptChapters();
    const firstLine = (await api.manuscriptParagraphs(first?.id ?? ''))[1];
    const secondLine = (await api.manuscriptParagraphs(second?.id ?? ''))[0];
    expectMatches(bookmarksSchema, await api.bookmarksList(), 'mock bookmarks list (empty)');
    const later = await api.bookmarksAdd(second?.id ?? '', secondLine?.id ?? '', 0);
    const added = await api.bookmarksAdd(first?.id ?? '', firstLine?.id ?? '', 3);
    expectMatches(spotBookmarkSchema, added, 'mock bookmark add');
    expect(added).toMatchObject({ label: '', note: '', offset: 3, stale: false, paragraph: firstLine?.index });
    expect((await api.bookmarksAdd(first?.id ?? '', firstLine?.id ?? '', 3)).id).toBe(added.id);
    const updated = await api.bookmarksUpdate(added.id, '  The Queen ', 'Shout.\r\nThen breathe.');
    expectMatches(spotBookmarkSchema, updated, 'mock bookmark update');
    expect(updated).toMatchObject({ label: 'The Queen', note: 'Shout.\nThen breathe.' });
    const listed = await api.bookmarksList();
    expectMatches(bookmarksSchema, listed, 'mock bookmarks list');
    expect(listed.map((bookmark) => bookmark.id)).toEqual([added.id, later.id]);
    const remaining = await api.bookmarksRemove(added.id);
    expectMatches(bookmarksSchema, remaining, 'mock bookmarks remove');
    expect(remaining.map((bookmark) => bookmark.id)).toEqual([later.id]);
  });

  it('the mock refuses what the host refuses', async () => {
    const api = createMockApi();
    const [chapter] = await api.manuscriptChapters();
    const line = (await api.manuscriptParagraphs(chapter?.id ?? ''))[1];
    await expect(api.bookmarksAdd('no-such-chapter', line?.id ?? '', 0)).rejects.toThrow('not in the manuscript');
    await expect(api.bookmarksAdd(chapter?.id ?? '', 'no-such-line', 0)).rejects.toThrow('not in this chapter');
    await expect(api.bookmarksAdd(chapter?.id ?? '', line?.id ?? '', (line?.text.length ?? 0) + 1)).rejects.toThrow('not in the line');
    await expect(api.bookmarksAdd(chapter?.id ?? '', line?.id ?? '', -1)).rejects.toThrow('not in the line');
    const added = await api.bookmarksAdd(chapter?.id ?? '', line?.id ?? '', 0);
    await expect(api.bookmarksUpdate(added.id, 'a'.repeat(61), '')).rejects.toThrow('at most 60');
    await expect(api.bookmarksUpdate(added.id, '', 'a'.repeat(501))).rejects.toThrow('at most 500');
    await expect(api.bookmarksUpdate(added.id, 'one\ntwo', '')).rejects.toThrow('one line');
    await expect(api.bookmarksUpdate(added.id, '', 'bell\u0007')).rejects.toThrow('only text');
    await expect(api.bookmarksUpdate('gone', '', '')).rejects.toThrow('no longer there');
    expect(await api.bookmarksRemove('gone')).toHaveLength(1);
  });

  it('the schemas read a stale bookmark and refuse a negative offset, an unknown key or a label over the limit', () => {
    const golden = parseWire(bookmarksSchema, readGolden('bookmarks-list.json'), ctx('bookmarks list'));
    expect(golden.at(-1)?.paragraph).toBeNull();
    expect(golden.filter((bookmark) => bookmark.stale).map((bookmark) => bookmark.staleReason)).toEqual(['offset_out_of_range', 'paragraph_missing']);
    const bookmark = parseWire(spotBookmarkSchema, readGolden('bookmarks-add.json'), ctx('bookmarks add'));
    expect(spotBookmarkSchema.safeParse({ ...bookmark, offset: -1 }).success).toBe(false);
    expect(spotBookmarkSchema.safeParse({ ...bookmark, path: '/etc/passwd' }).success).toBe(false);
    expect(spotBookmarkSchema.safeParse({ ...bookmark, label: 'a'.repeat(61) }).success).toBe(false);
    expect(spotBookmarkSchema.safeParse({ ...bookmark, staleReason: 'moved' }).success).toBe(false);
    expect(bookmarksSchema.safeParse([{ ...bookmark, offset: 1.5 }]).success).toBe(false);
  });
});

// The Booth's passage map (docs/architecture/manuscript-teleprompter.md#the-passage-map): the mock answers through the same
// schema as the host's goldens, refuses what the host refuses, and the schema refuses what the host never sends.
describe('the passage map bindings', () => {
  const runOn = (pid: string, words: number) => [
    { pid, word: 0, sec: 0, kind: 'start' as const },
    { pid, word: 1, sec: 2.5, kind: 'roll' as const, prev: { pid, word: 2 } },
    { pid, word: words, sec: 6, kind: 'stop' as const, prev: { pid, word: words } },
  ];

  it('the mock answers PassageMapRecordRun and PassageMapList through their schema, recordings in order', async () => {
    const api = createMockApi();
    const [chapter] = await api.manuscriptChapters();
    const line = (await api.manuscriptParagraphs(chapter?.id ?? ''))[1];
    const words = (line?.text.match(/\S+/g) ?? []).length;
    expectMatches(passageMapSchema, await api.passageMapList(chapter?.id ?? ''), 'mock passage map list (empty)');
    const first = await api.passageMapRecordRun(chapter?.id ?? '', runOn(line?.id ?? '', words));
    expectMatches(passageMapSchema, first, 'mock passage map record');
    expect(first.map((mark) => mark.kind)).toEqual(['start', 'roll', 'stop']);
    expect(first.every((mark) => mark.itemGuid !== '' && mark.takeGuid === mark.itemGuid && !mark.stale)).toBe(true);
    const second = await api.passageMapRecordRun(chapter?.id ?? '', runOn(line?.id ?? '', words));
    const listed = await api.passageMapList(chapter?.id ?? '');
    expectMatches(passageMapSchema, listed, 'mock passage map list');
    expect(listed.map((mark) => mark.run)).toEqual([...first, ...second].map((mark) => mark.run));
    expect(new Set(listed.map((mark) => mark.run)).size).toBe(2);
  });

  it('the mock refuses what the host refuses, and keeps nothing of a refused run', async () => {
    const api = createMockApi();
    const [chapter, other] = await api.manuscriptChapters();
    const line = (await api.manuscriptParagraphs(chapter?.id ?? ''))[1];
    const otherLine = (await api.manuscriptParagraphs(other?.id ?? ''))[0];
    const words = (line?.text.match(/\S+/g) ?? []).length;
    const id = chapter?.id ?? '';
    const pid = line?.id ?? '';
    const run = () => runOn(pid, words);
    await expect(api.passageMapRecordRun('no-such-chapter', run())).rejects.toThrow('not in the manuscript');
    await expect(api.passageMapRecordRun(id, runOn(otherLine?.id ?? '', 0))).rejects.toThrow('not in this chapter');
    await expect(api.passageMapRecordRun(id, runOn(pid, words + 1))).rejects.toThrow('not in the paragraph');
    await expect(
      api.passageMapRecordRun(
        id,
        run().map((mark, i) => (i === 1 ? { ...mark, sec: -1 } : mark)),
      ),
    ).rejects.toThrow('seconds');
    await expect(
      api.passageMapRecordRun(
        id,
        run().map((mark, i) => (i === 1 ? { ...mark, sec: Number.NaN } : mark)),
      ),
    ).rejects.toThrow('seconds');
    await expect(
      api.passageMapRecordRun(
        id,
        run().map((mark, i) => (i === 1 ? { ...mark, sec: 9 } : mark)),
      ),
    ).rejects.toThrow('time order');
    await expect(
      api.passageMapRecordRun(
        id,
        run().map((mark, i) => (i === 2 ? { pid, word: 0, sec: 6, kind: 'stop' as const } : mark)),
      ),
    ).rejects.toThrow('where the take before');
    await expect(api.passageMapRecordRun(id, run().slice(1))).rejects.toThrow('begins with a start');
    await expect(api.passageMapRecordRun(id, run().slice(0, 1))).rejects.toThrow('a start and a stop');
    await expect(api.passageMapRecordRun('c'.repeat(65), run())).rejects.toThrow('chapter id');
    await expect(api.passageMapRecordRun(id, runOn('p\u0007', 0))).rejects.toThrow('paragraph id');
    expect(await api.passageMapList(id)).toEqual([]);
  });

  it('the schema reads the goldens, a stale mark among them, and refuses a negative word, an unknown kind or key', () => {
    const listed = parseWire(passageMapSchema, readGolden('passagemap-list.json'), ctx('passage map list'));
    expect(listed.map((mark) => mark.staleReason ?? null)).toEqual(['paragraph_missing', 'paragraph_missing', null]);
    const [mark] = parseWire(passageMapSchema, readGolden('passagemap-record.json'), ctx('passage map record'));
    expect(passageMarkSchema.safeParse(mark).success).toBe(true);
    expect(passageMarkSchema.safeParse({ ...mark, word: -1 }).success).toBe(false);
    expect(passageMarkSchema.safeParse({ ...mark, word: 1.5 }).success).toBe(false);
    expect(passageMarkSchema.safeParse({ ...mark, kind: 'pause' }).success).toBe(false);
    expect(passageMarkSchema.safeParse({ ...mark, path: '/etc/passwd' }).success).toBe(false);
    expect(passageMarkSchema.safeParse({ ...mark, staleReason: 'moved' }).success).toBe(false);
    expect(passageMarkSchema.safeParse({ ...mark, prev: { pid: 'p', word: 0, extra: 1 } }).success).toBe(false);
  });
});

// The narrator's accepted words (ADR 0856): the mock answers through the same schemas as the host's goldens, refuses what the
// host refuses, and the schemas refuse what the host never sends.
describe('the accepted words bindings', () => {
  const firstWords = async () => {
    const api = createMockApi();
    const [chapter, other] = await api.manuscriptChapters();
    const lines = await api.manuscriptParagraphs(chapter?.id ?? '');
    const line = lines.find((paragraph) => paragraph.text.split(/\s+/).filter(Boolean).length >= 3);
    return { api, chapterId: chapter?.id ?? '', otherId: other?.id ?? '', line: line ?? { id: '', text: '', index: 0 } };
  };

  it('the mock answers EditingAcceptedList, Accept and Unaccept through their schemas, in reading order', async () => {
    const { api, chapterId, line } = await firstWords();
    expectMatches(acceptedWordsSchema, await api.editingAcceptedList(chapterId), 'mock accepted list (empty)');
    const accepted = await api.editingAccept(chapterId, [`${line.id}:2`, `${line.id}:0`]);
    expectMatches(acceptedWordsChangeSchema, accepted, 'mock accept');
    expect(accepted.changed).toEqual([`${line.id}:2`, `${line.id}:0`]);
    expect(accepted.words.map((word) => word.key)).toEqual([`${line.id}:0`, `${line.id}:2`]);
    expect(accepted.words[0]).toMatchObject({ text: line.text.split(/\s+/).filter(Boolean)[0], paragraph: line.index, stale: false });
    expect((await api.editingAccept(chapterId, [`${line.id}:0`])).changed).toEqual([]);
    const listed = await api.editingAcceptedList(chapterId);
    expectMatches(acceptedWordsSchema, listed, 'mock accepted list');
    expect(listed.words).toHaveLength(2);
    const removed = await api.editingUnaccept(chapterId, [`${line.id}:0`, `${line.id}:1`]);
    expectMatches(acceptedWordsChangeSchema, removed, 'mock unaccept');
    expect(removed.changed).toEqual([`${line.id}:0`]);
    expect(removed.words.map((word) => word.key)).toEqual([`${line.id}:2`]);
  });

  it('the mock refuses what the host refuses and saves nothing', async () => {
    const { api, chapterId, otherId, line } = await firstWords();
    const count = line.text.split(/\s+/).filter(Boolean).length;
    await expect(api.editingAccept('no-such-chapter', [`${line.id}:0`])).rejects.toThrow('not in the manuscript');
    await expect(api.editingAccept(otherId, [`${line.id}:0`])).rejects.toThrow('not in this chapter');
    await expect(api.editingAccept(chapterId, [`${line.id}:0`, `${line.id}:${count}`])).rejects.toThrow('past the end of its line');
    await expect(api.editingAccept(chapterId, [`${line.id}:-1`])).rejects.toThrow('not a word of the script');
    await expect(api.editingAccept(chapterId, [`${line.id}:01`])).rejects.toThrow('not a word of the script');
    await expect(api.editingAccept(chapterId, ['../../etc/passwd:0'])).rejects.toThrow('not in this chapter');
    await expect(api.editingAccept(chapterId, [])).rejects.toThrow('choose a word');
    expect((await api.editingAcceptedList(chapterId)).words).toEqual([]);
  });

  it('the schemas read stale words and refuse a negative ordinal, an unknown key or a stale reason the host never sends', () => {
    const list = parseWire(acceptedWordsSchema, readGolden('edit-accepted-list.json'), ctx('accepted list'));
    expect(list.words.filter((word) => word.stale).map((word) => word.staleReason)).toEqual(['text_changed', 'word_missing']);
    const empty = parseWire(acceptedWordsSchema, readGolden('edit-accepted-list-empty.json'), ctx('accepted list empty'));
    expect(empty.words).toEqual([]);
    const change = parseWire(acceptedWordsChangeSchema, readGolden('edit-accepted-accept.json'), ctx('accept'));
    expect(change.changed).toEqual(['p-000001:4', 'p-000001:5']);
    expect(parseWire(acceptedWordsChangeSchema, readGolden('edit-accepted-unaccept.json'), ctx('unaccept')).changed).toEqual(['p-000002:1', 'p-000002:3']);
    const word = change.words[0];
    expect(acceptedWordSchema.safeParse({ ...word, ordinal: -1 }).success).toBe(false);
    expect(acceptedWordSchema.safeParse({ ...word, ordinal: 1.5 }).success).toBe(false);
    expect(acceptedWordSchema.safeParse({ ...word, path: '/etc/passwd' }).success).toBe(false);
    expect(acceptedWordSchema.safeParse({ ...word, key: '../x' }).success).toBe(false);
    expect(acceptedWordSchema.safeParse({ ...word, staleReason: 'moved' }).success).toBe(false);
    expect(acceptedWordsChangeSchema.safeParse({ ...change, extra: true }).success).toBe(false);
  });
});

// The narrator's cuts (ADR 0856): the mock answers through the same schemas as the host's goldens, refuses what the host
// refuses, and the schemas refuse what the host never sends.
describe('the cuts bindings', () => {
  const firstLine = async () => {
    const api = createMockApi();
    const [chapter, other] = await api.manuscriptChapters();
    const lines = await api.manuscriptParagraphs(chapter?.id ?? '');
    const line = lines.find((paragraph) => paragraph.text.split(/\s+/).filter(Boolean).length >= 3);
    return { api, chapterId: chapter?.id ?? '', otherId: other?.id ?? '', line: line ?? { id: '', text: '', index: 0 } };
  };
  const request = (pid: string, a: number, b: number): EditCutRequest => ({
    pid,
    takeId: 't-1',
    keys: [`${pid}:1`, `${pid}:0`],
    text: 'two words',
    a,
    b,
    off0: 0,
    off1: b - a,
    mode: 'close',
    fadeMs: 12,
    daw: 'reaper',
    guid: '{CUT}',
    undoSteps: 1,
  });

  it('the mock answers EditingCutsList, Record and Remove through their schemas, in time order', async () => {
    const { api, chapterId, line } = await firstLine();
    expectMatches(editCutsSchema, await api.editingCutsList(chapterId), 'mock cuts list (empty)');
    expectMatches(editCutsChangeSchema, await api.editingCutRecord(chapterId, { ...request(line.id, 20, 21), keys: [`${line.id}:2`] }), 'mock record');
    const recorded = await api.editingCutRecord(chapterId, request(line.id, 12, 13.5));
    expectMatches(editCutsChangeSchema, recorded, 'mock record');
    expect(recorded.changed).toEqual(['cut2']);
    expect(recorded.cuts.map((cut) => cut.id)).toEqual(['cut2', 'cut1']);
    expect(recorded.cuts[0]).toMatchObject({
      keys: [`${line.id}:0`, `${line.id}:1`],
      words: line.text.split(/\s+/).filter(Boolean).slice(0, 2),
      a: 12,
      stale: false,
    });
    const removed = await api.editingCutRemove(chapterId, 'cut2');
    expectMatches(editCutsChangeSchema, removed, 'mock remove');
    expect(removed.changed).toEqual(['cut2']);
    expect((await api.editingCutRemove(chapterId, 'cut2')).changed).toEqual([]);
  });

  it('the mock refuses what the host refuses and saves nothing', async () => {
    const { api, chapterId, otherId, line } = await firstLine();
    const good = request(line.id, 12, 13);
    await expect(api.editingCutRecord('no-such-chapter', good)).rejects.toThrow('not in the manuscript');
    await expect(api.editingCutRecord(otherId, good)).rejects.toThrow('not in this chapter');
    await expect(api.editingCutRecord(chapterId, { ...good, keys: ['../../etc/passwd:0'] })).rejects.toThrow('all be in its paragraph');
    await expect(api.editingCutRecord(chapterId, { ...good, b: 12 })).rejects.toThrow('end after it starts');
    await expect(api.editingCutRecord(chapterId, { ...good, a: -1 })).rejects.toThrow('seconds from the start');
    await expect(api.editingCutRecord(chapterId, { ...good, mode: 'erase' as 'close' })).rejects.toThrow('closes the gap or leaves it');
    await expect(api.editingCutRecord(chapterId, { ...good, fadeMs: 13 })).rejects.toThrow('crossfade');
    await expect(api.editingCutRecord(chapterId, { ...good, guid: '' })).rejects.toThrow('after the DAW made it');
    expect((await api.editingCutsList(chapterId)).cuts).toEqual([]);
    await api.editingCutRecord(chapterId, good);
    await expect(api.editingCutRecord(chapterId, { ...good, a: 12.5, b: 14 })).rejects.toThrow('cut1');
  });

  it('the schemas read the goldens and refuse a negative time, an unknown key or a fade the host never sends', () => {
    const list = parseWire(editCutsSchema, readGolden('edit-cuts-list.json'), ctx('cuts list'));
    expect(list.cuts.map((cut) => [cut.id, cut.stale, cut.staleReason])).toEqual([
      ['cut2', false, undefined],
      ['cut1', true, 'text_changed'],
    ]);
    const change = parseWire(editCutsChangeSchema, readGolden('edit-cuts-record.json'), ctx('cut record'));
    expect(change.changed).toEqual(['cut2']);
    expect(parseWire(editCutsChangeSchema, readGolden('edit-cuts-remove.json'), ctx('cut remove')).changed).toEqual(['cut2']);
    const cut = change.cuts[0];
    expect(editCutSchema.safeParse({ ...cut, a: -1 }).success).toBe(false);
    expect(editCutSchema.safeParse({ ...cut, b: cut.a }).success).toBe(false);
    expect(editCutSchema.safeParse({ ...cut, fadeMs: 13 }).success).toBe(false);
    expect(editCutSchema.safeParse({ ...cut, path: '/etc/passwd' }).success).toBe(false);
    expect(editCutSchema.safeParse({ ...cut, words: ['one'] }).success).toBe(false);
    expect(editCutsChangeSchema.safeParse({ ...change, extra: true }).success).toBe(false);
  });
});

// The Script page's marks: the mock answers through the same schemas as the host's goldens, refuses what the host refuses, and
// the schemas refuse what the host never sends.
describe('the marks bindings', () => {
  const firstLine = async () => {
    const api = createMockApi();
    const [chapter, other] = await api.manuscriptChapters();
    const lines = await api.manuscriptParagraphs(chapter?.id ?? '');
    const line = lines.find((paragraph) => paragraph.text.length >= 12) ?? { id: '', text: '', index: 0 };
    return { api, chapterId: chapter?.id ?? '', otherId: other?.id ?? '', line };
  };

  it('the mock answers MarksList, Add, Remove and SaveTypes through their schemas, in reading order', async () => {
    const { api, chapterId, line } = await firstLine();
    const empty = await api.marksList();
    expectMatches(marksSchema, empty, 'mock marks list (empty)');
    expect(empty.types.map((type) => type.key)).toEqual(['stress', 'breath', 'pace', 'emo', 'note', 'ask']);
    const later = await api.marksAdd(chapterId, line.id, 6, 10, 'stress', '');
    const question = await api.marksAdd(chapterId, line.id, 0, 4, 'ask', '  Is this right?  ');
    expectMatches(markSchema, question, 'mock marks add');
    expect(question).toMatchObject({ quote: line.text.slice(0, 4), text: 'Is this right?', status: 'open', thread: [], stale: false, paragraph: line.index });
    const listed = await api.marksList();
    expectMatches(marksSchema, listed, 'mock marks list');
    expect(listed.marks.map((mark) => mark.id)).toEqual([question.id, later.id]);
    const removed = await api.marksRemove(question.id);
    expectMatches(marksSchema, removed, 'mock marks remove');
    expect(removed.marks.map((mark) => mark.id)).toEqual([later.id]);
    const withoutStress = removed.types.filter((type) => type.key !== 'stress');
    await expect(api.marksSaveTypes(withoutStress, false)).rejects.toThrow('1 mark uses');
    const saved = await api.marksSaveTypes([...withoutStress, { key: '', name: 'Accent', colour: 'info', style: 'box', asks: false }], true);
    expectMatches(marksSchema, saved, 'mock marks types');
    expect(saved.marks).toEqual([]);
    expect(saved.types.at(-1)?.key).not.toBe('');
  });

  it('the mock refuses what the host refuses and saves nothing', async () => {
    const { api, chapterId, otherId, line } = await firstLine();
    await expect(api.marksAdd('no-such-chapter', line.id, 0, 3, 'stress', '')).rejects.toThrow('not in the manuscript');
    await expect(api.marksAdd(otherId, line.id, 0, 3, 'stress', '')).rejects.toThrow('not in this chapter');
    await expect(api.marksAdd(chapterId, line.id, 3, 3, 'stress', '')).rejects.toThrow('choose some words');
    await expect(api.marksAdd(chapterId, line.id, 0, line.text.length + 1, 'stress', '')).rejects.toThrow('not in the line');
    await expect(api.marksAdd(chapterId, line.id, 0, 3, 'ask', ' ')).rejects.toThrow('write the question');
    await expect(api.marksAdd(chapterId, line.id, 0, 3, 'nope', '')).rejects.toThrow('no longer there');
    await expect(api.marksAdd(chapterId, line.id, 0, 3, 'note', 'bell\u0007')).rejects.toThrow('only text');
    await expect(api.marksAdd(chapterId, line.id, 0, 3, 'note', 'x'.repeat(2001))).rejects.toThrow('at most 2000');
    await expect(api.marksSaveTypes([], true)).rejects.toThrow('at least one');
    expect((await api.marksList()).marks).toEqual([]);
  });

  it('the schemas read stale marks and refuse an unknown colour, style, key or stale reason', () => {
    const list = parseWire(marksSchema, readGolden('marks-list.json'), ctx('marks list'));
    expect(list.marks.map((mark) => mark.staleReason ?? null)).toEqual([null, 'text_changed', 'paragraph_missing']);
    const added = parseWire(markSchema, readGolden('marks-add.json'), ctx('marks add'));
    expect(added).toMatchObject({ status: 'open', thread: [] });
    expect(parseWire(marksSchema, readGolden('marks-remove.json'), ctx('marks remove')).marks).toHaveLength(2);
    expect(parseWire(marksSchema, readGolden('marks-types.json'), ctx('marks types')).types.at(-1)?.key).toBe('accent');
    const type = list.types[0];
    expect(markTypeSchema.safeParse({ ...type, colour: 'pink' }).success).toBe(false);
    expect(markTypeSchema.safeParse({ ...type, style: 'zigzag' }).success).toBe(false);
    expect(markTypeSchema.safeParse({ ...type, key: '../x' }).success).toBe(false);
    expect(markTypeSchema.safeParse({ ...type, extra: true }).success).toBe(false);
    expect(markSchema.safeParse({ ...added, path: '/etc/passwd' }).success).toBe(false);
    expect(markSchema.safeParse({ ...added, staleReason: 'moved' }).success).toBe(false);
    expect(markSchema.safeParse({ ...added, start: 9, end: 2 }).success).toBe(false);
    expect(markSchema.safeParse({ ...added, status: 'closed' }).success).toBe(false);
    expect(marksSchema.safeParse({ ...list, types: [] }).success).toBe(false);
  });

  it('the thread goldens parse, and the schemas refuse an unknown author, an empty message or an unknown key', () => {
    const threaded = parseWire(markSchema, readGolden('marks-thread.json'), ctx('marks thread'));
    expect(threaded.thread.map((message) => message.who)).toEqual(['author', 'proofer']);
    const deleted = parseWire(markThreadDeletedSchema, readGolden('marks-thread-deleted.json'), ctx('marks thread deleted'));
    expect(deleted.mark.thread).toHaveLength(1);
    expect(deleted.message.who).toBe('proofer');
    const message = threaded.thread[0];
    expect(threadMessageSchema.safeParse(message).success).toBe(true);
    expect(threadMessageSchema.safeParse({ ...message, who: 'editor' }).success).toBe(false);
    expect(threadMessageSchema.safeParse({ ...message, text: '' }).success).toBe(false);
    expect(threadMessageSchema.safeParse({ ...message, text: 'x'.repeat(2001) }).success).toBe(false);
    expect(threadMessageSchema.safeParse({ ...message, html: '<b>' }).success).toBe(false);
    expect(markSchema.safeParse({ ...threaded, thread: [{ ...message, who: 'narrator' }] }).success).toBe(false);
    expect(markThreadDeletedSchema.safeParse({ ...deleted, index: 1 }).success).toBe(false);
  });

  it('the mock keeps a thread: reply, edit, delete and restore, resolve and reopen, through the schemas', async () => {
    const { api, chapterId, line } = await firstLine();
    const question = await api.marksAdd(chapterId, line.id, 0, 4, 'ask', 'Is this right?');
    await api.marksReply(question.id, 'author', ' Yes. ');
    const replied = await api.marksReply(question.id, 'proofer', 'Clipped at 2:14.');
    expectMatches(markSchema, replied, 'mock marks reply');
    expect(replied.thread.map((message) => [message.who, message.text])).toEqual([
      ['author', 'Yes.'],
      ['proofer', 'Clipped at 2:14.'],
    ]);
    expect(replied.thread[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const edited = await api.marksEditMessage(question.id, 0, 'Yes, the live ones.');
    expectMatches(markSchema, edited, 'mock marks edit message');
    expect(edited.thread.map((message) => message.text)).toEqual(['Yes, the live ones.', 'Clipped at 2:14.']);
    const deleted = await api.marksDeleteMessage(question.id, 0);
    expectMatches(markThreadDeletedSchema, deleted, 'mock marks delete message');
    expect(deleted.message.text).toBe('Yes, the live ones.');
    expect(deleted.mark.thread).toHaveLength(1);
    const restored = await api.marksRestoreMessage(question.id, 0, deleted.message);
    expectMatches(markSchema, restored, 'mock marks restore message');
    expect(restored.thread).toEqual(edited.thread);
    expect((await api.marksSetStatus(question.id, 'resolved')).status).toBe('resolved');
    expect((await api.marksSetStatus(question.id, 'open')).status).toBe('open');
  });

  it('the mock refuses in a thread what the host refuses and changes nothing', async () => {
    const { api, chapterId, line } = await firstLine();
    const question = await api.marksAdd(chapterId, line.id, 0, 4, 'ask', 'Is this right?');
    const stress = await api.marksAdd(chapterId, line.id, 6, 10, 'stress', '');
    await api.marksReply(question.id, 'author', 'Yes.');
    await expect(api.marksReply(question.id, 'you', '  ')).rejects.toThrow('write the reply or note first');
    await expect(api.marksReply('missing', 'you', 'Hi')).rejects.toThrow('no longer there');
    await expect(api.marksReply(question.id, 'you', 'x'.repeat(2001))).rejects.toThrow('at most 2000');
    await expect(api.marksReply(question.id, 'you', 'bell\u0007')).rejects.toThrow('only text');
    await expect(api.marksEditMessage(question.id, 1, 'x')).rejects.toThrow('no longer there');
    await expect(api.marksEditMessage(question.id, 0, ' ')).rejects.toThrow('write the message first');
    await expect(api.marksDeleteMessage(question.id, -1)).rejects.toThrow('no longer there');
    const message = { who: 'you', text: 'Hi', at: '2026-10-11T10:00:00Z' } as const;
    await expect(api.marksRestoreMessage(question.id, 2, message)).rejects.toThrow('no longer there');
    await expect(api.marksRestoreMessage(question.id, 0, { ...message, text: '' })).rejects.toThrow('needs its text');
    await expect(api.marksSetStatus(stress.id, 'resolved')).rejects.toThrow('only a question');
    const after = (await api.marksList()).marks.find((mark) => mark.id === question.id);
    expect(after?.thread.map((entry) => entry.text)).toEqual(['Yes.']);
    expect(after?.status).toBe('open');
  });
});

// The Story Bible's extraction suggestions: the host's goldens parse, the schemas refuse what the host never sends, and the mock decides
// through the same schemas, refusing what the host refuses with nothing changed.
describe('the extraction bindings', () => {
  it('the schemas read the goldens: one of each kind and status, the empty list and an accept', () => {
    const list = parseWire(extractionSuggestionsSchema, readGolden('extraction-list.json'), ctx('extraction list'));
    expect(new Set(list.map((s) => s.kind))).toEqual(new Set(['entry', 'alias', 'property', 'relationship', 'claim', 'speaker']));
    expect(new Set(list.map((s) => s.status))).toEqual(new Set(['accepted-auto', 'needs-verification', 'accepted', 'rejected']));
    expect(list[0]?.kind).toBe('entry');
    expect(list.some((s) => s.confidence === null)).toBe(true);
    expect(parseWire(extractionSuggestionsSchema, readGolden('extraction-list-empty.json'), ctx('extraction list empty'))).toEqual([]);
    const accepted = parseWire(extractionDecisionSchema, readGolden('extraction-accept.json'), ctx('extraction accept'));
    expect(accepted.suggestion.status).toBe('accepted');
    expect(accepted.entryIds).toEqual(['white-rabbit']);
  });

  it('the schema refuses an unknown kind, status or source, a confidence outside 0..1, a mismatched payload and an unknown key', () => {
    const [first] = parseWire(extractionSuggestionsSchema, readGolden('extraction-list.json'), ctx('extraction list'));
    const good = readGolden('extraction-list.json') as Array<Record<string, unknown>>;
    const raw = good[0] ?? {};
    expect(first).toBeDefined();
    expect(extractionSuggestionSchema.safeParse(raw).success).toBe(true);
    expect(extractionSuggestionSchema.safeParse({ ...raw, kind: 'rumour' }).success).toBe(false);
    expect(extractionSuggestionSchema.safeParse({ ...raw, status: 'maybe' }).success).toBe(false);
    expect(extractionSuggestionSchema.safeParse({ ...raw, source: 'web' }).success).toBe(false);
    expect(extractionSuggestionSchema.safeParse({ ...raw, confidence: 1.2 }).success).toBe(false);
    expect(extractionSuggestionSchema.safeParse({ ...raw, confidence: -0.1 }).success).toBe(false);
    expect(extractionSuggestionSchema.safeParse({ ...raw, kind: 'alias' }).success).toBe(false);
    expect(extractionSuggestionSchema.safeParse({ ...raw, path: '/etc/passwd' }).success).toBe(false);
    expect(extractionSuggestionSchema.safeParse({ ...raw, payload: { kind: 'entry', name: 'X', extra: true } }).success).toBe(false);
    expect(extractionSuggestionSchema.safeParse({ ...raw, evidence: [{ paragraphId: 'p', start: 4, end: 2, text: 'ab' }] }).success).toBe(false);
  });

  it('the mock answers the five methods through their schemas and decides as the host does', async () => {
    const api = createMockApi();
    const list = await api.extractionList();
    expectMatches(extractionSuggestionsSchema, list, 'mock extraction list');
    expect(new Set(list.map((s) => s.kind)).size).toBe(6);
    expect(new Set(list.map((s) => s.status)).size).toBe(4);
    const byText = (text: string) => {
      const found = list.find((s) => JSON.stringify(s.payload).includes(text));
      if (!found) throw new Error(text);
      return found;
    };

    const rabbit = byText('"alias":"Rabbit"');
    const accepted = await api.extractionAccept(rabbit.id);
    expectMatches(extractionDecisionSchema, accepted, 'mock extraction accept');
    expect(accepted).toMatchObject({ suggestion: { status: 'accepted' }, entryIds: ['white-rabbit'] });
    const reopened = await api.extractionReopen(rabbit.id);
    expectMatches(extractionDecisionSchema, reopened, 'mock extraction reopen');
    expect(reopened.suggestion.status).toBe('needs-verification');
    expect(reopened.suggestion.applied).toBeUndefined();

    const habit = byText('Smokes a hookah');
    const edited = await api.extractionAccept(habit.id, '  Smokes a long hookah  ');
    expect(edited.suggestion.payload).toMatchObject({ value: 'Smokes a long hookah' });

    const dodo = byText('The Dodo');
    const rejected = await api.extractionReject(dodo.id);
    expectMatches(extractionDecisionSchema, rejected, 'mock extraction reject');
    expect(rejected.suggestion).toMatchObject({ status: 'rejected' });
    expect((await api.extractionReopen(dodo.id)).suggestion.status).toBe('accepted-auto');
    const reviewed = await api.extractionReview(dodo.id);
    expectMatches(extractionDecisionSchema, reviewed, 'mock extraction review');
    expect(reviewed.suggestion.status).toBe('accepted');
  });

  it('the mock refuses what the host refuses and changes nothing', async () => {
    const api = createMockApi();
    const before = await api.extractionList();
    const id = (text: string) => before.find((s) => JSON.stringify(s.payload).includes(text))?.id ?? '';
    await expect(api.extractionAccept('s999')).rejects.toThrow('That suggestion is gone.');
    await expect(api.extractionAccept(id('"alias":"the Queen"'))).rejects.toThrow('is already a name of Queen of Hearts');
    await expect(api.extractionAccept(id('Pleasant in this chapter'))).rejects.toThrow('The entry is locked.');
    await expect(api.extractionAccept(id('Smokes a hookah'), '   ')).rejects.toThrow('The text is empty.');
    await expect(api.extractionAccept(id('Smokes a hookah'), 'x'.repeat(8193))).rejects.toThrow('The text is too long.');
    await expect(api.extractionReview(id('"alias":"Rabbit"'))).rejects.toThrow('Nothing to review.');
    await expect(api.extractionReopen(id('"alias":"Rabbit"'))).rejects.toThrow('not decided');
    expect(await api.extractionList()).toEqual(before);
  });
});

// The narrator's word effects (ADR 0856): the mock answers through the same schemas as the host's goldens, refuses what the
// host refuses, and the schemas refuse what the host never sends, a chain named by a path among them.
describe('the word effects bindings', () => {
  const firstLine = async () => {
    const api = createMockApi();
    const [chapter, other] = await api.manuscriptChapters();
    const lines = await api.manuscriptParagraphs(chapter?.id ?? '');
    const line = lines.find((paragraph) => paragraph.text.split(/\s+/).filter(Boolean).length >= 3);
    return { api, chapterId: chapter?.id ?? '', otherId: other?.id ?? '', line: line ?? { id: '', text: '', index: 0 } };
  };
  const request = (pid: string, a: number, b: number): WordFxRequest => ({
    pid,
    takeId: 't-1',
    keys: [`${pid}:1`, `${pid}:0`],
    text: 'two words',
    a,
    b,
    off0: 0,
    off1: b - a,
    chainId: 'Voice/Polish.RfxChain',
    chainName: 'Voice polish (EQ, compressor, de-esser)',
    source: 'Your REAPER FX chains',
    fadeMs: 8,
    daw: 'reaper',
    guid: '{FX}',
  });

  it('the mock answers EditingWordFxList, Record and Remove through their schemas, in time order, and says what an effect is over', async () => {
    const { api, chapterId, line } = await firstLine();
    expectMatches(wordFxListSchema, await api.editingWordFxList(chapterId), 'mock word effects list (empty)');
    expectMatches(wordFxChangeSchema, await api.editingWordFxRecord(chapterId, { ...request(line.id, 20, 21), keys: [`${line.id}:2`] }), 'mock record');
    const recorded = await api.editingWordFxRecord(chapterId, request(line.id, 12, 13.5));
    expectMatches(wordFxChangeSchema, recorded, 'mock record');
    expect(recorded.changed).toEqual(['fx2']);
    expect(recorded.over).toEqual([]);
    expect(recorded.effects.map((fx) => fx.id)).toEqual(['fx2', 'fx1']);
    expect(recorded.effects[0]).toMatchObject({
      keys: [`${line.id}:0`, `${line.id}:1`],
      words: line.text.split(/\s+/).filter(Boolean).slice(0, 2),
      a: 12,
      chainId: 'Voice/Polish.RfxChain',
      stale: false,
    });
    const onTop = await api.editingWordFxRecord(chapterId, { ...request(line.id, 13, 13.5), keys: [`${line.id}:1`], chainId: 'Deesser.RfxChain' });
    expect(onTop.changed).toEqual(['fx3']);
    expect(onTop.over).toEqual(['fx2']);
    const removed = await api.editingWordFxRemove(chapterId, 'fx3');
    expectMatches(wordFxChangeSchema, removed, 'mock remove');
    expect(removed.changed).toEqual(['fx3']);
    expect((await api.editingWordFxRemove(chapterId, 'fx3')).changed).toEqual([]);
  });

  it('the mock refuses what the host refuses and saves nothing', async () => {
    const { api, chapterId, otherId, line } = await firstLine();
    const good = request(line.id, 12, 13);
    await expect(api.editingWordFxRecord('no-such-chapter', good)).rejects.toThrow('not in the manuscript');
    await expect(api.editingWordFxRecord(otherId, good)).rejects.toThrow('not in this chapter');
    await expect(api.editingWordFxRecord(chapterId, { ...good, keys: ['../../etc/passwd:0'] })).rejects.toThrow('more than one take');
    await expect(api.editingWordFxRecord(chapterId, { ...good, b: 12 })).rejects.toThrow('end after it starts');
    await expect(api.editingWordFxRecord(chapterId, { ...good, a: -1 })).rejects.toThrow('seconds from the start');
    await expect(api.editingWordFxRecord(chapterId, { ...good, guid: '' })).rejects.toThrow('after the DAW added it');
    for (const name of ['C:\\FXChains\\Polish.RfxChain', '/etc/passwd', '../Polish.RfxChain', 'Voice/../../x', ''])
      await expect(api.editingWordFxRecord(chapterId, { ...good, chainId: name })).rejects.toThrow('not the name of an effect chain');
    expect((await api.editingWordFxList(chapterId)).effects).toEqual([]);
  });

  it('the schemas read the goldens and refuse a negative time, an unknown key or a chain named by a path', () => {
    const list = parseWire(wordFxListSchema, readGolden('edit-wordfx-list.json'), ctx('word effects list'));
    expect(list.effects.map((fx) => [fx.id, fx.stale, fx.staleReason])).toEqual([
      ['fx2', false, undefined],
      ['fx3', false, undefined],
      ['fx1', true, 'text_changed'],
    ]);
    const change = parseWire(wordFxChangeSchema, readGolden('edit-wordfx-record.json'), ctx('word effect record'));
    expect(change.changed).toEqual(['fx3']);
    expect(change.over).toEqual(['fx2']);
    expect(parseWire(wordFxChangeSchema, readGolden('edit-wordfx-remove.json'), ctx('word effect remove')).changed).toEqual(['fx3']);
    const fx = change.effects[0];
    expect(wordFxSchema.safeParse({ ...fx, a: -1 }).success).toBe(false);
    expect(wordFxSchema.safeParse({ ...fx, b: fx.a }).success).toBe(false);
    expect(wordFxSchema.safeParse({ ...fx, chainId: 'C:\\FX\\Polish.RfxChain' }).success).toBe(false);
    expect(wordFxSchema.safeParse({ ...fx, chainName: '../Polish' }).success).toBe(false);
    expect(wordFxSchema.safeParse({ ...fx, path: '/etc/passwd' }).success).toBe(false);
    expect(wordFxSchema.safeParse({ ...fx, words: [] }).success).toBe(false);
    expect(wordFxChangeSchema.safeParse({ ...change, extra: true }).success).toBe(false);
    expect(wordFxChangeSchema.safeParse({ chapterId: change.chapterId, effects: change.effects, changed: change.changed }).success).toBe(false);
  });
});
