import { retryAction, type ToastAction } from '../../primitives/Toast';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import type { Track } from '../../../api/contracts/tracks';
import { describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { useVoiceSetup } from '../../engine/voiceLayout';
import { folderChildren, folderVoices, type Voice } from '../../engine/voices';
import { LIVE_TRACKS_POLL_MS } from '../../engine/useLiveTracks';
import { withAddedVoices, type WhoCharacter } from './whoIsIn';
import type { BoothVoiceTrack } from '../../../api/contracts/voiceTracks';

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
  /** Number-pad key n (0 the Narrator, 1 to 9 the others). A key with no track behind it asks who is in it (`onNoTrack`), after
   * stopping a take this app runs: a key pressed while that stop is answered is the one acted on once it is (the last one wins). */
  byKey: (n: number) => void;
  /** True while a key's stop of the take is being answered. */
  stopping: boolean;
  /** Adds a track for characters to the chapter's folder and chooses it; true when it was added, else the refusal was a toast. */
  add: (name: string, characterIds: string[]) => Promise<boolean>;
  /** Puts characters on an existing voice, then chooses it; true when it was chosen. */
  use: (voice: Voice, characterIds: string[]) => Promise<boolean>;
  /** A character with no track chosen during a take (decision 5): the Narrator voice records it, and the control says so. */
  standIn?: WhoCharacter;
  /** Chooses a character with no track: during a take the Narrator voice records it (`standIn`); while stopped `onNoTrack` is not
   * used, the caller asks who records it. */
  standInFor: (character: WhoCharacter) => void;
  step: (by: 1 | -1) => void;
  /** What REAPER reports of the arms: `armed` when the current voice is the one track armed (or the voice this app's take records
   * on), `several` the number armed when that is more than one, `unknown` before the first read or after a failed one. */
  arm: { state: 'armed' | 'not_armed' | 'several' | 'unknown'; count?: number };
  /** Reads the tracks, links and characters again (the voice list opening, a take stopping). */
  reload: () => void;
};

/**
 * The voices of the Booth's chapter (docs/prds/booth-voice-tracks.prd.md, phase 4): a chapter linked to a REAPER folder that holds
 * tracks of its own (not other chapters' tracks) records on one of the folder's direct children, whatever the layout toggle says. Choosing one asks the host (BoothVoiceSet), which accepts only a child
 * of the chapter's linked folder and, during a take this app started, switches the take live; a refusal is a toast. Until the
 * narrator chooses, the chapter records on its Narrator voice, as the host does.
 */
