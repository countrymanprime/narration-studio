// A project's voice setup for recording each character on its own REAPER track (docs/prds/booth-voice-tracks.prd.md): the chapter
// layout, the characters assigned to a voice track by its name, and the character the Narrator track also voices. Kept in the
// project's <app>/voice-tracks.json (src/studio/desktop/internal/voicetracks).

/** Flat: a chapter is one track (a project with nothing saved). Folders: a chapter is a REAPER folder whose children are its voices. */
export type VoiceTracksLayout = 'flat' | 'folders';

/** The characters the narrator assigned to a voice track, by the track's name as REAPER shows it. */
export type VoiceTrackAssignment = {
  track: string;
  /** Story Bible character ids, at least one. */
  characters: string[];
};

export type VoiceTracksState = {
  layout: VoiceTracksLayout;
  /** The character the Narrator track also voices (a first-person book), or "" for none. */
  narratorCharacter: string;
  /** In track name order. A track with no assignment matches characters by name and alias, and is not listed. */
  tracks: VoiceTrackAssignment[];
};

export interface VoiceTracksApi {
  /** The project's voice setup: flat with no assignments when nothing was saved. */
  voiceTracksGet(): Promise<VoiceTracksState>;
  /** Sets the chapter layout. It converts no chapter. */
  voiceTracksSetLayout(layout: VoiceTracksLayout): Promise<VoiceTracksState>;
  /** Replaces the characters assigned to the track named `track`; an empty list clears the assignment. */
  voiceTracksSetCharacters(track: string, characterIds: string[]): Promise<VoiceTracksState>;
  /** Sets the character the Narrator track also voices, or clears it with "". */
  voiceTracksSetNarrator(characterId: string): Promise<VoiceTracksState>;
}
