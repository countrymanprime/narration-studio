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
  'src/ports/daw.ts::readAloudRecordStop#1': adapter('Forwards Stop recording.'),
  'src/ports/daw.ts::workspaceUseTake#1': adapter('Forwards Use this take.'),
  'src/ports/daw.ts::workspaceHideTakes#1': adapter('Forwards Hide other takes; the binding already answers a DawResult.'),
  'src/ports/daw.ts::findingsAddMarker#1': adapter('Forwards Add marker.'),
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
