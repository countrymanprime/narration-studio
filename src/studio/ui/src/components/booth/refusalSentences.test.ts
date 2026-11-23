import { describe, expect, it } from 'vitest';
import { TOAST_CHAR_BUDGET } from '../primitives/toastBudget';
import { BOOTH_TOAST_SENTENCES, DAW_KINDS, elsewhereRefusal, NOT_FOLLOWED } from './refusalSentences';
import type { NotFollowedWhy } from './record/recordCheck';

// A message that is wider than two lines scrolls inside the toast (#4095). The Booth's own sentences that a narrator reads there are kept inside the budget of the
// buttons they come with (`toastBudget.ts`), so the reason and the fix are on screen without a scroll. `tests/visual/booth-refusals-two-lines.spec.ts` checks the
// budgets themselves against the real layout, and raises each of these sentences in the real toast.
//
// Not covered: a sentence the DAW or the host words (a capability's message, a refusal's reason, `describeApiError`, the app recorder's own reason that opens
// `stoppedInDaw`), because the Booth shows it as it came; and a sentence built from a name the narrator chose (a track, a voice).

describe('the Booth sentences that are read in a toast fit two lines (#4095)', () => {
  it.each(DAW_KINDS.filter((daw) => daw !== 'Built-in').flatMap((daw) => (Object.keys(NOT_FOLLOWED) as NotFollowedWhy[]).map((why) => [daw, why] as const)))(
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
});