export function useBoothVoices({
  chapterId,
  recording,
  notify,
  stopTake,
  onNoTrack,
  asking = false,
}: {
  chapterId: string;
  recording: boolean;
  notify: (text: string, tone?: 'error' | 'info', action?: ToastAction) => void;
  /** Stops the take this app runs, as the Stop press does (the take is kept); resolves true once it has stopped. */
  stopTake?: () => Promise<boolean>;
  /** A key with no track behind it, pressed or answered once no take runs: the page asks who is in it. */
  onNoTrack?: (key: number) => void;
  /** The page's "Who is in Num N?" is open: a voice key does nothing until it closes. */
  asking?: boolean;
}): BoothVoices {
  const tracksPort = usePort('tracks');
  const teleprompter = usePort('teleprompter');
  const links = usePort('chapterTrackMap');
  const storyBible = usePort('storyBible');
  const voiceTracks = usePort('voiceTracks');
  const { setup, replace } = useVoiceSetup();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [link, setLink] = useState('');
  // Every track some chapter is linked to: under Flat, a folder holding another chapter's track is nested chapters, not voices (as the host decides).
  const [linkedTracks, setLinkedTracks] = useState<string[]>([]);
  const [characters, setCharacters] = useState<GuideEntity[]>([]);
  // The voice the host records this chapter on (BoothVoiceGet), read with the tracks: never a voice the page assumed, so a choice made
  // before the Booth was left, or the voice a refused switch kept, is what the control shows.
  const [hostVoice, setHostVoice] = useState<{ chapterId: string; guid: string; added: BoothVoiceTrack[] }>({ chapterId: '', guid: '', added: [] });
  const [standIn, setStandIn] = useState<{ chapterId: string; character: WhoCharacter } | null>(null);
  const [stopping, setStopping] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [reaper, setReaper] = useState<{ chapterId: string; status: string; trackGuid: string; armedCount?: number } | null>(null);

  // Whether the last read failed, so the poll below toasts a run of failures once, not on every tick (as useLiveTracks does).
  const failing = useRef(false);
  const failed = useCallback(
    (reason: unknown) => {
      if (!failing.current)
        notify(
          describeApiError(reason),
          'error',
          retryAction(() => setRevision((n) => n + 1)),
        );
      failing.current = true;
    },
    [notify],
  );

  useEffect(() => {
    if (!chapterId) return;
    let live = true;
    void (async () => {
      const map = await links.chapterTrackMapList();
      if (!live) return;
      const mine = map.mappings.filter((mapping) => mapping.chapterId === chapterId);
      setLinkedTracks(map.mappings.map((mapping) => mapping.trackGuid.toLowerCase()));
      // A chapter with no one link has no folder to read: the DAW is not asked (a project with no REAPER file has nothing to list).
      if (mine.length !== 1) {
        setLink('');
        setTracks([]);
        setHostVoice({ chapterId, guid: '', added: [] });
        failing.current = false;
        return;
      }
      const [project, entities, voice] = await Promise.all([
        // REAPER's live list over the saved file, as the Engine page reads it: a voice renamed or deleted in REAPER is seen before a save (#3269).
        tracksPort.tracksLive().then((answer) => answer.project),
        storyBible.guideEntities(),
        // A failed read is a toast; the voices are still listed, and the control shows the Narrator voice a start with no choice uses.
        voiceTracks.boothVoiceGet(chapterId).catch((reason: unknown) => {
          if (live) failed(reason);
          return undefined;
        }),
      ]);
      if (!live) return;
      failing.current = false;
      setTracks(project.tracks);
      setLink(mine[0].trackGuid);
      setCharacters(entities.filter((entity) => entity.category === 'Character'));
      setHostVoice({
        chapterId,
        guid: voice?.outcome === 'selected' || voice?.outcome === 'switched' ? (voice.trackGuid ?? '') : '',
        added: voice?.added ?? [],
      });
    })().catch((reason: unknown) => live && failed(reason));
    return () => {
      live = false;
    };
  }, [chapterId, tracksPort, links, storyBible, voiceTracks, failed, revision]);

  // The tracks change in the DAW while the Booth is open: read them again when the window gets focus and every few seconds while it is in
  // front, as the Engine page does, so the voice keys and the voice shown never go stale (#3269).
  useEffect(() => {
    if (!chapterId) return;
    const again = () => {
      if (document.visibilityState === 'visible') setRevision((n) => n + 1);
    };
    const timer = window.setInterval(again, LIVE_TRACKS_POLL_MS);
    window.addEventListener('focus', again);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', again);
    };
  }, [chapterId]);

  // REAPER's arms, read on the voice the host records on (ReadAloudReaperState reads the chosen voice of a folder): again after a choice,
  // and when a take starts or stops, which arms and puts back. A failed read is unknown, never the last answer given as fact.
  useEffect(() => {
    if (!chapterId) return;
    let live = true;
    teleprompter
      .readAloudReaperState(chapterId)
      .then((state) => live && setReaper({ chapterId, status: state.status, trackGuid: state.trackGuid ?? '', armedCount: state.armedCount }))
      .catch(() => live && setReaper(null));
    return () => {
      live = false;
    };
  }, [chapterId, teleprompter, hostVoice.guid, recording, revision]);

  // The voices the Booth added this session are listed before the narrator saves the project in the DAW (BoothVoiceGet's `added`).
  const added = hostVoice.chapterId === chapterId ? hostVoice.added : undefined;
  const voices = useMemo(
    // The linked folder's own children decide, not the layout toggle (#3269): the host records on them whatever the toggle says.
    () => {
      if (!link) return [];
      const all = withAddedVoices(tracks, link, added ?? []);
      // The host's rule (chapterVoicesIn): under Flat, a folder holding another chapter's track is nested chapters, not voices.
      if (setup.layout !== 'folders' && folderChildren(all, link).some((child) => linkedTracks.includes(child.guid.toLowerCase()))) return [];
      return folderVoices(all, link, characters, setup);
    },
    [setup, link, linkedTracks, tracks, characters, added],
  );
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
          } else if (answer.trackGuid) {
            const guid = answer.trackGuid;
            setHostVoice((last) => ({ chapterId, guid, added: last.chapterId === chapterId ? last.added : [] }));
          }
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
      // A voice chosen is the voice recorded: the stand-in for a character with no track ends.
      setStandIn(null);
      if (sending.current) queued.current = voice;
      else send(voice);
    },
    [send],
  );

  // The key a stop is being answered for, and the voices as they are now (the stop's answer comes after a render).
  const stopFor = useRef<number | undefined>(undefined);
  const latest = useRef({ voices, onNoTrack, asking });
  latest.current = { voices, onNoTrack, asking };

  const byKey = useCallback(
    (n: number) => {
      if (voices.length === 0) {
        notify(FLAT_VOICE_KEYS, 'info');
        return;
      }
      // "Who is in Num N?" is open: it is answered first, and a key behind it neither asks again nor switches a voice.
      if (asking) return;
      // A stop is being answered: this key is the one acted on once it is (a held key repeats; a second key replaces the first).
      if (stopFor.current !== undefined) {
        stopFor.current = n;
        return;
      }
      const voice = voices.find((each) => each.key === String(n));
      if (voice) return choose(voice);
      // Decision C as the owner changed it (#2839): a key with no track asks who is in it, while stopped and during a take; a take
      // this app runs is stopped first, as the Stop press stops it, so nothing recorded is lost.
      if (!recording || !stopTake) return onNoTrack?.(n);
      stopFor.current = n;
      setStopping(true);
      void stopTake()
        .then((stopped) => {
          const key = stopFor.current ?? n;
          // A stop that did not go through has said why (the record control's refusal): the take goes on and nothing is asked.
          if (!stopped) return;
          const now = latest.current;
          const chosen = now.voices.find((each) => each.key === String(key));
          if (chosen) choose(chosen);
          else if (!now.asking) now.onNoTrack?.(key);
        })
        .catch((reason: unknown) => notify(describeApiError(reason), 'error'))
        .finally(() => {
          stopFor.current = undefined;
          setStopping(false);
        });
    },
    [voices, choose, notify, recording, stopTake, onNoTrack, asking],
  );

  const add = useCallback(
    async (name: string, characterIds: string[]) => {
      try {
        // A track named for a character records that character by name until it has an assignment; the add makes one, so the
        // character the name matches goes in it too, unless the name is assigned already (it then keeps what it had).
        const same = (a: string) => a.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase();
        const named = setup.tracks.some((entry) => same(entry.track))
          ? undefined
          : characters.find((entity) => same(entity.canonical_name) || entity.aliases.some((alias) => same(alias.text)));
        const ids = named && characterIds.length > 0 && !characterIds.includes(named.id) ? [named.id, ...characterIds] : characterIds;
        const answer = await voiceTracks.boothVoiceAdd(chapterId, name, ids);
        if (answer.outcome === 'refused') {
          notify(answer.message ?? 'The track was not added.', 'error');
          return false;
        }
        setStandIn(null);
        const guid = answer.trackGuid ?? '';
        setHostVoice((last) => ({
          chapterId,
          guid,
          added: [...(last.chapterId === chapterId ? last.added : []), { guid, name: answer.name ?? name }],
        }));
        // The characters are on the new track's name: the Voices card and the keys read them from the setup.
        // Reading the setup again changes nothing, so the failed read-back's toast offers Retry (issue #2919).
        const readBack = (): Promise<void> =>
          voiceTracks
            .voiceTracksGet()
            .then(replace)
            .catch((reason: unknown) =>
              notify(
                `The track was added, but its characters could not be read back: ${describeApiError(reason)}`,
                'error',
                retryAction(() => void readBack()),
              ),
            );
        await readBack();
        setRevision((count) => count + 1);
        return true;
      } catch (reason: unknown) {
        notify(describeApiError(reason), 'error');
        return false;
      }
    },
    [voiceTracks, chapterId, notify, replace, setup.tracks, characters],
  );

  const use = useCallback(
    async (voice: Voice, characterIds: string[]) => {
      try {
        if (characterIds.length > 0) {
          const name = voice.name.trim();
          // A track with no assignment records the character its name matches (White Rabbit on "White Rabbit"): an assignment replaces the
          // match, so that character is kept in it, or putting another on the track would take the track from it (walkthrough, #2839).
          const had = setup.tracks.find((entry) => entry.track === name)?.characters ?? voice.characters.map((character) => character.id);
          replace(await voiceTracks.voiceTracksSetCharacters(name, [...had, ...characterIds.filter((id) => !had.includes(id))]));
        }
        choose(voice);
        return true;
      } catch (reason: unknown) {
        notify(describeApiError(reason), 'error');
        return false;
      }
    },
    [voiceTracks, setup.tracks, replace, choose, notify],
  );

  const standInFor = useCallback(
    (character: WhoCharacter) => {
      const narrator = voices.find((voice) => voice.narrator);
      if (!narrator) {
        notify(`${character.name} has no track, and this chapter has no Narrator track to record on.`, 'error');
        return;
      }
      if (sending.current) queued.current = narrator;
      else send(narrator);
      setStandIn({ chapterId, character });
    },
    [voices, send, chapterId, notify],
  );

  const step = useCallback(
    (by: 1 | -1) => {
      // A key's stop is being answered: stepping now would switch a take that is ending.
      if (stopFor.current !== undefined) return;
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
  return {
    voices,
    current,
    choosing,
    choose,
    byKey,
    stopping,
    add,
    use,
    standIn: standIn?.chapterId === chapterId ? standIn.character : undefined,
    standInFor,
    step,
    arm,
    reload,
  };
}
