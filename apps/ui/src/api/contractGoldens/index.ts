// ADR 0069, rule 4: every payload the Go host and the Python sidecars write to tests/fixtures/contracts/ is checked by the
// schema the app runs (wireContracts.test.ts). One row per committed file, in the file for its feature area: a new golden
// file with no row fails that test, and so does a row whose file is missing. A file named in two feature areas fails here.
import type { z } from 'zod';
import { systemGoldens } from './system';
import { proofingGoldens } from './proofing';
import { teleprompterGoldens } from './teleprompter';
import { manuscriptGoldens } from './manuscript';
import { storyBibleGoldens } from './storyBible';
import { characterGoldens } from './character';
import { seriesGoldens } from './series';
import { projectGoldens } from './project';
import { creditsGoldens } from './credits';
import { assetsGoldens } from './assets';
import { settingsGoldens } from './settings';
import { updateGoldens } from './update';
import { chapterTracksGoldens } from './chapterTracks';
import { reaperActionsGoldens } from './reaperActions';
import { cleanupGoldens } from './cleanup';
import { reviewGoldens } from './review';
import { coverageGoldens } from './coverage';
import { editingGoldens } from './editing';
import { workspaceGoldens } from './workspace';
import { workspaceSnapGoldens } from './workspaceSnap';
import { previewGoldens } from './preview';
import { stagesGoldens } from './stages';
import { proofingRenderGoldens } from './proofingRender';
import { deliveryGoldens } from './delivery';
import { dawGoldens } from './daw';
import { providerGoldens } from './providers';
import { renderEncodeMasterGoldens } from './renderEncodeMaster';
import { masteringGoldens } from './mastering';
import { recordingGoldens } from './recording';
import { bookmarksGoldens } from './bookmarks';
import { passageMapGoldens } from './passageMap';
import { editLogGoldens } from './editLog';
import { marksGoldens } from './marks';
import { scriptPrepGoldens } from './scriptPrep';
import { extractionGoldens } from './extraction';
import { editCutsGoldens } from './editCuts';
import { wordFxGoldens } from './wordFx';
import { editStacksGoldens } from './editStacks';
import { productionGoldens } from './production';
import { pronunciationOnlineGoldens } from './pronunciationOnline';
import { pronunciationSourcesGoldens } from './pronunciationSources';
import { takeEvidenceGoldens } from './takeEvidence';

const FEATURE_AREAS: Array<Record<string, z.ZodType>> = [
  systemGoldens,
  proofingGoldens,
  teleprompterGoldens,
  manuscriptGoldens,
  storyBibleGoldens,
  characterGoldens,
  seriesGoldens,
  projectGoldens,
  creditsGoldens,
  assetsGoldens,
  settingsGoldens,
  updateGoldens,
  chapterTracksGoldens,
  reaperActionsGoldens,
  cleanupGoldens,
  reviewGoldens,
  coverageGoldens,
  editingGoldens,
  workspaceGoldens,
  workspaceSnapGoldens,
  previewGoldens,
  stagesGoldens,
  proofingRenderGoldens,
  deliveryGoldens,
  dawGoldens,
  providerGoldens,
  renderEncodeMasterGoldens,
  masteringGoldens,
  recordingGoldens,
  bookmarksGoldens,
  passageMapGoldens,
  editLogGoldens,
  marksGoldens,
  scriptPrepGoldens,
  extractionGoldens,
  editCutsGoldens,
  wordFxGoldens,
  editStacksGoldens,
  productionGoldens,
  pronunciationOnlineGoldens,
  pronunciationSourcesGoldens,
  takeEvidenceGoldens,
];

/** Which schema owns each golden file, over every feature area. */
export const GOLDEN: Record<string, z.ZodType> = {};
for (const rows of FEATURE_AREAS) {
  for (const [file, schema] of Object.entries(rows)) {
    if (Object.hasOwn(GOLDEN, file)) throw new Error(`${file} has a golden row in two feature areas`);
    GOLDEN[file] = schema;
  }
}
