// The DAW port's host adapter (ports/daw.ts, SN-D21). No page calls `usePort('daw')` yet, so these sites have no control of their own: each
// is the adapter forwarding to the binding, and the page that adopts the port adds its own row for the control and removes the old call's row.
import { row, startup } from './row';

const adapter = (what: string) =>
  row(
    'click',
    'file-io',
    'na',
    'na',
    'ui',
    'inline',
    'na',
    'exempt',
    `${what} The adapter only maps the binding's answer to a DawResult and rethrows a rejection; the page that adopts the port shows both.`,
  );

export const dawFeedback = {
  'src/ports/daw.ts::dawCapabilities#1': adapter('Forwards the capability read.'),
  'src/ports/daw.ts::dawProjectState#1': startup(
    'The adapter forwards the saved-versus-live project state read (DawProjectState) unchanged; it changes nothing, and the page that adopts the port shows its answer or failure.',
  ),
  'src/ports/daw.ts::readAloudRecordStart#1': adapter('Forwards Record to REAPER.'),
  'src/ports/daw.ts::readAloudRecordStartAt#1': adapter("Forwards Record from the narrator's punch."),
  'src/ports/daw.ts::readAloudRecordStop#1': adapter('Forwards Stop recording.'),
  'src/ports/daw.ts::workspaceUseTake#1': adapter('Forwards Use this take.'),
  'src/ports/daw.ts::workspaceHideTakes#1': adapter('Forwards Hide other takes; the binding already answers a DawResult.'),
  'src/ports/daw.ts::dawRoll#1': adapter('Forwards Roll; the binding already answers a DawResult.'),
  'src/ports/daw.ts::dawDeleteRange#1': adapter('Forwards Delete words and audio; the binding already answers a DawResult.'),
  'src/ports/daw.ts::dawTrimRange#1': adapter(
    "Forwards Clean up's Shorten a gap with the chapter, item id, times and fade only; the binding already answers a DawResult.",
  ),
  'src/ports/daw.ts::dawApplyFxToRange#1': adapter('Forwards Add effect to words; the binding already answers a DawResult.'),
  'src/ports/daw.ts::dawRemoveFxFromRange#1': adapter('Forwards Remove effect from words; the binding already answers a DawResult.'),
  'src/ports/daw.ts::dawFxRangeParams#1': adapter("Reads an effect's settings on words for the inspector; the binding already answers a DawResult with them."),
  'src/ports/daw.ts::dawSetFxRangeParam#1': adapter(
    'Forwards a changed effect setting with the words, chain and setting only; the binding already answers a DawResult.',
  ),
  'src/ports/daw.ts::dawBypassFxRange#1': adapter('Forwards Bypass with the words and chain only; the binding already answers a DawResult.'),
  'src/ports/daw.ts::dawStackTakes#1': adapter('Forwards Stack retries as takes with the passage ids only; the binding already answers a DawResult.'),
  'src/ports/daw.ts::dawBackupAround#1': adapter(
    'Forwards Back up the audio around the words with the chapter, tokens and label only; the binding already answers a DawResult.',
  ),
  'src/ports/daw.ts::dawRestoreBackup#1': adapter('Forwards Put back a backup with its id only; the binding already answers a DawResult.'),
  'src/ports/daw.ts::dawBackups#1': adapter("Reads the project's backups table for the Backups list."),
  'src/ports/daw.ts::dawSplitTake#1': adapter('Forwards Split into 2 takes with the chapter, take id and time only; the binding already answers a DawResult.'),
  'src/ports/daw.ts::dawReduceRangeGain#1': adapter(
    'Forwards Reduce by N dB with the chapter, take id, stretches and dB only; the binding already answers a DawResult.',
  ),
  'src/ports/daw.ts::dawRepairClick#1': adapter(
    'Forwards Repair the click with the chapter, take id and clicks only; the binding already answers a DawResult.',
  ),
  'src/ports/daw.ts::dawUnstackTakes#1': adapter('Forwards Un-stack the takes with the passage ids only; the binding already answers a DawResult.'),
  'src/ports/daw.ts::workspaceListFXChains#1': adapter("Reads the DAW's saved FX chains for the Add FX list; a refusal rejects for the page to show."),
  'src/ports/daw.ts::dawCapabilities#3': adapter("Reads the capability report beside the chain list, for the list's source label."),
  'src/ports/daw.ts::findingsAddMarker#1': adapter('Forwards Add marker.'),
  'src/ports/daw.ts::masterPlayQuietest#1': adapter(
    "Forwards Master & QC's Play the quietest 5 s with the file id only; the binding already answers a DawResult.",
  ),
  'src/ports/daw.ts::masterOpenInDaw#1': adapter("Forwards Master & QC's Open in the DAW with the file id only; the binding already answers a DawResult."),
  // The pickup marker methods (SN-D44): each reads the pickups capability first, refusing with its sentence, then starts one pickups run and
  // waits for that run's finished pickups:state.
  'src/ports/daw.ts::dawCapabilities#2': adapter(
    'Reads the pickups capability before a pickup marker call, so a DAW that does not answer is refused with its sentence.',
  ),
  'src/ports/daw.ts::pickupsState#1': adapter('Reads the run id before a pickup marker call, so the answer is the next run to finish.'),
  'src/ports/daw.ts::subscribePickups#1': adapter('Waits for the pickup run to finish and unsubscribes once it has.'),
  'src/ports/daw.ts::pickupsImport#1': adapter('Forwards adding pickup markers.'),
  'src/ports/daw.ts::pickupsResolve#1': adapter('Forwards marking a pickup done.'),
  'src/ports/daw.ts::pickupsReopen#1': adapter('Forwards marking a pickup open again.'),
  'src/ports/daw.ts::pickupsListMarkers#1': adapter('Forwards reading the pickup markers.'),
};
