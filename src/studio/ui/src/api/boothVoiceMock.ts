// The mock of the Booth's voice choice (src/studio/desktop/bindings_booth_voice.go), over the mock's own answers: the voice setup,
// the chapter links and the saved project's tracks. In a Voice folders project a chapter linked to a folder records on one of its
// direct children: the one chosen, else the first named Narrator, else the first. A take this app started switches voice live.
import type { NarrationApi } from '../types';
import type { BoothPunch, BoothVoice, BoothVoiceAdded, BoothVoiceTrack } from './contracts/voiceTracks';
import type { Track } from './contracts/tracks';

type Deps = Pick<
  NarrationApi,
  | 'voiceTracksGet'
  | 'voiceTracksSetCharacters'
  | 'chapterTrackMapList'
  | 'tracksList'
  | 'tracksLive'
  | 'readAloudRecordStart'
  | 'readAloudRecordStartAt'
  | 'readAloudRecordStop'
  | 'readAloudReaperState'
>;

const FLAT =
  'This chapter records on one track. Voice keys choose a voice in a Voice folders project, for a chapter linked to a folder (the audio engine panel).';
const NOT_A_VOICE = "That track is not a voice of this chapter's folder. Its tracks may have changed in the saved project.";

const refused = (reason: NonNullable<BoothVoice['reason']>, message: string): BoothVoice => ({ outcome: 'refused', reason, message });

/** The direct children of the folder `guid` names, in REAPER's order; null when it is not a folder of the project. */
function childrenOf(tracks: readonly Track[], guid: string): Track[] | null {
  const at = tracks.findIndex((track) => track.guid === guid);
  const folder = tracks[at];
  if (!folder?.isFolder) return null;
  const children: Track[] = [];
  for (const track of tracks.slice(at + 1)) {
    if (track.depth <= folder.depth) break;
    if (track.depth === folder.depth + 1) children.push(track);
  }
  return children;
}

function voiceFor(voices: readonly Track[], chosen: string): string {
  return (
    voices.find((voice) => chosen !== '' && voice.guid.toLowerCase() === chosen.toLowerCase())?.guid ??
    voices.find((voice) => voice.name.trim().toLowerCase() === 'narrator')?.guid ??
    voices[0].guid
  );
}

