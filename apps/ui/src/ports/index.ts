// The per-domain interfaces `NarrationApi` composes, and the `PortName` to interface map `usePort` reads (ADR 0770: ports are narrower than the facade).
// A page declares the one port it uses, `usePort('production')`, and sees `ProductionApi` only. This file only re-exports and maps, so it is not a
// port file for the provider-contract registration test.

import type { SystemApi } from '../api/contracts/system';
import type { ManuscriptApi } from '../api/contracts/manuscript';
import type { StoryBibleApi } from '../api/contracts/storyBible';
import type { CharacterApi } from '../api/contracts/character';
import type { SeriesApi } from '../api/contracts/series';
import type { TranscriptApi } from '../api/contracts/transcript';
import type { TtsApi } from '../api/contracts/tts';
import type { WhisperApi } from '../api/contracts/whisper';
import type { AssetsApi } from '../api/contracts/assets';
import type { ProjectApi } from '../api/contracts/project';
import type { DawCatalogApi } from '../api/contracts/dawCatalog';
import type { TracksApi } from '../api/contracts/tracks';
import type { ChapterTrackMapApi } from '../api/contracts/chapterTrackMap';
import type { ChapterSyncApi } from '../api/contracts/chapterSync';
import type { TeleprompterApi } from '../api/contracts/teleprompter';
import type { UpdateApi } from '../api/contracts/update';
import type { CreditsApi } from '../api/contracts/credits';
import type { LineIdentityApi } from '../api/contracts/lineidentity';
import type { PickupsApi } from '../api/contracts/pickups';
import type { RenderConfigApi } from '../api/contracts/renderconfig';
import type { CleanupToolsApi } from '../api/contracts/cleanuptools';
import type { ProjectStateApi } from '../api/contracts/projectstate';
import type { RetakeLanesApi } from '../api/contracts/retakelanes';
import type { ChapterTagsApi } from '../api/contracts/chaptertags';
import type { TakeReviewApi } from '../api/contracts/takeReview';
import type { CoverageApi } from '../api/contracts/coverage';
import type { StagesApi } from '../api/contracts/stages';
import type { DictionaryApi } from '../api/contracts/dictionary';
import type { FindingsApi } from '../api/contracts/findings';
import type { MeasureApi } from '../api/contracts/measure';
import type { DeliveryProfilesApi } from '../api/contracts/deliveryProfiles';
import type { DiagnosticsApi } from '../api/contracts/diagnostics';
import type { EditingApi } from '../api/contracts/editing';
import type { CleanupActionApi } from '../api/contracts/cleanup';
import type { PrepMarkupApi } from '../api/contracts/prepMarkup';
import type { BookmarksApi } from '../api/contracts/bookmarks';
import type { PassageMapApi } from '../api/contracts/passageMap';
import type { EditLogApi } from '../api/contracts/editLog';
import type { MarksApi } from '../api/contracts/marks';
import type { ExtractionApi } from '../api/contracts/extraction';
import type { EditCutsApi } from '../api/contracts/editCuts';
import type { EditWordFxApi } from '../api/contracts/wordFx';
import type { WorkspaceApi } from '../api/contracts/workspace';
import type { PreviewApi } from '../api/contracts/preview';
import type { DawCapabilitiesApi } from '../api/contracts/daw';
import type { DawProjectStateApi } from '../api/contracts/daw';
import type { ProviderCapabilitiesApi } from '../api/contracts/providers';
import type { MasteringApi } from '../api/contracts/mastering';
import type { RecordingApi } from '../api/contracts/recording';
import type { ProductionApi } from '../api/contracts/production';
import type { PronunciationLookupApi } from '../api/contracts/pronunciationLookup';
import type { PronunciationCommonsAudioApi } from '../api/contracts/wiktextractCommonsAudio';
import type { PronunciationOnlineApi } from '../api/contracts/pronunciationOnline';
import type { PronunciationSourcesApi } from '../api/contracts/pronunciationSources';
import type { TakeEvidenceApi } from '../api/contracts/takeEvidence';
import type { ProofingRenderApi } from '../api/contracts/proofingRender';
import type { PrepCompletenessApi } from '../api/contracts/prepCompleteness';
import type { RenderEncodeMasterApi } from '../api/contracts/renderEncodeMaster';
import type { WorkspaceSnapApi } from '../api/contracts/workspaceSnap';
import type { DawClient } from './daw';
import type { MeasurementsPort } from './measurements';
import type { AlignmentPort } from './alignment';
import type { TakesPort } from './takes';

