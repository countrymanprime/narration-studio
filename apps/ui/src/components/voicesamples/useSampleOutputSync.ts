import { useEffect } from 'react';
import { usePort } from '../../ports/usePort';
import { setSampleOutput } from './samplePlayerStore';

/**
 * Tells the shared player where this project's samples play (the Settings row "Voice sample output"): the project's choice with the built-in
 * recorder, the system default with a DAW, which keeps its own audio device. Read when a page opens; Settings sets it itself when it changes. A
 * read that fails leaves the system default, which is where a sample plays anyway.
 */
export function useSampleOutputSync(): void {
  const system = usePort('system');
  const recording = usePort('recording');
  useEffect(() => {
    let live = true;
    Promise.all([system.settingsForScope('project'), recording.recorderState()]).then(
      ([fields, state]) => {
        if (!live) return;
        const field = fields.VoiceSamples?.find((f) => f.key === 'output_device');
        setSampleOutput(state.engine === 'builtin' ? (field?.effectiveValue ?? '') : '');
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [system, recording]);
}
