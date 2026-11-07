import { useEffect, useState } from 'react';
import type { TeleprompterDevice, TeleprompterReaperInput } from '../../../api/contracts/teleprompter';
import { usePort } from '../../../ports/usePort';
import { resolveListeningMic, type InputSource, type ResolvedMic } from './listeningMic';

export type ListeningMic = ResolvedMic & {
  /** The microphones Record can be asked to use: the recorder's own list with the built-in recorder, the speech listener's otherwise; no blank names. */
  micNames: readonly string[];
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
  /** The app's own recorder records the take: the microphone named is then the one it will record on (`resolveListeningMic`). */
  appRecords?: boolean;
  /** Listens on the resolved microphone without saving it (`useTeleprompterSession`'s `listenOn`). */
  listenOn: (device: string | null) => void;
};

/**
 * The microphone the Booth listens to so the text follows the voice (`resolveListeningMic`). With a DAW, `TeleprompterReaperInput`
 * is asked when the chapter changes and when the window gets focus, and its input is listened on without being saved, so the DAW stays the source of truth.
 */
export function useListeningMic({ dawRecords, chapterId, chosen, source, settingsLoaded, devices, listenOn, appRecords = false }: Options): ListeningMic {
  const teleprompter = usePort('teleprompter');
  const recording = usePort('recording');
  const [recordsOn, setRecordsOn] = useState('');
  // The microphones the built-in recorder lists, the list the Levels select shows and the recorder opens from; null until they are read.
  const [recorderMics, setRecorderMics] = useState<readonly string[] | null>(null);
  const [input, setInput] = useState<TeleprompterReaperInput | null>(null);

  useEffect(() => {
    if (!dawRecords) {
      setInput(null);
      return;
    }
    let live = true;
    const ask = () =>
      void teleprompter
        .teleprompterReaperInput(chapterId)
        .then((answer) => live && setInput(answer))
        .catch(() => {});
    ask();
    // The narrator may change the input in the DAW and come back: the window's focus asks again.
    window.addEventListener('focus', ask);
    return () => {
      live = false;
      window.removeEventListener('focus', ask);
    };
  }, [teleprompter, dawRecords, chapterId]);

  // The microphone this project last recorded with in the built-in recorder: Record uses it when none is chosen, so the menu names it too.
  useEffect(() => {
    if (!appRecords) {
      setRecordsOn('');
      setRecorderMics(null);
      return;
    }
    let live = true;
    const read = () => {
      void recording
        .recorderState()
        .then((state) => live && setRecordsOn(state.device.trim()))
        // A read that fails is no remembered microphone: nothing is named on a guess, and Record asks for one.
        .catch(() => live && setRecordsOn(''));
      void recording
        .recorderDevices()
        .then((list) => live && setRecorderMics(list.devices.map((d) => d.name)))
        // A listing that fails is no microphones, the same as Levels shows it.
        .catch(() => live && setRecorderMics([]));
    };
    read();
    window.addEventListener('focus', read);
    return () => {
      live = false;
      window.removeEventListener('focus', read);
    };
  }, [recording, appRecords]);

  const answer = dawRecords ? input : null;
  // With the built-in recorder the microphones are the recorder's own, once read (what the select lists and what Record opens), else the speech listener's.
  const names = (appRecords && recorderMics ? recorderMics : devices.map((device) => device.name)).filter((name) => name.trim() !== '');
  const resolved = resolveListeningMic({ dawRecords, answer, source, chosen, devices: names, appRecords, recordsOn });
  const device = settingsLoaded ? resolved.device : null;
  useEffect(() => {
    listenOn(device);
  }, [device, listenOn]);

  return { ...resolved, micNames: names, note: answer ? answer.message : null, answer, overridden: dawRecords && source === 'chosen' };
}
