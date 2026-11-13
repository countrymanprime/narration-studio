import { retryAction, type ToastAction } from '../../primitives/Toast';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GuideEntity } from '../../../api/contracts/storyBible';
import type { Track } from '../../../api/contracts/tracks';
import { describeApiError } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { destinationFor, type ChapterLinkKind } from '../../engine/destination';
import { useVoiceSetup } from '../../engine/voiceLayout';
import { assignmentOf, folderChildren, folderVoices, type Voice } from '../../engine/voices';
import { LIVE_TRACKS_TIMEOUT_MS } from '../../engine/useLiveTracks';
import { useChapterTrackState } from '../../chapterTracks/ChapterTrackState';
import { withAddedVoices, type WhoCharacter } from './whoIsIn';
import type { BoothVoiceTrack } from '../../../api/contracts/voiceTracks';
import { chapterLink } from '../../chapterTracks/chapterLink';

export type BoothVoices = {
  /** The chapter's voices in REAPER's order, empty when it records on one track (a flat project or a plain track link). */
  voices: Voice[];
  /** What the chapter's link points at, which says why no voice is listed. */
  linkKind: ChapterLinkKind;
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
  const teleprompter = usePort('teleprompter');
  const storyBible = usePort('storyBible');
  const voiceTracks = usePort('voiceTracks');
  const { setup, replace } = useVoiceSetup();
  // The tracks and the links every screen shares (#3269): REAPER's live list over the saved file, read on window focus and every few seconds
  // while a screen watches, so a voice renamed, added or deleted in REAPER is seen before a save and the Booth never disagrees with the Engine.
  const trackState = useChapterTrackState();
  const [characters, setCharacters] = useState<GuideEntity[]>([]);
  // The voice the host records this chapter on (BoothVoiceGet), read with the tracks: never a voice the page assumed, so a choice made
  // before the Booth was left, or the voice a refused switch kept, is what the control shows.
  const [hostVoice, setHostVoice] = useState<{ chapterId: string; guid: string; added: BoothVoiceTrack[] }>({ chapterId: '', guid: '', added: [] });
  const [standIn, setStandIn] = useState<{ chapterId: string; character: WhoCharacter } | null>(null);
  const [stopping, setStopping] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [reaper, setReaper] = useState<{ chapterId: string; status: string; trackGuid: string; armedCount?: number } | null>(null);

  // The chapter's one link, once the shared state has answered: a chapter with no one link has no folder to read.
  const answered = trackState.readAt !== null;
  const chapter = chapterLink(trackState.mappings, chapterId);
  const link = answered && chapter.state === 'linked' ? (chapter.trackGuid ?? '') : '';
  const tracks: Track[] = useMemo(() => (link ? (trackState.project?.tracks ?? []) : []), [link, trackState.project]);
  // Every track some chapter is linked to: such a track is that chapter's own, never a voice of this one (as the host decides).
  const linkedTracks = useMemo(() => trackState.mappings.map((mapping) => mapping.trackGuid.toLowerCase()), [trackState.mappings]);

  // Whether the last host-voice read failed, so a run of failures toasts once, not on every tick (as useLiveTracks does). A press of the
  // toast's Retry always answers: it toasts again when the read fails again, or it clears the failure.
  const failing = useRef(false);
  // A change made here, or a refusal that says the tracks moved: read the shared tracks and the host's voice again.
  const refreshTracks = trackState.refresh;
  const refreshAll = useCallback(() => {
    refreshTracks();
    setRevision((n) => n + 1);
  }, [refreshTracks]);
  const retryPressed = useRef(false);
  const failed = useCallback(
    (reason: unknown, pressed: boolean) => {
      if (pressed || !failing.current)
        notify(
          describeApiError(reason),
          'error',
          retryAction(() => {
            retryPressed.current = true;
            setRevision((n) => n + 1);
          }),
        );
      failing.current = true;
    },
    [notify],
  );

  // The characters and the voice the host records on, read again whenever the shared tracks are (`readAt`) and after a change made here.
  useEffect(() => {
    if (!chapterId) return;
    let live = true;
    const pressed = retryPressed.current;
    retryPressed.current = false;
    if (!link) {
      setHostVoice({ chapterId, guid: '', added: [] });
      failing.current = false;
      return;
    }
    let reported = false;
    const report = (reason: unknown) => {
      if (reported) return;
      reported = true;
      failed(reason, pressed);
    };
    let hostFailed = false;
    const work = Promise.all([
      storyBible.guideEntities(),
      // A failed read is a toast; the voices are still listed, and the control shows the Narrator voice a start with no choice uses.
      voiceTracks.boothVoiceGet(chapterId).catch((reason: unknown) => {
        if (live) {
          hostFailed = true;
          report(reason);
        }
        return undefined;
      }),
    ]).then(([entities, voice]) => {
      if (!live) return;
      if (!hostFailed) failing.current = false;
      setCharacters(entities.filter((entity) => entity.category === 'Character'));
      setHostVoice({
        chapterId,
        guid: voice?.outcome === 'selected' || voice?.outcome === 'switched' ? (voice.trackGuid ?? '') : '',
        added: voice?.added ?? [],
      });
    });
    // A read that never answers must not hold the page: after the limit the run fails, and the next read of the shared tracks starts another.
    let timer = 0;
    const limit = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error('REAPER did not answer.')), LIVE_TRACKS_TIMEOUT_MS);
    });
    void Promise.race([work, limit])
      .catch((reason: unknown) => live && report(reason))
      .finally(() => {
        window.clearTimeout(timer);
      });
    return () => {
      live = false;
    };
  }, [chapterId, link, trackState.readAt, storyBible, voiceTracks, failed, revision]);

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
  }, [chapterId, teleprompter, hostVoice.guid, recording, revision, trackState.readAt]);

  // The voices the Booth added this session are listed before the narrator saves the project in the DAW (BoothVoiceGet's `added`).
  const added = hostVoice.chapterId === chapterId ? hostVoice.added : undefined;
  const voices = useMemo(
    // The linked folder's own children decide, not the layout toggle (#3269): the host records on them whatever the toggle says.
    () => {
      if (!link) return [];
      const all = withAddedVoices(tracks, link, added ?? []);
      // The host's rule (chapterVoicesIn): a track some chapter is linked to is that chapter's own (nested chapters), never a voice of this one.
      const owned = new Set(
        folderChildren(all, link)
          .filter((child) => linkedTracks.includes(child.guid.toLowerCase()))
          .map((child) => child.guid),
      );
      return folderVoices(
        all.filter((track) => !owned.has(track.guid)),
        link,
        characters,
        setup,
      );
    },
    [setup, link, linkedTracks, tracks, characters, added],
  );
  // What the chapter's link points at, for the sentence a voice key gets when no voice is listed.
  const linkKind: ChapterLinkKind = useMemo(() => {
    if (!link) return trackState.reading && !answered && chapterId ? 'unread' : 'none';
    const linked = tracks.find((track) => track.guid.toLowerCase() === link.toLowerCase());
    return !linked ? 'unknown' : linked.isFolder ? 'empty' : 'track';
  }, [link, tracks, trackState.reading, answered, chapterId]);
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
            if (answer.reason === 'not_a_voice' || answer.reason === 'track_missing') refreshAll();
          } else if (answer.trackGuid) {
            // The voice is chosen, but the DAW would not arm it (#3429): say so, the Booth's arm dot reads the DAW's real arms.
            if (answer.outcome === 'selected' && answer.message) {
              notify(answer.message, 'error');
              // A voice track the DAW no longer has: the voices this page lists are not the project's any more.
              if (answer.reason === 'track_missing') refreshAll();
            }
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
    [voiceTracks, chapterId, notify, refreshAll],
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
        notify(destinationFor(setup.layout).noVoiceKeys(linkKind), 'info');
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
    [voices, choose, notify, recording, stopTake, onNoTrack, asking, linkKind, setup.layout],
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
        refreshAll();
        return true;
      } catch (reason: unknown) {
        notify(describeApiError(reason), 'error');
        return false;
      }
    },
    [voiceTracks, chapterId, notify, replace, setup.tracks, characters, refreshAll],
  );

  const use = useCallback(
    async (voice: Voice, characterIds: string[]) => {
      try {
        if (characterIds.length > 0) {
          const name = voice.name.trim();
          // A track with no assignment records the character its name matches (White Rabbit on "White Rabbit"): an assignment replaces the
          // match, so that character is kept in it, or putting another on the track would take the track from it (walkthrough, #2839).
          const had = assignmentOf(setup, { guid: voice.guid, name })?.characters ?? voice.characters.map((character) => character.id);
          replace(await voiceTracks.voiceTracksSetCharacters(name, [...had, ...characterIds.filter((id) => !had.includes(id))]));
        }
        choose(voice);
        return true;
      } catch (reason: unknown) {
        notify(describeApiError(reason), 'error');
        return false;
      }
    },
    [voiceTracks, setup, replace, choose, notify],
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
        notify(destinationFor(setup.layout).noVoiceKeys(linkKind), 'info');
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
    [voices, current, choose, notify, linkKind, setup.layout],
  );

  const reload = refreshAll;
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
    linkKind,
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
