import { useEffect, useState } from 'react';
import type { TeleprompterDevice, TeleprompterReaperInput } from '../../../api/contracts/teleprompter';
import { usePort } from '../../../ports/usePort';

export type ListeningMic = {
  /** The microphone the Booth listens to is the one the DAW records from (a sure match, ADR 0250). */
  fromDaw: boolean;
  /** The host's sentence about the DAW's input: why it was picked, or why the narrator picks it. Null before the answer. */
  note: string | null;
};

type Options = {
  /** A DAW records the take (not the built-in recorder): only then is its input asked for. */
  dawRecords: boolean;
  /** The session's microphone, `''` when none is chosen. */
  device: string;
  /** True once the saved microphone has been read, so a saved choice is never raced. */
  settingsLoaded: boolean;
  devices: readonly TeleprompterDevice[];
  /** Chooses the session's microphone (and saves it, as a choice in Levels does). */
  choose: (device: string) => void;
};

/**
 * The microphone the Booth listens to so the text follows the voice. With a DAW, `TeleprompterReaperInput` is asked once: on a
 * sure match its device is chosen when the narrator has chosen none (ADR 0250: a match only preselects, never replaces a choice);
 * any other answer leaves the choice to the narrator in Levels, with the host's sentence saying why.
 */
export function useListeningMic({ dawRecords, device, settingsLoaded, devices, choose }: Options): ListeningMic {
  const teleprompter = usePort('teleprompter');
  const [input, setInput] = useState<TeleprompterReaperInput | null>(null);

  useEffect(() => {
    if (!dawRecords) return;
    let live = true;
    void teleprompter
      .teleprompterReaperInput()
      .then((answer) => live && setInput(answer))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [teleprompter, dawRecords]);

  const matched = dawRecords && input?.status === 'matched' ? input.device : undefined;
  const listed = !!matched && devices.some((item) => item.name === matched);
  useEffect(() => {
    if (settingsLoaded && device === '' && matched && listed) choose(matched);
  }, [settingsLoaded, device, matched, listed, choose]);

  return { fromDaw: !!matched && matched === device, note: dawRecords && input ? input.message : null };
}
