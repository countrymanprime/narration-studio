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
  'src/ports/daw.ts::findingsAddMarker#1': adapter('Forwards Add marker.'),
};
