import { PLAY_DEADLINE_MS } from '../components/engine/ShowInDaw';
import { noAnswerSentence, stopFailedSentence } from '../studio/dawNames';
import { within } from '../within';

/**
 * Asks the DAW to stop and says where to stop it when it refuses, cannot be asked or does not answer: the one stop-and-say for every play path (Hear it,
 * Pickups' play original, a take's audition, the script's Play). `call` returns the DAW's refusal sentence, or null when it stopped; a call that throws is
 * said as "<DAW> was not asked to stop: <reason>. Stop it in <DAW>."; one that has not answered after `PLAY_DEADLINE_MS` frees the button and says
 * "<DAW> did not answer in time. Stop it in <DAW>." (a stop that lands later only stops, so the limit need not outlast the host's wait). It never rejects.
 */
export async function stopAndSay(name: string, say: (text: string) => void, call: () => Promise<string | null>): Promise<void> {
  try {
    const answered = await within(call(), PLAY_DEADLINE_MS);
    if (answered === null) say(stopFailedSentence(name, { refused: noAnswerSentence(name) }));
    else if (answered.value !== null) say(stopFailedSentence(name, { refused: answered.value }));
  } catch (error) {
    say(stopFailedSentence(name, { thrown: error }));
  }
}
