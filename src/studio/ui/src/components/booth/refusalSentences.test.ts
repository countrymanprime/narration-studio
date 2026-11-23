import { describe, expect, it } from 'vitest';
import { TOAST_CHAR_BUDGET } from '../primitives/toastBudget';
import { DAW_KINDS } from '../../api/contracts/daw';
import { createdSentence } from '../engine/destination';
import { BOOTH_TOAST_SENTENCES, elsewhereRefusal } from './refusalSentences';
import { NOT_FOLLOWED_WHYS } from './record/recordCheck';
import { backInDaw, unseenTakeNotStopped } from './toastSentences';

// A message that is wider than two lines scrolls inside the toast (#4095). The Booth's own sentences that a narrator reads there are kept inside the budget of the
// buttons they come with (`toastBudget.ts`), so the reason and the fix are on screen without a scroll. `tests/visual/booth-refusals-two-lines.spec.ts` checks the
// budgets themselves against the real layout, and raises each of these sentences in the real toast.
//
// Not covered: a sentence the DAW or the host words (a capability's message, a refusal's reason, `describeApiError`, the app recorder's own reason that opens
// `stoppedInDaw`), because the Booth shows it as it came; `wrongProjectReason` (see `refusalSentences.ts`); and a name the narrator chose beyond 26 characters (a track named
// after a chapter: shorter ones are covered).

describe('the Booth sentences that are read in a toast fit two lines (#4095)', () => {
  it.each(DAW_KINDS.filter((daw) => daw !== 'Built-in').flatMap((daw) => NOT_FOLLOWED_WHYS.map((why) => [daw, why] as const)))(
    'Record refused while %s records elsewhere (%s) says so, in the recording_elsewhere refusal',
    (daw, why) => {
      const refusal = elsewhereRefusal(daw, why);
      expect(refusal?.code).toBe('recording_elsewhere');
      expect(refusal?.reason).toMatch(/already recording/);
    },
  );

  it.each(BOOTH_TOAST_SENTENCES.map((entry) => [entry.name, entry] as const))('%s', (_name, { button, text }) => {
    expect(text, 'a sentence that is not there').not.toBe('');
    expect(text.length, `"${text}" is ${text.length} characters; a toast with ${button} holds ${TOAST_CHAR_BUDGET[button]}`).toBeLessThanOrEqual(
      TOAST_CHAR_BUDGET[button],
    );
  });

  it('names the recorder in the next step of every sentence that sends the narrator to it', () => {
    for (const daw of ['REAPER', 'Audacity'] as const) {
      const sentences = [
        createdSentence({ track: { name: 'Opening' } }, daw),
        backInDaw(daw, true),
        backInDaw(daw, false),
        unseenTakeNotStopped('late', 'It failed.', daw),
      ];
      for (const text of sentences) expect(text.split('. ').slice(1).join('. '), text).toContain(daw);
    }
  });
});
