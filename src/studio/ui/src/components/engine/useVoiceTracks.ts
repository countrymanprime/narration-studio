import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { describeApiError } from '../../api/errorMessage';
import type { GuideEntity } from '../../api/contracts/storyBible';
import type { VoiceTracksLayout, VoiceTracksState } from '../../api/contracts/voiceTracks';
import type { Notify } from '../primitives/Toast';

const FLAT: VoiceTracksState = { layout: 'flat', narratorCharacter: '', tracks: [] };

/** The project's voice setup and the Story Bible's characters, read when the Engine panel opens; each change saves at once and a refusal
 * is a toast (frontend-primitives rule 7). */
export function useVoiceTracks(notify: Notify) {
  const api = useApi();
  const [setup, setSetup] = useState<VoiceTracksState>(FLAT);
  const [characters, setCharacters] = useState<GuideEntity[]>([]);

  useEffect(() => {
    let active = true;
    void api
      .voiceTracksGet()
      .then((next) => active && setSetup(next))
      .catch((reason) => active && notify(describeApiError(reason), 'error'));
    void api
      .guideEntities()
      .then((entities) => active && setCharacters(entities.filter((entity) => entity.category === 'Character')))
      .catch(() => active && setCharacters([]));
    return () => {
      active = false;
    };
  }, [api, notify]);

  const save = useCallback(
    (change: Promise<VoiceTracksState>) => void change.then(setSetup).catch((reason) => notify(describeApiError(reason), 'error')),
    [notify],
  );

  return {
    setup,
    characters,
    setLayout: (layout: VoiceTracksLayout) => save(api.voiceTracksSetLayout(layout)),
    setTrackCharacters: (track: string, ids: string[]) => save(api.voiceTracksSetCharacters(track, ids)),
    setNarratorCharacter: (id: string) => save(api.voiceTracksSetNarrator(id)),
  };
}
