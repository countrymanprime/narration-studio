// Every Booth sentence a narrator reads in a toast, with the button it comes with, for the guard (`refusalSentences.test.ts`) and the layout check
// (`tests/visual/booth-refusals-two-lines.spec.ts`). The sentences are in `toastSentences.ts` and `recordCheck.ts`; this lists them for every recorder.
import type { DawCapabilities, DawKind } from '../../api/contracts/daw';
import { recorderName, recorderNameCapital } from '../../studio/dawNames';
import { createdSentence } from '../engine/destination';
import type { ToastButton } from '../primitives/toastBudget';
import { recordCheck, type NotFollowedWhy } from './record/recordCheck';
import {
  backInDaw,
  LISTENING_STILL_OPEN,
  LISTENING_STOP_FAILED,
  LOOKUP_FAILED,
  LOOKUP_SLOW,
  lostInDaw,
  NOT_KNOWN,
  rollLandedSentence,
  rollTimeoutSentence,
  stoppedInDaw,
  TAKE_UNFOLLOWED,
} from './toastSentences';

export type BoothToastSentence = { button: ToastButton; name: string; text: string };

export const DAW_KINDS: readonly DawKind[] = ['REAPER', 'Audacity', 'Built-in', 'none'];

/** Every reason Record is refused while the DAW records a take this app did not start: a `Record` so a new reason is a type error here until it has its entry. */
export const NOT_FOLLOWED: Record<NotFollowedWhy, true> = { other_track: true, several_tracks: true, no_track_armed: true, no_project: true, unread: true };

const capabilitiesOf = (daw: DawKind): DawCapabilities => ({ daw, reachable: true, capabilities: { record: { level: 'supported', available: true } } });

/** What Record says when pressed while the DAW records elsewhere, for a recorder and a reason: a message with Check again. */
export const elsewhereRefusal = (daw: DawKind, why: NotFollowedWhy) =>
  recordCheck(capabilitiesOf(daw), { tracks: 'unread', message: '', elsewhere: true, notFollowed: why });

export const BOOTH_TOAST_SENTENCES: readonly BoothToastSentence[] = [
  // The app's own recorder (`Built-in`) never records "elsewhere": nothing else can start or end its take (`recordsInApp`), so the refusal is not said there and its longer name is not held to the budget.
  ...DAW_KINDS.filter((daw) => daw !== 'Built-in').flatMap((daw) =>
    (Object.keys(NOT_FOLLOWED) as NotFollowedWhy[]).map((why) => ({
      button: 'checkAgain' as const,
      name: `recording elsewhere, ${daw}, ${why}`,
      text: elsewhereRefusal(daw, why)?.reason ?? '',
    })),
  ),
  { button: 'retry', name: 'the listening did not stop (Retry)', text: LISTENING_STOP_FAILED },
  { button: 'plain', name: 'the listening may still be open', text: LISTENING_STILL_OPEN },
  { button: 'plain', name: 'the take lost the text', text: TAKE_UNFOLLOWED },
  { button: 'plain', name: 'where the passage was recorded is not known', text: NOT_KNOWN },
  { button: 'plain', name: 'where the passage was recorded could not be read', text: LOOKUP_FAILED },
  { button: 'plain', name: 'where the passage was recorded did not come back in time', text: LOOKUP_SLOW },
  ...DAW_KINDS.flatMap((daw): BoothToastSentence[] => [
    { button: 'plain', name: `a late roll landed (${daw})`, text: rollLandedSentence(recorderName(daw)) },
    { button: 'plain', name: `the roll got no answer (${daw})`, text: rollTimeoutSentence(recorderNameCapital(daw)) },
    { button: 'plain', name: `the take ended in the recorder (${daw})`, text: stoppedInDaw(daw) },
    { button: 'plain', name: `the recorder answers again after a take it ended (${daw})`, text: backInDaw(daw, false) },
    { button: 'plain', name: `the recorder stopped answering during a take (${daw})`, text: lostInDaw(daw) },
  ]),
  // A take the DAW started is only followed, so the app's own recorder never has one: the sentence for it is not said there.
  ...DAW_KINDS.filter((daw) => daw !== 'Built-in').map((daw): BoothToastSentence => ({
    button: 'plain',
    name: `the recorder answers again after a take it started (${daw})`,
    text: backInDaw(daw, true),
  })),
  // A track the narrator named after a chapter: held to the budget up to 36 characters; a longer name scrolls, which is the narrator's own text (`createdSentence`).
  ...(['REAPER', 'Audacity'] as const).flatMap((daw): BoothToastSentence[] => [
    { button: 'plain', name: `a track was made and linked (${daw}, a 36-character name)`, text: createdSentence({ track: { name: 'x'.repeat(36) } }, daw) },
    {
      button: 'plain',
      name: `a folder was made and linked (${daw}, a 36-character name)`,
      text: createdSentence({ track: { name: 'x'.repeat(36) }, voice: { guid: '{1}', name: 'Narrator', index: 1 } }, daw),
    },
  ]),
];
