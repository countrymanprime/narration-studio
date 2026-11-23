// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { DawCapabilities } from '../../api/contracts/daw';
import { TOAST_CHAR_BUDGET, type ToastButton } from '../primitives/toastBudget';
import { LISTENING_STILL_OPEN, LISTENING_STOP_FAILED } from './listening/useStopFailedSentence';
import { rollLandedSentence, TAKE_UNFOLLOWED } from './page/useBoothPage';
import { recordCheck, type NotFollowedWhy } from './record/recordCheck';
import { LOOKUP_FAILED, LOOKUP_SLOW, NOT_KNOWN } from './roll/useRoll';

// A message that is wider than two lines scrolls inside the toast (#4095). The Booth's own sentences that a narrator reads there are kept inside the budget of the
// buttons they come with (`toastBudget.ts`), so the reason and the fix are on screen without a scroll. `tests/visual/booth-refusals-two-lines.spec.ts` checks the
// budgets themselves against the real layout.
//
// Not covered: a sentence the DAW or the host words (a capability's message, a refusal's reason, `describeApiError`), because the Booth shows it as it came; and
// a sentence built from a name the narrator chose (a track, a voice).

const capabilities = (daw: 'reaper' | 'audacity') => ({ daw, capabilities: { record: { available: true } } }) as unknown as DawCapabilities;
const NOT_FOLLOWED: NotFollowedWhy[] = ['other_track', 'several_tracks', 'no_track_armed', 'no_project', 'unread'];

/** What the narrator is told when Record is pressed while the DAW records a take this app did not start, for every reason and each recorder: a message with Check again. */
const elsewhere = (daw: 'reaper' | 'audacity') =>
  NOT_FOLLOWED.map((why) => recordCheck(capabilities(daw), { tracks: 'unread', message: '', elsewhere: true, notFollowed: why })?.reason ?? '');

const SENTENCES: ReadonlyArray<{ button: ToastButton; name: string; text: string }> = [
  ...(['reaper', 'audacity'] as const).flatMap((daw) =>
    elsewhere(daw).map((text, index) => ({ button: 'checkAgain' as const, name: `recording elsewhere, ${daw}, ${NOT_FOLLOWED[index]}`, text })),
  ),
  { button: 'retry', name: 'the listening did not stop (Retry)', text: LISTENING_STOP_FAILED },
  { button: 'plain', name: 'the listening may still be open', text: LISTENING_STILL_OPEN },
  { button: 'plain', name: 'the take lost the text', text: TAKE_UNFOLLOWED },
  { button: 'plain', name: 'a late roll landed (REAPER)', text: rollLandedSentence('REAPER', 'REAPER') },
  { button: 'plain', name: 'a late roll landed (Audacity)', text: rollLandedSentence('Audacity', 'Audacity') },
  { button: 'plain', name: 'where the passage was recorded is not known', text: NOT_KNOWN },
  { button: 'plain', name: 'where the passage was recorded could not be read', text: LOOKUP_FAILED },
  { button: 'plain', name: 'where the passage was recorded came back too late', text: LOOKUP_SLOW },
];

describe('the Booth sentences that are read in a toast fit two lines (#4095)', () => {
  it('has a sentence for every reason Record can be refused while the DAW records elsewhere', () => {
    for (const daw of ['reaper', 'audacity'] as const) for (const text of elsewhere(daw)) expect(text).not.toBe('');
  });

  it.each(SENTENCES.map((entry) => [entry.name, entry] as const))('%s', (_name, { button, text }) => {
    expect(text.length, `"${text}" is ${text.length} characters; a toast with ${button} holds ${TOAST_CHAR_BUDGET[button]}`).toBeLessThanOrEqual(
      TOAST_CHAR_BUDGET[button],
    );
  });
});