export function createBoothVoiceMock(api: Deps) {
  // The voice chosen in each chapter this session, as the host keeps it (Host.boothVoices).
  const chosen = new Map<string, string>();
  // The voices BoothVoiceAdd added, by folder GUID (upper case): REAPER has them, the saved project does not until the narrator saves.
  const added = new Map<string, BoothVoiceTrack[]>();
  let addedCount = 0;
  let recording: { chapterId: string; since: number; from: number } | undefined;

  /** The chapter's one link and, in a Voice folders project with that link a folder, its voices. */
  const voicesOf = async (chapterId: string) => {
    const [setup, map, savedProject] = await Promise.all([api.voiceTracksGet(), api.chapterTrackMapList(), api.tracksList()]);
    const links = map.mappings.filter((mapping) => mapping.chapterId === chapterId).map((mapping) => mapping.trackGuid);
    let project = savedProject;
    let saved = setup.layout === 'folders' && links.length === 1 ? childrenOf(project.tracks, links[0]) : null;
    // A folder the app just made (ChapterTrackCreate) is in REAPER's live list before the narrator saves: the host lists its Narrator from what
    // it made (chapterVoices), so the mock reads the live list when the saved project lacks the chapter's folder (#3271).
    if (saved === null && setup.layout === 'folders' && links.length === 1) {
      const live = (await api.tracksLive()).project;
      saved = childrenOf(live.tracks, links[0]);
      if (saved) project = live;
    }
    const unsaved = saved ? (added.get(links[0].toUpperCase()) ?? []).filter((voice) => !project.tracks.some((track) => track.guid === voice.guid)) : [];
    const folder = saved ? project.tracks.find((track) => track.guid === links[0]) : undefined;
    const extra: Track[] = unsaved.map((voice, at) => ({
      guid: voice.guid,
      name: voice.name,
      index: project.tracks.length + at,
      color: '',
      muted: false,
      soloed: false,
      items: [],
      depth: (folder?.depth ?? 0) + 1,
      isFolder: false,
    }));
    const voices = saved ? [...saved, ...extra] : null;
    return { links, voices, unsaved };
  };
  const chosenFor = (chapterId: string) => chosen.get(chapterId) ?? '';

  const startedOn = async (chapterId: string, start: () => ReturnType<Deps['readAloudRecordStart']>) => {
    const { voices } = await voicesOf(chapterId);
    if (voices?.length === 0)
      return {
        outcome: 'refused' as const,
        reason: 'no_voices' as const,
        message: 'This chapter is linked to a folder with no voice tracks in it. Add a track inside the folder in REAPER, and save.',
      };
    const result = await start();
    if (result.outcome !== 'started') return result;
    recording = { chapterId, since: Date.now(), from: result.position ?? 0 };
    return voices ? { ...result, trackGuid: voiceFor(voices, chosenFor(chapterId)) } : result;
  };

  /** The refusal a chapter with no single link gets, as readAloudTrackGUID gives it; undefined when it has one. */
  const linkRefusal = (links: readonly string[]): BoothVoice | undefined => {
    if (links.length === 0) return refused('unlinked', 'This chapter has no linked track. Link it to its REAPER track in the audio engine panel.');
    if (links.length > 1)
      return refused('several_links', `This chapter is linked to ${links.length} tracks. Keep the one to record on, in the audio engine panel.`);
    return undefined;
  };

  return {
    // The mock has no recording check to read a passage from: nothing of it was heard, so a start from here continues (the host's
    // answer for a passage no word of which was heard).
    async boothPunchTarget(_chapterId: string, _paragraphId: string, _fromWord: number, _toWord: number): Promise<BoothPunch> {
      return { outcome: 'never_recorded' };
    },
    async boothVoiceGet(chapterId: string): Promise<BoothVoice> {
      const { links, voices } = await voicesOf(chapterId);
      const notOne = linkRefusal(links);
      if (notOne) return notOne;
      if (!voices) return refused('flat', 'This chapter records on one track.');
      if (voices.length === 0)
        return refused('no_voices', 'This chapter is linked to a folder with no voice tracks in it. Add a track inside the folder in REAPER, and save.');
      const { unsaved } = await voicesOf(chapterId);
      return { outcome: 'selected', trackGuid: voiceFor(voices, chosenFor(chapterId)), ...(unsaved.length ? { added: unsaved } : {}) };
    },
    // As BoothVoiceAdd does (src/studio/desktop/boothvoiceadd.go): a child at the end of the chapter's folder, its characters added
    // to its name's, and chosen. Refused during this app's take, for a blank name or one a voice of the folder has.
    async boothVoiceAdd(chapterId: string, name: string, characterIds: string[]): Promise<BoothVoiceAdded> {
      const { links, voices } = await voicesOf(chapterId);
      const notOne = linkRefusal(links);
      if (notOne) return { ...notOne, outcome: 'refused' };
      if (!voices) return { outcome: 'refused', reason: 'flat', message: FLAT };
      const clean = name.split(/\s+/).filter(Boolean).join(' ');
      if (!clean) return { outcome: 'refused', reason: 'no_name', message: 'The new track needs a name.' };
      if ([...clean].length > 120)
        return {
          outcome: 'refused',
          reason: 'invalid',
          message: 'That track name or list of characters is too long (at most 120 characters in a name and 200 characters on a track).',
        };
      const taken = voices.find((voice) => voice.name.split(/\s+/).filter(Boolean).join(' ').toLowerCase() === clean.toLowerCase());
      if (taken)
        return {
          outcome: 'refused',
          reason: 'name_taken',
          message: `This chapter already has a track named “${taken.name.trim()}”. Choose it, or give the new track another name.`,
        };
      if (recording) return { outcome: 'refused', reason: 'recording', message: 'REAPER is recording. Stop the take, then add the track.' };
      addedCount += 1;
      const voice = { guid: `{ADDED000-0000-4000-8000-${String(addedCount).padStart(12, '0')}}`, name: clean };
      const key = links[0].toUpperCase();
      added.set(key, [...(added.get(key) ?? []), voice]);
      if (characterIds.length) {
        const had = (await api.voiceTracksGet()).tracks.find((entry) => entry.track === clean)?.characters ?? [];
        await api.voiceTracksSetCharacters(clean, [...had, ...characterIds.filter((id) => !had.includes(id))]);
      }
      chosen.set(chapterId, voice.guid);
      return { outcome: 'added', trackGuid: voice.guid, name: clean };
    },
    async boothVoiceSet(chapterId: string, trackGuid: string): Promise<BoothVoice> {
      const { links, voices } = await voicesOf(chapterId);
      const notOne = linkRefusal(links);
      if (notOne) return notOne;
      if (!voices) return refused('flat', FLAT);
      const target = voices.find((voice) => voice.guid.toLowerCase() === trackGuid.toLowerCase());
      if (!target) return refused('not_a_voice', NOT_A_VOICE);
      chosen.set(chapterId, target.guid);
      if (recording?.chapterId !== chapterId) return { outcome: 'selected', trackGuid: target.guid };
      return { outcome: 'switched', trackGuid: target.guid, at: recording.from + (Date.now() - recording.since) / 1000 };
    },
    // As ReadAloudReaperState does for a chapter linked to a folder of voices: the arms read are its voice's, never the folder's.
    async readAloudReaperState(chapterId: string) {
      const state = await api.readAloudReaperState(chapterId);
      const { voices } = await voicesOf(chapterId);
      return voices?.length ? { ...state, trackGuid: voiceFor(voices, chosenFor(chapterId)) } : state;
    },
    readAloudRecordStart: (chapterId: string) => startedOn(chapterId, () => api.readAloudRecordStart(chapterId)),
    readAloudRecordStartAt: (chapterId: string, at: number) => startedOn(chapterId, () => api.readAloudRecordStartAt(chapterId, at)),
    async readAloudRecordStop() {
      const result = await api.readAloudRecordStop();
      if (result.outcome === 'stopped') recording = undefined;
      return result;
    },
  };
}
