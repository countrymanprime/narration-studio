// The interaction feedback rows for the Pickups call sites (see interactionFeedback.catalog.ts for what a row says): the
// Studio Next Pickups page and the pickups state the Booth companion's Pickups section and Proof's proofer sheet read.
import { type FeedbackRow, row, subscription } from './row';

// prettier-ignore
export const pickupsFeedback: Record<string, FeedbackRow> = {
  'src/components/pickups/usePickupsState.ts::pickupsState#1': row('mount', 'instant', 'na', 'na', 'ui', 'silent', 'na', 'exempt', 'Hydrates whatever run was already in flight when the page or the Booth companion opened; the live event follows anyway.'),
  'src/components/pickups/usePickupsState.ts::subscribePickups#1': subscription('The pickups state event, shared by every import, export, next, resolve and count run the Pickups page starts; the Booth companion only reads it.'),
  'src/components/pickups/usePickupsState.ts::pickupsCount#1': row(
    'mount',
    'job',
    'na',
    'na',
    'ui',
    'silent',
    'na',
    'exempt',
    'An automatic refresh right after the hydrate above settles, so the remaining count is current without an extra press; a failure here just leaves the count at whatever the hydrate answered, and the narrator can still import or export the proofer sheet on Proof, each of which shows its own failure.',
  ),
  // The Studio Next Pickups page (SNQ-9): the host's merged list, and every change answering the whole list.
  'src/components/pickups/PickupsPage.tsx::manuscriptChapters#1': row('mount', 'file-io', 'na', 'na', 'ui', 'toast', 'na', 'ok', 'Read with the list on opening for the chapter stepper and the group rows; a failure is on the page with the list (Check again).'),
  'src/components/pickups/PickupsPage.tsx::pickupsList#1': row('mount', 'file-io', 'na', 'na', 'ui', 'toast', 'na', 'ok', 'Read with the chapters on opening, on focus and every few seconds while it could not be read, which is what reconciles the list with the DAW\'s markers; a failure is on the page: its reason and Retry, or, over a list already shown, "can\'t tell if this list is current" with when it was read.'),
  'src/components/pickups/PickupsPage.tsx::pickupsList#4': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'na', 'ok', 'Read again after adding markers, so the lines show their markers; a failure is the marker action\'s toast.'),
  'src/components/pickups/PickupsPage.tsx::pickupsAdd#1': row('click', 'file-io', 'pending', 'pending', 'ui', 'toast', 'no', 'ok', 'Add a pickup by hand: the popover\'s Add is pending until the host answers the list; a refusal (an empty line, a time outside the chapter) is a toast in the host\'s words.'),
  'src/components/pickups/PickupsPage.tsx::pickupsAdd#2': row('click', 'file-io', 'none', 'none', 'toast', 'toast', 'yes', 'ok', 'Undo of removing a line added by hand adds it again; a refusal is a toast.'),
  'src/components/pickups/PickupsPage.tsx::pickupsRemove#1': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'no', 'ok', 'The row leaves the list when the host answers; a line added by hand offers Undo, a refusal is a toast.'),
  'src/components/pickups/PickupsPage.tsx::findingsGet#1': row('click', 'file-io', 'none', 'none', 'toast', 'toast', 'yes', 'ok', 'Fine, not a pickup reads the line\'s note for its evidence version and decision; a failure is the host\'s sentence in an error toast and nothing changes.'),
  'src/components/pickups/PickupsPage.tsx::pickupsRemove#2': row('click', 'file-io', 'none', 'none', 'toast', 'toast', 'yes', 'ok', 'A check\'s gap whose note was marked fine as read is also taken off the list (the check would list it again); a failure is an error toast after the note was changed, and Reopen on Proof puts the note back.'),
  'src/components/pickups/PickupsPage.tsx::pickupsList#2': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'no', 'ok', 'Read again after a note was marked fine as read, so its line leaves the list; a failure is an error toast and the list on screen stays.'),
  'src/components/pickups/PickupsPage.tsx::pickupsList#3': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'no', 'ok', 'Read again after Undo of Fine, not a pickup, so the note\'s line comes back; a failure is the Undo toast\'s own failure.'),
  'src/components/pickups/PickupsPage.tsx::pickupsSetIncluded#1': row('input', 'file-io', 'none', 'none', 'ui', 'toast', 'no', 'ok', 'The checkbox and the session panel follow the host\'s answer; a refusal is a toast and the box keeps the stored state.'),
  'src/components/pickups/PickupsPage.tsx::pickupsSetDone#1': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'no', 'ok', 'Mark recorded or open again goes through the DAW marker when the DAW holds it; a refusal is a toast in the DAW\'s words.'),
  'src/components/pickups/list/usePlayOriginal.ts::chapterTrackMapList#1': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'na', 'ok', 'Hear the original reads which track holds the chapter before it plays; a failed read is the same refusal toast as a missing source.'),
  'src/components/pickups/list/usePlayOriginal.ts::tracksList#1': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'na', 'ok', 'Read with the chapter-to-track map to find the source file and the second the app plays; a failure leaves only the DAW to play it, and when it cannot either, a refusal toast says why.'),
  'src/components/pickups/list/usePlayOriginal.ts::dawTransportSync#1': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'no', 'ok', 'Stops the DAW play this list started: a second press, the end of the 6 s stretch, or leaving the page; a refusal in the DAW\'s words or a failed ask is a toast.'),
  'src/components/pickups/list/usePlayOriginal.ts::dawTransportSync#2': row('click', 'file-io', 'none', 'none', 'ui', 'toast', 'no', 'ok', 'Hear the original plays the DAW from 3 s before the line when its transport is ready (playback/providers.ts); a refusal or failed ask hands the line to the app with a toast saying why, and while the DAW records nothing plays.'),
};
