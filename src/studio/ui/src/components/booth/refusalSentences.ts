// The Booth's own sentences that a narrator reads in a toast as plain messages or beside Retry or Check again, with the button each comes with, for the guard
// (`refusalSentences.test.ts`) and the layout check (`tests/visual/booth-refusals-two-lines.spec.ts`), for every recorder. The sentences are in `toastSentences.ts`,
// `recordCheck.ts` and `destination.ts`. Not listed: a sentence the DAW or the host words and the Booth shows as it came; `wrongProjectReason` (`dawNames.ts`, 122 characters for REAPER; the Booth
// toasts it only before the project's facts load or during a take, and the DAW tools menu shares it); and, for the app's own recorder, `stoppedInDaw` is 100 of 104 characters before the
// recorder's own reason (`why`), which opens it and is host-worded, so the real toast for Built-in nearly always scrolls.
import { DAW_KINDS, type DawCapabilities, type DawKind } from '../../api/contracts/daw';
import { noAnswerSentence, recorderName, recorderNameCapital } from '../../studio/dawNames';
import { createdSentence, destinationFor, LINK_GONE, TRACKS_UNREAD } from '../engine/destination';
import type { ToastButton } from '../primitives/toastBudget';
import { NOT_FOLLOWED_WHYS, recordCheck, type NotFollowedWhy } from './record/recordCheck';
import {
  backInDaw,
  CHECK_OFFER,
  heldInDawSentence,
  listeningFailedSentence,
  LISTENING_STILL_OPEN,
  LISTENING_STOP_FAILED,
  LOOKUP_FAILED,
  LOOKUP_SLOW,
  lostInDaw,
  NOT_KNOWN,
  ROLL_REFUSED,
  rollLandedSentence,
  rollTimeoutSentence,
  soloLeftSentence,
  START_GUARD_SENTENCE,
  stoppedInDaw,
  TAKE_UNFOLLOWED,
  unseenTakeNotStopped,
} from './toastSentences';

export type BoothToastSentence = { button: ToastButton; name: string; text: string };

const capabilitiesOf = (daw: DawKind): DawCapabilities => ({ daw, reachable: true, capabilities: { record: { level: 'supported', available: true } } });

/** What Record says when pressed while the DAW records elsewhere, for a recorder and a reason: a message with Check again. */
export const elsewhereRefusal = (daw: DawKind, why: NotFollowedWhy) =>
  recordCheck(capabilitiesOf(daw), { tracks: 'unread', message: '', elsewhere: true, notFollowed: why });

export const BOOTH_TOAST_SENTENCES: readonly BoothToastSentence[] = [
  // The app's own recorder (`Built-in`) never records "elsewhere": nothing else can start or end its take (`recordsInApp`), so the refusal is not said there and its longer name is not held to the budget.
  ...DAW_KINDS.filter((daw) => daw !== 'Built-in').flatMap((daw) =>
    NOT_FOLLOWED_WHYS.map((why) => ({
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
    { button: 'plain', name: `the recorder stopped answering during a take (${daw})`, text: lostInDaw(daw) },
  ]),
  // A take the DAW started is only followed, and the app's own recorder does not go quiet, so neither sentence is said for `Built-in`.
  ...DAW_KINDS.filter((daw) => daw !== 'Built-in').flatMap((daw): BoothToastSentence[] => [
    { button: 'plain', name: `the recorder answers again after a take it started (${daw})`, text: backInDaw(daw, true) },
    { button: 'plain', name: `the recorder answers again after a take this window ended (${daw})`, text: backInDaw(daw, false) },
  ]),
  // A track the narrator named after a chapter: held to the budget up to 26 characters; a longer name scrolls, which is the narrator's own text (`createdSentence`).
  ...(['REAPER', 'Audacity'] as const).flatMap((daw): BoothToastSentence[] => [
    { button: 'plain', name: `a track was made and linked (${daw}, a 26-character name)`, text: createdSentence({ track: { name: 'x'.repeat(26) } }, daw) },
    {
      button: 'plain',
      name: `a folder was made and linked (${daw}, a 26-character name)`,
      text: createdSentence({ track: { name: 'x'.repeat(26) }, voice: { guid: '{1}', name: 'Narrator', index: 1 } }, daw),
    },
  ]),
  { button: 'plain', name: 'a press inside the start guard is ignored', text: START_GUARD_SENTENCE },
  { button: 'plain', name: 'the DAW refused a roll and gave no words', text: ROLL_REFUSED },
  // Its own button is Check recordings, a longer label than Check again; the question is 40 characters, so the Check again budget stands for it.
  { button: 'checkAgain', name: 'the offer to check a take against the script', text: CHECK_OFFER },
  { button: 'plain', name: 'the tracks are still being read', text: TRACKS_UNREAD },
  { button: 'plain', name: 'the chapter’s track is gone from the project', text: LINK_GONE },
  ...DAW_KINDS.flatMap((daw): BoothToastSentence[] =>
    (['stop it', 'roll again', 'change the voice'] as const).map((what) => ({
      button: 'plain',
      name: `${what} in the recorder that started the take (${daw})`,
      text: heldInDawSentence(daw, what),
    })),
  ),
  // A voice key pressed where no voice is listed, for every layout and what the chapter is linked to (`unknown` and `unread` are `LINK_GONE` and `TRACKS_UNREAD` above).
  ...(['flat', 'folders'] as const).flatMap((layout) =>
    (['none', 'track', 'empty', 'marked'] as const).map((link): BoothToastSentence => ({
      button: 'plain',
      name: `a voice key with no voice listed (${layout}, ${link})`,
      text: destinationFor(layout).noVoiceKeys(link),
    })),
  ),
  // The reasons the listening gives are the host's (`heard.reason`): these are the longest it is known to say; a longer one makes the toast scroll, with all of it reachable.
  ...(['The microphone could not be opened', 'The speech model is not on this computer'] as const).flatMap((reason): BoothToastSentence[] => [
    { button: 'retry', name: `Record did not start: ${reason} (nothing kept)`, text: listeningFailedSentence(reason, false) },
    { button: 'retry', name: `Record did not start: ${reason} (take kept)`, text: listeningFailedSentence(reason, true) },
  ]),
  ...(['REAPER', 'Audacity'] as const).flatMap((daw): BoothToastSentence[] => [
    { button: 'plain', name: `a late take could not be stopped (${daw})`, text: unseenTakeNotStopped('late', noAnswerSentence(daw), daw) },
    { button: 'plain', name: `a take as the Booth was left could not be stopped (${daw})`, text: unseenTakeNotStopped('leaving', noAnswerSentence(daw), daw) },
    { button: 'plain', name: `the solo could not be taken off (${daw})`, text: soloLeftSentence(daw) },
  ]),
];
