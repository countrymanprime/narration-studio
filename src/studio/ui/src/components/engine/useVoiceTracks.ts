import { useCallback, useEffect, useRef, useState } from 'react';
import { describeApiError } from '../../api/errorMessage';
import type { GuideEntity } from '../../api/contracts/storyBible';
import type { VoiceTracksLayout, VoiceTracksState } from '../../api/contracts/voiceTracks';
import type { Notify } from '../primitives/Toast';
import { usePort } from '../../ports/usePort';
import { useVoiceSetup } from './voiceLayout';

/** The project's voice setup (shared app-wide by VoiceSetupProvider) and the Story Bible's characters, read when the Engine panel opens;
 * each change saves at once and a refusal is a toast (frontend-primitives rule 7). */
export function useVoiceTracks(notify: Notify) {
  const voiceTracks = usePort('voiceTracks');
  const storyBible = usePort('storyBible');
  const { setup, readError, replace } = useVoiceSetup();
  const [characters, setCharacters] = useState<GuideEntity[]>([]);

  useEffect(() => {
    if (readError) notify(describeApiError(readError), 'error');
  }, [readError, notify]);

  useEffect(() => {
    let active = true;
    void storyBible
      .guideEntities()
      .then((entities) => active && setCharacters(entities.filter((entity) => entity.category === 'Character')))
      .catch((reason) => active && notify(describeApiError(reason), 'error'));
    return () => {
      active = false;
    };
  }, [storyBible, notify]);

  // Each change shows at once, built on the last one even before the host answers, so two quick ticks keep both (qa-breaker B3). A host
  // answer is taken only for the latest save, so a slow answer to an older one never undoes a newer change (B4); a refusal re-reads.
  const sent = useRef(0);
  const save = useCallback(
    (change: (current: VoiceTracksState) => VoiceTracksState, call: () => Promise<VoiceTracksState>) => {
      replace(change(latest.current));
      const mine = ++sent.current;
      void call()
        .then((answer) => mine === sent.current && replace(answer))
        .catch((reason) => {
          notify(describeApiError(reason), 'error');
          if (mine === sent.current) void voiceTracks.voiceTracksGet().then(replace, (again: unknown) => notify(describeApiError(again), 'error'));
        });
    },
    [notify, replace, voiceTracks],
  );
  const latest = useRef(setup);
  latest.current = setup;

  return {
    setup,
    characters,
    setLayout: (layout: VoiceTracksLayout) =>
      save(
        (current) => ({ ...current, layout }),
        () => voiceTracks.voiceTracksSetLayout(layout),
      ),
    setTrackCharacters: (track: string, ids: string[]) =>
      save(
        (current) => withTrackCharacters(current, track, ids),
        () => voiceTracks.voiceTracksSetCharacters(track, ids),
      ),
    setNarratorCharacter: (id: string) =>
      save(
        (current) => ({ ...current, narratorCharacter: id }),
        () => voiceTracks.voiceTracksSetNarrator(id),
      ),
  };
}

/** The host's SetTrackCharacters rule (internal/voicetracks), applied before it answers: the name trimmed, a repeated id once, an empty
 * list clearing the assignment, tracks in name order. */
function withTrackCharacters(current: VoiceTracksState, track: string, ids: string[]): VoiceTracksState {
  const name = track.trim();
  const unique = [...new Set(ids)];
  const others = current.tracks.filter((entry) => entry.track !== name);
  const tracks = unique.length === 0 ? others : [...others, { track: name, characters: unique }];
  tracks.sort((a, b) => (a.track < b.track ? -1 : a.track > b.track ? 1 : 0));
  return { ...current, tracks };
}
