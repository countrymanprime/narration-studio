import { createContext, useContext } from 'react';
import type { VoiceTracksLayout } from '../../api/contracts/voiceTracks';

/** The project's chapter layout for the track pickers under it: with folders of voices a chapter links to a folder, so a folder with no
 * audio of its own is a target, not a disabled row. */
export const VoiceLayoutContext = createContext<VoiceTracksLayout>('flat');

export function useVoiceLayout(): VoiceTracksLayout {
  return useContext(VoiceLayoutContext);
}
