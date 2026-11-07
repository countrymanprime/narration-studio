import type { TeleprompterReaperInput } from '../../../api/contracts/teleprompter';

/** `Teleprompter.input_source`: `daw` (the default) listens on the linked DAW's own input; `chosen` on `input_device` even then. */
export type InputSource = 'daw' | 'chosen';

/**
 * Where the microphone the Booth listens on came from:
 * - `daw`: the linked DAW's input (a sure match, or the candidate the narrator picked when the DAW's input fit several);
 * - `uncertain`: the DAW's input fits several microphones and none is picked yet; `device` is the first of them meanwhile;
 * - `chosen`: the narrator's own choice (`input_device`);
 * - `last`: the built-in recorder records, nothing is chosen, and the project last recorded with this one;
 * - `first`: nothing chosen and no DAW answer to follow, so the first microphone listed (with the built-in recorder: the only one listed);
 * - `none`: no microphone is listed.
 */
type MicOrigin = 'daw' | 'uncertain' | 'chosen' | 'last' | 'first' | 'none';

export type ResolvedMic = {
  device: string;
  origin: MicOrigin;
  /** The DAW's input fits these listed microphones equally well (`uncertain`, and `daw` after a pick): a one-click choice among them. */
  candidates: string[];
  /** What the DAW records from, for a read-only line: its device and, when it named one, the linked track's channel. */
  dawInput: string | null;
};

type Inputs = {
  /** A DAW records the take (not the built-in recorder). */
  dawRecords: boolean;
  /** The host's answer about the DAW's input; null before it arrives or with no DAW. */
  answer: TeleprompterReaperInput | null;
  source: InputSource;
  /** `input_device`, `''` when never chosen. */
  chosen: string;
  /** The microphones the Booth can open, in the order the system lists them. */
  devices: readonly string[];
  /** The app's own recorder records the take (not a DAW): it records on the choice, else `recordsOn`, else the only microphone, and refuses a guess. */
  appRecords?: boolean;
  /** The microphone this project last recorded with in the built-in recorder; `''` when none. */
  recordsOn?: string;
};

/** "Focusrite USB ASIO · Mic/Line 1": what the DAW records from, or null when it named no device. */
export function dawInputLabel(answer: TeleprompterReaperInput | null): string | null {
  if (!answer?.reaperDevice) return null;
  return answer.inputChannel ? `${answer.reaperDevice} · ${answer.inputChannel}` : answer.reaperDevice;
}

/**
 * The one microphone the Booth listens on, for every listener (the text following the voice, a cold read, the level meter, room
 * tone). With a DAW linked its own input wins unless the narrator chose a different one (`source: chosen`); a saved `input_device`
 * alone never outranks it, since one saved before `input_source` existed cannot be told from an automatic one. With no DAW to
 * follow, the narrator's choice, else the first microphone listed: listening never waits on a trip to Settings. With the built-in recorder
 * the microphone is the one Record will use, so it is never a first-listed guess among several (#2810).
 */
export function resolveListeningMic({ dawRecords, answer, source, chosen, devices, appRecords = false, recordsOn = '' }: Inputs): ResolvedMic {
  // A name of only spaces is no name: it is not a choice, and is never listed.
  if (chosen.trim() === '') chosen = '';
  const listed = (name: string) => devices.includes(name);
  const dawInput = dawRecords ? dawInputLabel(answer) : null;
  if (dawRecords && source !== 'chosen' && answer) {
    if (answer.status === 'matched' && answer.device && listed(answer.device)) {
      return { device: answer.device, origin: 'daw', candidates: [], dawInput };
    }
    const candidates = answer.status === 'uncertain' ? answer.candidates.filter(listed) : [];
    if (candidates.length > 0) {
      return candidates.includes(chosen)
        ? { device: chosen, origin: 'daw', candidates, dawInput }
        : { device: candidates[0]!, origin: 'uncertain', candidates, dawInput };
    }
  }
  if (chosen !== '') return { device: chosen, origin: 'chosen', candidates: [], dawInput };
  if (appRecords) {
    // The host's own order for the take (`builtinMicrophone`): the choice, the project's last, the only one listed, never a guess among several.
    // A remembered microphone that is no longer listed is not one Record can use: it is not named, so nothing starts on it.
    if (recordsOn !== '' && listed(recordsOn)) return { device: recordsOn, origin: 'last', candidates: [], dawInput };
    if (devices.length === 1) return { device: devices[0]!, origin: 'first', candidates: [], dawInput };
    return { device: '', origin: 'none', candidates: [], dawInput };
  }
  if (devices.length > 0) return { device: devices[0]!, origin: 'first', candidates: [], dawInput };
  return { device: '', origin: 'none', candidates: [], dawInput };
}
