import type { BoothPunch } from '../../../api/contracts/voiceTracks';

type Port = { boothPunchTarget: (chapterId: string, paragraphId: string, fromWord: number, toWord: number) => Promise<BoothPunch> };

// One host call per phrase while its answer is out: opening the Booth at a line asks where it was recorded (to move the DAW there), and a press
// that starts a take from that line asks the same thing; the press joins the call that is out instead of making a second one. Keyed by port, so
// one that never answers cannot be joined by another page's test or window.
const out = new WeakMap<object, Map<string, Promise<BoothPunch>>>();

/** `boothPunchTarget`, joining the same call while it is out. A call that throws at once is a rejection. */
export function punchTargetOnce(port: Port, chapterId: string, paragraphId: string, fromWord: number, toWord: number): Promise<BoothPunch> {
  const calls = out.get(port) ?? new Map<string, Promise<BoothPunch>>();
  out.set(port, calls);
  const key = `${chapterId}|${paragraphId}|${fromWord}|${toWord}`;
  const joined = calls.get(key);
  if (joined) return joined;
  const asked: Promise<BoothPunch> = (async () => port.boothPunchTarget(chapterId, paragraphId, fromWord, toWord))().finally(() => {
    if (calls.get(key) === asked) calls.delete(key);
  });
  calls.set(key, asked);
  return asked;
}
