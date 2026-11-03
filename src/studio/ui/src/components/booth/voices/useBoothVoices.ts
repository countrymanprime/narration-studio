import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import type { Track } from '../../../api/contracts/tracks';
import { describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { useVoiceSetup } from '../../engine/voiceLayout';
import { folderVoices, type Voice } from '../../engine/voices';

/** What the Booth says when a voice key is pressed in a chapter that records on one track. */
export const FLAT_VOICE_KEYS =
  'This chapter records on one track. Voice keys choose a voice for a chapter linked to a folder of voices (the audio engine panel).';

export type BoothVoices = {
  /** The chapter's voices in REAPER's order, empty when it records on one track (a flat project or a plain track link). */
  voices: Voice[];
  /** The voice the next take, or the take running now, records on. */
  current?: Voice;
  /** A choice the host is answering: the control shows it as busy and a second press waits. */
  choosing: boolean;
  choose: (voice: Voice) => void;
  /** Number-pad key n (0 the Narrator, 1 to 9 the others). */
  byKey: (n: number) => void;
  step: (by: 1 | -1) => void;
  /** Reads the tracks, links and characters again (the voice list opening, a take stopping). */
  reload: () => void;
};

/**
 * The voices of the Booth's chapter (docs/prds/booth-voice-tracks.prd.md, phase 4): in a Voice folders project, a chapter linked to a
 * REAPER folder records on one of the folder's direct children. Choosing one asks the host (BoothVoiceSet), which accepts only a child
 * of the chapter's linked folder and, during a take this app started, switches the take live; a refusal is a toast. Until the
 * narrator chooses, the chapter records on its Narrator voice, as the host does.
 */
export function useBoothVoices({
  chapterId,
  recording,
  notify,
}: {
  chapterId: string;
  recording: boolean;
  notify: (text: string, tone?: 'error' | 'info') => void;
}): BoothVoices {
  const tracksPort = usePort('tracks');
  const links = usePort('chapterTrackMap');
  const storyBible = usePort('storyBible');
  const voiceTracks = usePort('voiceTracks');
  const { setup } = useVoiceSetup();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [link, setLink] = useState('');
  const [characters, setCharacters] = useState<GuideEntity[]>([]);
  // The voice chosen in each chapter this session, as the host keeps it.
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [choosing, setChoosing] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!chapterId || setup.layout !== 'folders') return;
    let live = true;
    void Promise.all([tracksPort.tracksList(), links.chapterTrackMapList(), storyBible.guideEntities()])
      .then(([project, map, entities]) => {
        if (!live) return;
        const mine = map.mappings.filter((mapping) => mapping.chapterId === chapterId);
        setTracks(project.tracks);
        setLink(mine.length === 1 ? mine[0].trackGuid : '');
        setCharacters(entities.filter((entity) => entity.category === 'Character'));
      })
      .catch((reason: unknown) => live && notify(describeApiError(reason), 'error'));
    return () => {
      live = false;
    };
  }, [chapterId, setup.layout, tracksPort, links, storyBible, notify, revision]);

  const voices = useMemo(() => (setup.layout === 'folders' && link ? folderVoices(tracks, link, characters, setup) : []), [setup, link, tracks, characters]);
  const current = voices.find((voice) => voice.guid === chosen[chapterId]) ?? voices.find((voice) => voice.narrator) ?? voices[0];

  const choose = useCallback(
    (voice: Voice) => {
      if (choosing) return;
      setChoosing(true);
      voiceTracks
        .boothVoiceSet(chapterId, voice.guid)
        .then((answer) => {
          if (answer.outcome === 'refused') notify(answer.message ?? 'The voice was not changed.', 'error');
          else if (answer.trackGuid) setChosen((before) => ({ ...before, [chapterId]: answer.trackGuid ?? '' }));
        })
        .catch((reason: unknown) => notify(describeApiError(reason), 'error'))
        .finally(() => setChoosing(false));
    },
    [choosing, voiceTracks, chapterId, notify],
  );

  const byKey = useCallback(
    (n: number) => {
      if (voices.length === 0) {
        notify(FLAT_VOICE_KEYS, 'info');
        return;
      }
      const voice = voices.find((each) => each.key === String(n));
      if (voice) choose(voice);
      // Decision C: a key with no track changes nothing; while stopped the voice list says which keys there are.
      else notify(`No track on Num ${n}.${recording ? ' The take goes on with the same voice.' : ''}`, 'info');
    },
    [voices, choose, notify, recording],
  );

  const step = useCallback(
    (by: 1 | -1) => {
      if (voices.length === 0) {
        notify(FLAT_VOICE_KEYS, 'info');
        return;
      }
      const at = current ? voices.indexOf(current) : 0;
      choose(voices[(at + by + voices.length) % voices.length]);
    },
    [voices, current, choose, notify],
  );

  const reload = useCallback(() => setRevision((n) => n + 1), []);
  return { voices, current, choosing, choose, byKey, step, reload };
}
