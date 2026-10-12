// The built-in recorder's calls (ADR 0455): the engine chip (components/booth/useRecorder.ts) and the takes the recorder left.
import { row, startup, subscription } from './row';

export const recordingFeedback = {
  'src/components/booth/useRecorder.ts::recorderState#1': startup(
    "The engine chip's first reading of the project's recording engine; a failure leaves the chip on REAPER, the default, and the Booth reports the recorder's own error.",
  ),
  'src/components/booth/useRecorder.ts::subscribeRecorderState#1': subscription("The engine chip follows the project's recording engine."),
  'src/components/proof/NativeTakesPanel.tsx::recorderState#1': startup(
    "The panel's first read of the chapter's native takes; a failure leaves it unrendered until the next recording:state event (subscribeRecorderState) catches up.",
  ),
  'src/components/proof/NativeTakesPanel.tsx::subscribeRecorderState#1': subscription(
    'The chapter’s native takes, their line assignments and keeper marks, live.',
  ),
  'src/components/proof/NativeTakesPanel.tsx::recorderSetTakeLine#1': row(
    'click',
    'file-io',
    'pending',
    'pending',
    'ui',
    'inline',
    'yes',
    'ok',
    "Assign writes the take's line identity (SetTakeLine); the take moves under that line's heading, and a refusal shows inline.",
  ),
  'src/components/proof/NativeTakesPanel.tsx::recorderSetTakeKeeper#1': row(
    'click',
    'file-io',
    'pending',
    'pending',
    'ui',
    'inline',
    'yes',
    'ok',
    "Mark keeper / Keeper ✓ (undo) sets or clears the take's keeper mark, handing it over from any other take of the same line; a refusal shows inline.",
  ),
  'src/components/proof/NativeTakesPanel.tsx::mediaUrl#1': row(
    'click',
    'instant',
    'inline',
    'none',
    'ui',
    'inline',
    'no',
    'ok',
    "Play builds the take's media URL (a string, no host call); the button turns into Stop.",
  ),
};
