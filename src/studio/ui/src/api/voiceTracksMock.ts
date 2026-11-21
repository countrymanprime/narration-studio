// The mock of a project's voice setup: one in-memory state with the host's rules (src/studio/desktop/internal/voicetracks), so a page
// and a test see what the host would answer.
import type { VoiceTracksApi, VoiceTracksState } from '../types';

const LIMIT = 120;

function validName(text: string): boolean {
  // Tabs and line breaks are refused like any other control character, as the host does.
  // eslint-disable-next-line no-control-regex
  return text.trim() !== '' && [...text].length <= LIMIT && !/[\u0000-\u001f\u007f-\u009f]/.test(text);
}

/** Every VoiceTracksApi call but the Booth's voice, which needs the links and tracks too (boothVoiceMock.ts). */
export function createVoiceTracksMock(
  initial?: Partial<VoiceTracksState>,
  /** Where the marked tracks are published as they change, so the chapters' rows (`members[].notAVoice`) follow them as the host's do. */
  marks?: { current: string[] },
  /** Filled in with the way a create marks a track as not a voice (the host's SetNotVoice), which is not a call of the API. */
  control?: { markNotVoice: (guid: string) => void },
): Omit<VoiceTracksApi, 'boothVoiceSet' | 'boothVoiceGet' | 'boothVoiceAdd' | 'boothPunchTarget'> {
  let state: VoiceTracksState = { layout: 'flat', narratorCharacter: '', tracks: [], narratorGuids: [], notVoiceGuids: [], ...initial };
  if (marks) marks.current = [...state.notVoiceGuids];
  const snapshot = (): VoiceTracksState => ({
    ...state,
    tracks: state.tracks.map((entry) => ({ ...entry, characters: [...entry.characters], guids: [...entry.guids] })),
    narratorGuids: [...state.narratorGuids],
    notVoiceGuids: [...state.notVoiceGuids],
  });
  if (control) {
    control.markNotVoice = (guid) => {
      const id = guid.toLowerCase();
      if (!state.notVoiceGuids.includes(id)) state = { ...state, notVoiceGuids: [...state.notVoiceGuids, id].sort() };
      if (marks) marks.current = [...state.notVoiceGuids];
    };
  }
  return {
    voiceTracksGet: async () => snapshot(),
    voiceTracksSetLayout: async (layout) => {
      if (layout !== 'flat' && layout !== 'folders') throw new Error('that voice setup is not valid: unknown layout');
      state = { ...state, layout };
      return snapshot();
    },
    voiceTracksSetCharacters: async (track, characterIds) => {
      const nameTrimmed = track.trim();
      if (!validName(nameTrimmed)) throw new Error('that voice setup is not valid: the track name');
      if (characterIds.length > 200 || !characterIds.every(validName)) throw new Error('that voice setup is not valid: a character id');
      const ids = [...new Set(characterIds)];
      const others = state.tracks.filter((entry) => entry.track !== nameTrimmed);
      const guids = state.tracks.find((entry) => entry.track === nameTrimmed)?.guids ?? [];
      const tracks = ids.length === 0 ? others : [...others, { track: nameTrimmed, characters: ids, guids }];
      tracks.sort((a, b) => (a.track < b.track ? -1 : a.track > b.track ? 1 : 0));
      state = { ...state, tracks };
      return snapshot();
    },
    voiceTracksSetNotAVoice: async (guid, notAVoice) => {
      const id = guid.trim().toLowerCase();
      if (!validName(id) || [...id].length > 64) throw new Error('that voice setup is not valid: a track GUID');
      const marked = state.notVoiceGuids.includes(id);
      if (notAVoice && !marked && state.notVoiceGuids.length >= 2000) throw new Error('that voice setup is not valid: too many tracks marked as not a voice');
      const guids = notAVoice ? [...new Set([...state.notVoiceGuids, id])].sort() : state.notVoiceGuids.filter((other) => other !== id);
      state = { ...state, notVoiceGuids: guids };
      if (marks) marks.current = [...guids];
      return snapshot();
    },
    voiceTracksSetNarrator: async (characterId) => {
      if (characterId !== '' && !validName(characterId)) throw new Error('that voice setup is not valid: a character id');
      state = { ...state, narratorCharacter: characterId };
      return snapshot();
    },
  };
}
