import { useCallback, useEffect, useRef, useState } from 'react';
import { describeApiError } from '../../api/errorMessage';
import type { GuideEntity } from '../../api/contracts/storyBible';
import type { VoiceTracksLayout, VoiceTracksState } from '../../api/contracts/voiceTracks';
import type { Notify } from '../primitives/Toast';
import { retryAction } from '../primitives/Toast';
import { usePort } from '../../ports/usePort';
import { useVoiceSetup } from './voiceLayout';

/** The project's voice setup (shared app-wide by VoiceSetupProvider) and the Story Bible's characters, read when the Engine panel opens;
 * each change saves at once and a refusal is a toast (frontend-primitives rule 7). */
export function useVoiceTracks(notify: Notify, { characters: wantCharacters = true }: { characters?: boolean } = {}) {
  const voiceTracks = usePort('voiceTracks');
  const storyBible = usePort('storyBible');
  const { setup, readError, replace, reload, beginSave } = useVoiceSetup();
  const [characters, setCharacters] = useState<GuideEntity[]>([]);

  useEffect(() => {
    // Reading the setup changes nothing, so Retry reads it again (issue #2919).
    if (readError) notify(describeApiError(readError), 'error', retryAction(reload));
  }, [readError, notify, reload]);

  // A failed read of the characters is an error toast with Retry, which reads them again (issue #2919).
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    // The Settings row needs only the layout, so it never reads the Story Bible (and never toasts one of its failures).
    if (!wantCharacters) return;
    let active = true;
    void storyBible
      .guideEntities()
      .then((entities) => active && setCharacters(entities.filter((entity) => entity.category === 'Character')))
      .catch(
        (reason) =>
          active &&
          notify(
            describeApiError(reason),
            'error',
            retryAction(() => setAttempt((n) => n + 1)),
          ),
      );
    return () => {
      active = false;
    };
  }, [storyBible, notify, wantCharacters, attempt]);

  // Each change shows at once, built on the last one even before the host answers, so two quick ticks keep both (qa-breaker B3). A host
  // answer is taken only for the newest save on this setup (the provider counts them across every place that saves, and a project switch
  // ends them all), so a slow answer to an older one never undoes a newer change (B4). A refusal re-reads; if that fails too, the value
  // from before the save comes back, so the screen never keeps a layout that was not saved.
  const save = useCallback(
    (change: (current: VoiceTracksState) => VoiceTracksState, call: () => Promise<VoiceTracksState>) => {
      const before = latest.current;
      const newest = beginSave();
      replace(change(before));
      void call()
        .then((answer) => newest() && replace(answer))
        .catch((reason) => {
          notify(describeApiError(reason), 'error');
          if (newest())
            void voiceTracks.voiceTracksGet().then(
              (fresh) => newest() && replace(fresh),
              (again: unknown) => {
                notify(describeApiError(again), 'error');
                if (newest()) replace(before);
              },
            );
        });
    },
    [notify, replace, beginSave, voiceTracks],
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
