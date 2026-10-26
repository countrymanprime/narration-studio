import { useEffect, useState } from 'react';
import type { TeleprompterDevice, TeleprompterReaperInput } from '../../../api/contracts/teleprompter';
import { usePort } from '../../../ports/usePort';
import { resolveListeningMic, type InputSource, type ResolvedMic } from './listeningMic';

export type ListeningMic = ResolvedMic & {
  /** The host's sentence about the DAW's input: why it is used, or why the narrator picks. Null before the answer or with no DAW. */
  note: string | null;
  /** What the host said about the DAW's input; null before it arrives or with no DAW. */
  answer: TeleprompterReaperInput | null;
  /** The narrator chose a different microphone than the DAW's (`input_source: chosen`). */
  overridden: boolean;
};

type Options = {
  /** A DAW records the take (not the built-in recorder): only then is its input asked for. */
  dawRecords: boolean;
  /** The Booth's chapter, so the host also names its linked track's input channel. */
  chapterId: string;
  /** The narrator's saved microphone, `''` when none is chosen. */
  chosen: string;
  source: InputSource;
  /** True once the saved microphone has been read, so a saved choice is never raced. */
  settingsLoaded: boolean;
  devices: readonly TeleprompterDevice[];
  /** Listens on the resolved microphone without saving it (`useTeleprompterSession`'s `listenOn`). */
  listenOn: (device: string | null) => void;
};

/**
 * The microphone the Booth listens to so the text follows the voice (`resolveListeningMic`). With a DAW, `TeleprompterReaperInput`
 * is asked when the chapter changes, and its input is listened on without being saved, so the DAW stays the source of truth.
 */
export function useListeningMic({ dawRecords, chapterId, chosen, source, settingsLoaded, devices, listenOn }: Options): ListeningMic {
  const teleprompter = usePort('teleprompter');
  const [input, setInput] = useState<TeleprompterReaperInput | null>(null);

  useEffect(() => {
    if (!dawRecords) {
      setInput(null);
      return;
    }
    let live = true;
    void teleprompter
      .teleprompterReaperInput(chapterId)
      .then((answer) => live && setInput(answer))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [teleprompter, dawRecords, chapterId]);

  const answer = dawRecords ? input : null;
  const resolved = resolveListeningMic({ dawRecords, answer, source, chosen, devices: devices.map((device) => device.name) });
  const device = settingsLoaded ? resolved.device : null;
  useEffect(() => {
    listenOn(device);
  }, [device, listenOn]);

  return { ...resolved, note: answer ? answer.message : null, answer, overridden: dawRecords && source === 'chosen' };
}
