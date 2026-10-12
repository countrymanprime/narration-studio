// Compatibility barrel for existing feature imports. New API work belongs in
// api/contracts by domain so a feature can depend on its own wire contract.
export * from './api/contracts/system';
export * from './api/contracts/manuscript';
export * from './api/contracts/storyBible';
export * from './api/contracts/character';
export * from './api/contracts/series';
export * from './api/contracts/transcript';
export * from './api/contracts/assets';
export * from './api/contracts/tts';
export * from './api/contracts/whisper';
export * from './api/contracts/project';
export * from './api/contracts/dawCatalog';
export * from './api/contracts/tracks';
export * from './api/contracts/chapterTrackMap';
export * from './api/contracts/chapterSync';
export * from './api/contracts/teleprompter';
export * from './api/contracts/update';
export * from './api/contracts/credits';
export * from './api/contracts/lineidentity';
export * from './api/contracts/pickups';
export * from './api/contracts/renderconfig';
export * from './api/contracts/cleanuptools';
export * from './api/contracts/projectstate';
export * from './api/contracts/retakelanes';
export * from './api/contracts/chaptertags';
export * from './api/contracts/takeReview';
export * from './api/contracts/coverage';
export * from './api/contracts/stages';
export * from './api/contracts/dictionary';
export * from './api/contracts/findings';
export * from './api/contracts/measure';
export * from './api/contracts/deliveryProfiles';
export * from './api/contracts/diagnostics';
export * from './api/contracts/editing';
export * from './api/contracts/cleanup';
export * from './api/contracts/prepMarkup';
export * from './api/contracts/bookmarks';
export * from './api/contracts/passageMap';
export * from './api/contracts/editLog';
export * from './api/contracts/marks';
export * from './api/contracts/scriptPrep';
export * from './api/contracts/extraction';
export * from './api/contracts/editCuts';
export * from './api/contracts/wordFx';
export * from './api/contracts/editStacks';
export * from './api/contracts/workspace';
export * from './api/contracts/preview';
export * from './api/contracts/daw';
export * from './api/contracts/providers';
export * from './api/contracts/production';
export * from './api/contracts/pronunciationLookup';
export * from './api/contracts/wiktextractCommonsAudio';
export * from './api/contracts/pronunciationOnline';
export * from './api/contracts/proofingRender';
export * from './api/contracts/renderEncodeMaster';
export * from './api/contracts/workspaceSnap';

