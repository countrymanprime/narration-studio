import { stopFailedSentence } from '../studio/dawNames';

/**
 * Asks the DAW to stop and says where to stop it when it refuses or cannot be asked: the one stop-and-say for every play path (Hear it, Pickups'
 * play original, a take's audition, the script's Play). `call` returns the DAW's refusal sentence, or null when it stopped; a call that throws is
 * said as "<DAW> was not asked to stop: <reason>. Stop it in <DAW>.". It never rejects.
 */
export async function stopAndSay(name: string, say: (text: string) => void, call: () => Promise<string | null>): Promise<void> {
  try {
    const refusal = await call();
    if (refusal !== null) say(stopFailedSentence(name, { refused: refusal }));
  } catch (error) {
    say(stopFailedSentence(name, { thrown: error }));
  }
}
