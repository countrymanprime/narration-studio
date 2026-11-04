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
export function createVoiceTracksMock(initial?: Partial<VoiceTracksState>): Omit<VoiceTracksApi, 'boothVoiceSet' | 'boothVoiceGet'> {
  let state: VoiceTracksState = { layout: 'flat', narratorCharacter: '', tracks: [], ...initial };
  const snapshot = (): VoiceTracksState => ({ ...state, tracks: state.tracks.map((entry) => ({ ...entry, characters: [...entry.characters] })) });
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
      const tracks = ids.length === 0 ? others : [...others, { track: nameTrimmed, characters: ids }];
      tracks.sort((a, b) => (a.track < b.track ? -1 : a.track > b.track ? 1 : 0));
      state = { ...state, tracks };
      return snapshot();
    },
    voiceTracksSetNarrator: async (characterId) => {
      if (characterId !== '' && !validName(characterId)) throw new Error('that voice setup is not valid: a character id');
      state = { ...state, narratorCharacter: characterId };
      return snapshot();
    },
  };
}
