import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { VoiceTracksLayout, VoiceTracksState } from '../../api/contracts/voiceTracks';
import { usePort } from '../../ports/usePort';

const FLAT: VoiceTracksState = { layout: 'flat', narratorCharacter: '', narratorGuids: [], tracks: [] };

type VoiceSetup = {
  setup: VoiceTracksState;
  /** Why the last read failed, '' when it did not; the Voices card shows it. */
  readError: unknown;
  /** Takes the state a save answered with, so every picker sees the new layout at once. */
  replace: (next: VoiceTracksState) => void;
  /** Reads the setup again, for the Retry of a failed read. */
  reload: () => void;
  /**
   * Starts a save and answers whether it is still the newest one for this project when the host replies: a save made anywhere else on the
   * same setup, or a switch of project, makes it stale, so a slow answer never undoes a newer change or lands in another project.
   */
  beginSave: () => () => boolean;
};

const VoiceSetupContext = createContext<VoiceSetup>({
  setup: FLAT,
  readError: '',
  replace: () => {},
  reload: () => {},
  beginSave: () => () => true,
});

/** An override of the project's layout for the pickers under it: the Engine panel of an Audacity project, which has no folders, is flat. */
export const VoiceLayoutContext = createContext<VoiceTracksLayout | null>(null);

/**
 * The project's voice setup (docs/prds/booth-voice-tracks.prd.md), read once per open project for the whole app: every track picker,
 * on the Engine panel or in a link dialog on Production, Editing or the Booth, offers a folder with no audio of its own as a chapter's
 * target when the layout is Voice folders. Until the read answers, or when it fails, the project is flat.
 */
export function VoiceSetupProvider({ projectFolder, children }: { projectFolder: string; children: ReactNode }) {
  const port = usePort('voiceTracks');
  const [setup, setSetup] = useState<VoiceTracksState>(FLAT);
  const [readError, setReadError] = useState<unknown>('');
  const [attempt, setAttempt] = useState(0);
  const saves = useRef(0);
  useEffect(() => {
    let active = true;
    saves.current += 1;
    setSetup(FLAT);
    setReadError('');
    if (!projectFolder) return;
    port
      .voiceTracksGet()
      .then((next) => active && setSetup(next))
      .catch((reason: unknown) => active && setReadError(reason));
    return () => {
      active = false;
    };
  }, [port, projectFolder, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const replace = useCallback((next: VoiceTracksState) => setSetup(next), []);
  const beginSave = useCallback(() => {
    const mine = ++saves.current;
    return () => mine === saves.current;
  }, []);
  const value = useMemo(() => ({ setup, readError, replace, reload, beginSave }), [setup, readError, replace, reload, beginSave]);
  return <VoiceSetupContext.Provider value={value}>{children}</VoiceSetupContext.Provider>;
}

export function useVoiceSetup(): VoiceSetup {
  return useContext(VoiceSetupContext);
}

/** The layout the track pickers here follow: an override from the Engine panel, else the project's. */
export function useVoiceLayout(): VoiceTracksLayout {
  const override = useContext(VoiceLayoutContext);
  const { setup } = useContext(VoiceSetupContext);
  return override ?? setup.layout;
}