export type { DawClient, MeasurementsPort, AlignmentPort, TakesPort };

export type {
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
  PrepMarkupApi,
  BookmarksApi,
  PassageMapApi,
  EditLogApi,
  MarksApi,
  ExtractionApi,
  EditCutsApi,
  EditWordFxApi,
  WorkspaceApi,
  PreviewApi,
  DawCapabilitiesApi,
  DawProjectStateApi,
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
  PrepCompletenessApi,
  RenderEncodeMasterApi,
  WorkspaceSnapApi,
};

/** Every port name and the interface it returns; one entry per interface in `NarrationApi`'s `extends` list. */
export interface PortMap {
  system: SystemApi;
  manuscript: ManuscriptApi;
  storyBible: StoryBibleApi;
  character: CharacterApi;
  series: SeriesApi;
  transcript: TranscriptApi;
  tts: TtsApi;
  whisper: WhisperApi;
  assets: AssetsApi;
  project: ProjectApi;
  dawCatalog: DawCatalogApi;
  tracks: TracksApi;
  chapterTrackMap: ChapterTrackMapApi;
  chapterSync: ChapterSyncApi;
  teleprompter: TeleprompterApi;
  update: UpdateApi;
  credits: CreditsApi;
  lineIdentity: LineIdentityApi;
  pickups: PickupsApi;
  renderConfig: RenderConfigApi;
  cleanupTools: CleanupToolsApi;
  projectState: ProjectStateApi;
  retakeLanes: RetakeLanesApi;
  chapterTags: ChapterTagsApi;
  takeReview: TakeReviewApi;
  coverage: CoverageApi;
  stages: StagesApi;
  dictionary: DictionaryApi;
  findings: FindingsApi;
  measure: MeasureApi;
  deliveryProfiles: DeliveryProfilesApi;
  diagnostics: DiagnosticsApi;
  editing: EditingApi;
  cleanupAction: CleanupActionApi;
  prepMarkup: PrepMarkupApi;
  bookmarks: BookmarksApi;
  passageMap: PassageMapApi;
  editLog: EditLogApi;
  marks: MarksApi;
  extraction: ExtractionApi;
  editCuts: EditCutsApi;
  editWordFx: EditWordFxApi;
  workspace: WorkspaceApi;
  preview: PreviewApi;
  dawCapabilities: DawCapabilitiesApi;
  dawProjectState: DawProjectStateApi;
  providerCapabilities: ProviderCapabilitiesApi;
  mastering: MasteringApi;
  recording: RecordingApi;
  production: ProductionApi;
  pronunciationLookup: PronunciationLookupApi;
  pronunciationCommonsAudio: PronunciationCommonsAudioApi;
  pronunciationOnline: PronunciationOnlineApi;
  pronunciationSources: PronunciationSourcesApi;
  takeEvidence: TakeEvidenceApi;
  proofingRender: ProofingRenderApi;
  prepCompleteness: PrepCompletenessApi;
  renderEncodeMaster: RenderEncodeMasterApi;
  workspaceSnap: WorkspaceSnapApi;
}

/** Ports that are not a `NarrationApi` interface but a client built over it (or over a mock), so a page sees one result type per call. */
export interface ClientPortMap {
  daw: DawClient;
  measurements: MeasurementsPort;
  alignment: AlignmentPort;
  takes: TakesPort;
}

export type PortName = keyof PortMap | keyof ClientPortMap;

/** What `usePort(name)` returns: the domain interface, or the client for a client port. */
export type PortOf<N extends PortName> = N extends keyof ClientPortMap ? ClientPortMap[N] : N extends keyof PortMap ? PortMap[N] : never;