import type { ChapterTrackMapApi } from './api/contracts/chapterTrackMap';
import type { ChapterSyncApi } from './api/contracts/chapterSync';
import type { DawCatalogApi } from './api/contracts/dawCatalog';
import type { FindingsApi } from './api/contracts/findings';
import type { ManuscriptApi } from './api/contracts/manuscript';
import type { ProjectApi } from './api/contracts/project';
import type { StoryBibleApi } from './api/contracts/storyBible';
import type { CharacterApi } from './api/contracts/character';
import type { SeriesApi } from './api/contracts/series';
import type { SystemApi } from './api/contracts/system';
import type { TakeReviewApi } from './api/contracts/takeReview';
import type { TeleprompterApi } from './api/contracts/teleprompter';
import type { TracksApi } from './api/contracts/tracks';
import type { TranscriptApi } from './api/contracts/transcript';
import type { AssetsApi } from './api/contracts/assets';
import type { TtsApi } from './api/contracts/tts';
import type { UpdateApi } from './api/contracts/update';
import type { WhisperApi } from './api/contracts/whisper';
import type { CreditsApi } from './api/contracts/credits';
import type { LineIdentityApi } from './api/contracts/lineidentity';
import type { PickupsApi } from './api/contracts/pickups';
import type { RenderConfigApi } from './api/contracts/renderconfig';
import type { CleanupToolsApi } from './api/contracts/cleanuptools';
import type { ProjectStateApi } from './api/contracts/projectstate';
import type { RetakeLanesApi } from './api/contracts/retakelanes';
import type { ChapterTagsApi } from './api/contracts/chaptertags';
import type { CoverageApi } from './api/contracts/coverage';
import type { StagesApi } from './api/contracts/stages';
import type { ProductionApi } from './api/contracts/production';
import type { DictionaryApi } from './api/contracts/dictionary';
import type { MeasureApi } from './api/contracts/measure';
import type { DeliveryProfilesApi } from './api/contracts/deliveryProfiles';
import type { DiagnosticsApi } from './api/contracts/diagnostics';
import type { EditingApi } from './api/contracts/editing';
import type { CleanupActionApi } from './api/contracts/cleanup';
import type { BookmarksApi } from './api/contracts/bookmarks';
import type { PassageMapApi } from './api/contracts/passageMap';
import type { EditLogApi } from './api/contracts/editLog';
import type { MarksApi } from './api/contracts/marks';
import type { ScriptPrepApi } from './api/contracts/scriptPrep';
import type { ExtractionApi } from './api/contracts/extraction';
import type { EditCutsApi } from './api/contracts/editCuts';
import type { EditWordFxApi } from './api/contracts/wordFx';
import type { EditStacksApi } from './api/contracts/editStacks';
import type { WorkspaceApi } from './api/contracts/workspace';
import type { PreviewApi } from './api/contracts/preview';
import type { DawCapabilitiesApi } from './api/contracts/daw';
import type { DawProjectStateApi } from './api/contracts/daw';
import type { DawHideTakesApi } from './api/contracts/daw';
import type { DawRollApi } from './api/contracts/daw';
import type { DawDeleteRangeApi } from './api/contracts/daw';
import type { DawFxRangeApi } from './api/contracts/daw';
import type { DawStackTakesApi } from './api/contracts/daw';
import type { DawSplitTakeApi } from './api/contracts/daw';
import type { DawBackupsApi } from './api/contracts/daw';
import type { DawFilesApi } from './api/contracts/daw';
import type { ProviderCapabilitiesApi } from './api/contracts/providers';
import type { MasteringApi } from './api/contracts/mastering';
import type { RecordingApi } from './api/contracts/recording';
import type { PronunciationLookupApi } from './api/contracts/pronunciationLookup';
import type { PronunciationCommonsAudioApi } from './api/contracts/wiktextractCommonsAudio';
import type { PronunciationOnlineApi } from './api/contracts/pronunciationOnline';
import type { PronunciationSourcesApi } from './api/contracts/pronunciationSources';
import type { TakeEvidenceApi } from './api/contracts/takeEvidence';
import type { ProofingRenderApi } from './api/contracts/proofingRender';
import type { RenderEncodeMasterApi } from './api/contracts/renderEncodeMaster';
import type { WorkspaceSnapApi } from './api/contracts/workspaceSnap';

/** The app compatibility facade; domain interfaces remain independently testable. */
export interface NarrationApi
  extends
    SystemApi,
    ManuscriptApi,
    StoryBibleApi,
    CharacterApi,
    SeriesApi,
    TranscriptApi,
    TtsApi,
    WhisperApi,
    AssetsApi,
    ProjectApi,
    DawCatalogApi,
    TracksApi,
    ChapterTrackMapApi,
    ChapterSyncApi,
    TeleprompterApi,
    UpdateApi,
    CreditsApi,
    LineIdentityApi,
    PickupsApi,
    RenderConfigApi,
    CleanupToolsApi,
    ProjectStateApi,
    RetakeLanesApi,
    ChapterTagsApi,
    TakeReviewApi,
    CoverageApi,
    StagesApi,
    DictionaryApi,
    FindingsApi,
    MeasureApi,
    DeliveryProfilesApi,
    DiagnosticsApi,
    EditingApi,
    CleanupActionApi,
    BookmarksApi,
    PassageMapApi,
    EditLogApi,
    MarksApi,
    ScriptPrepApi,
    ExtractionApi,
    EditCutsApi,
    EditWordFxApi,
    EditStacksApi,
    WorkspaceApi,
    PreviewApi,
    DawCapabilitiesApi,
    DawProjectStateApi,
    DawHideTakesApi,
    DawRollApi,
    DawDeleteRangeApi,
    DawFxRangeApi,
    DawStackTakesApi,
    DawSplitTakeApi,
    DawBackupsApi,
    DawFilesApi,
    ProviderCapabilitiesApi,
    MasteringApi,
    RecordingApi,
    ProductionApi,
    PronunciationLookupApi,
    PronunciationCommonsAudioApi,
    PronunciationOnlineApi,
    PronunciationSourcesApi,
    TakeEvidenceApi,
    ProofingRenderApi,
    RenderEncodeMasterApi,
    WorkspaceSnapApi {}
