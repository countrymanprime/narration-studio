import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  /** A choice the host is answering: the control shows it as busy, and a press meanwhile is sent once it answers (the last one wins). */
  choosing: boolean;
  choose: (voice: Voice) => void;
  /** Number-pad key n (0 the Narrator, 1 to 9 the others). */
  byKey: (n: number) => void;
  step: (by: 1 | -1) => void;
  /** What REAPER reports of the arms: `armed` when the current voice is the one track armed (or the voice this app's take records
   * on), `several` the number armed when that is more than one, `unknown` before the first read or after a failed one. */
  arm: { state: 'armed' | 'not_armed' | 'several' | 'unknown'; count?: number };
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
  const teleprompter = usePort('teleprompter');
  const links = usePort('chapterTrackMap');
  const storyBible = usePort('storyBible');
  const voiceTracks = usePort('voiceTracks');
  const { setup } = useVoiceSetup();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [link, setLink] = useState('');
  const [characters, setCharacters] = useState<GuideEntity[]>([]);
  // The voice the host records this chapter on (BoothVoiceGet), read with the tracks: never a voice the page assumed, so a choice made
  // before the Booth was left, or the voice a refused switch kept, is what the control shows.
  const [hostVoice, setHostVoice] = useState<{ chapterId: string; guid: string }>({ chapterId: '', guid: '' });
  const [choosing, setChoosing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [reaper, setReaper] = useState<{ chapterId: string; status: string; trackGuid: string; armedCount?: number } | null>(null);

  useEffect(() => {
    if (!chapterId || setup.layout !== 'folders') return;
    let live = true;
    void Promise.all([
      tracksPort.tracksList(),
      links.chapterTrackMapList(),
      storyBible.guideEntities(),
      // A failed read is a toast; the voices are still listed, and the control shows the Narrator voice a start with no choice uses.
      voiceTracks.boothVoiceGet(chapterId).catch((reason: unknown) => {
        if (live) notify(describeApiError(reason), 'error');
        return undefined;
      }),
    ])
      .then(([project, map, entities, voice]) => {
        if (!live) return;
        const mine = map.mappings.filter((mapping) => mapping.chapterId === chapterId);
        setTracks(project.tracks);
        setLink(mine.length === 1 ? mine[0].trackGuid : '');
        setCharacters(entities.filter((entity) => entity.category === 'Character'));
        setHostVoice({ chapterId, guid: voice?.outcome === 'selected' || voice?.outcome === 'switched' ? (voice.trackGuid ?? '') : '' });
      })
      .catch((reason: unknown) => live && notify(describeApiError(reason), 'error'));
    return () => {
      live = false;
    };
  }, [chapterId, setup.layout, tracksPort, links, storyBible, voiceTracks, notify, revision]);

  // REAPER's arms, read on the voice the host records on (ReadAloudReaperState reads the chosen voice of a folder): again after a choice,
  // and when a take starts or stops, which arms and puts back. A failed read is unknown, never the last answer given as fact.
  useEffect(() => {
    if (!chapterId || setup.layout !== 'folders') return;
    let live = true;
    teleprompter
      .readAloudReaperState(chapterId)
      .then((state) => live && setReaper({ chapterId, status: state.status, trackGuid: state.trackGuid ?? '', armedCount: state.armedCount }))
      .catch(() => live && setReaper(null));
    return () => {
      live = false;
    };
  }, [chapterId, setup.layout, teleprompter, hostVoice.guid, recording, revision]);

  const voices = useMemo(() => (setup.layout === 'folders' && link ? folderVoices(tracks, link, characters, setup) : []), [setup, link, tracks, characters]);
  // Until the host's answer for this chapter arrives, the voice it records on with no choice made: the Narrator, else the first.
  const fromHost = hostVoice.chapterId === chapterId ? voices.find((voice) => voice.guid.toLowerCase() === hostVoice.guid.toLowerCase()) : undefined;
  const current = fromHost ?? voices.find((voice) => voice.narrator) ?? voices[0];

  // The voice the host is answering for, and the one pressed since: a press while the host answers is not dropped but sent next, and
  // only the last of several such presses is (a narrator who presses Num 1 then Num 2 means Num 2).
  const sending = useRef<Voice | undefined>(undefined);
  const queued = useRef<Voice | undefined>(undefined);

  const send = useCallback(
    (voice: Voice) => {
      sending.current = voice;
      setChoosing(true);
      voiceTracks
        .boothVoiceSet(chapterId, voice.guid)
        .then((answer) => {
          if (answer.outcome === 'refused') {
            notify(answer.message ?? 'The voice was not changed.', 'error');
            // The voices this page lists are not the saved project's any more: read them again.
            if (answer.reason === 'not_a_voice' || answer.reason === 'track_missing') setRevision((n) => n + 1);
          } else if (answer.trackGuid) setHostVoice({ chapterId, guid: answer.trackGuid });
        })
        .catch((reason: unknown) => notify(describeApiError(reason), 'error'))
        .finally(() => {
          sending.current = undefined;
          const next = queued.current;
          queued.current = undefined;
          if (next && next.guid !== voice.guid) send(next);
          else setChoosing(false);
        });
    },
    [voiceTracks, chapterId, notify],
  );

  const choose = useCallback(
    (voice: Voice) => {
      if (sending.current) queued.current = voice;
      else send(voice);
    },
    [send],
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
      // From the voice last pressed, so Num + twice while the host answers steps twice.
      const from = queued.current ?? sending.current ?? current;
      const at = Math.max(
        0,
        voices.findIndex((voice) => voice.guid === from?.guid),
      );
      choose(voices[(at + by + voices.length) % voices.length]);
    },
    [voices, current, choose, notify],
  );

  const reload = useCallback(() => setRevision((n) => n + 1), []);
  const read = reaper?.chapterId === chapterId ? reaper : null;
  // During this app's take the voice it records on is armed: the start and every switch answer say so, and the state read then only says REAPER records.
  const arm: BoothVoices['arm'] = recording
    ? { state: 'armed' }
    : !read || !current
      ? { state: 'unknown' }
      : read.status === 'several_armed'
        ? { state: 'several', count: read.armedCount }
        : read.status === 'ready' && read.trackGuid.toLowerCase() === current.guid.toLowerCase()
          ? { state: 'armed' }
          : { state: 'not_armed' };
  return { voices, current, choosing, choose, byKey, step, arm, reload };
}
