// The mock of the Booth's voice choice (src/studio/desktop/bindings_booth_voice.go), over the mock's own answers: the voice setup,
// the chapter links and the saved project's tracks. In a Voice folders project a chapter linked to a folder records on one of its
// direct children: the one chosen, else the first named Narrator, else the first. A take this app started switches voice live.
import type { NarrationApi } from '../types';
import type { BoothVoice } from './contracts/voiceTracks';
import type { Track } from './contracts/tracks';

type Deps = Pick<
  NarrationApi,
  'voiceTracksGet' | 'chapterTrackMapList' | 'tracksList' | 'readAloudRecordStart' | 'readAloudRecordStartAt' | 'readAloudRecordStop'
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
  let recording: { chapterId: string; since: number; from: number } | undefined;

  /** The chapter's one link and, in a Voice folders project with that link a folder, its voices. */
  const voicesOf = async (chapterId: string) => {
    const [setup, map, project] = await Promise.all([api.voiceTracksGet(), api.chapterTrackMapList(), api.tracksList()]);
    const links = map.mappings.filter((mapping) => mapping.chapterId === chapterId).map((mapping) => mapping.trackGuid);
    const voices = setup.layout === 'folders' && links.length === 1 ? childrenOf(project.tracks, links[0]) : null;
    return { links, voices };
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
    async boothVoiceGet(chapterId: string): Promise<BoothVoice> {
      const { links, voices } = await voicesOf(chapterId);
      const notOne = linkRefusal(links);
      if (notOne) return notOne;
      if (!voices) return refused('flat', 'This chapter records on one track.');
      if (voices.length === 0)
        return refused('no_voices', 'This chapter is linked to a folder with no voice tracks in it. Add a track inside the folder in REAPER, and save.');
      return { outcome: 'selected', trackGuid: voiceFor(voices, chosenFor(chapterId)) };
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
    readAloudRecordStart: (chapterId: string) => startedOn(chapterId, () => api.readAloudRecordStart(chapterId)),
    readAloudRecordStartAt: (chapterId: string, at: number) => startedOn(chapterId, () => api.readAloudRecordStartAt(chapterId, at)),
    async readAloudRecordStop() {
      const result = await api.readAloudRecordStop();
      if (result.outcome === 'stopped') recording = undefined;
      return result;
    },
  };
}
