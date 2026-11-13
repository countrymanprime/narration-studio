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
  /** The tracks (GUIDs, lower case) this assignment was seen on: a track renamed to a name no assignment has keeps it. */
  guids: string[];
};

export type VoiceTracksState = {
  layout: VoiceTracksLayout;
  /** The character the Narrator track also voices (a first-person book), or "" for none. */
  narratorCharacter: string;
  /** In track name order. A track with no assignment matches characters by name and alias, and is not listed. */
  tracks: VoiceTrackAssignment[];
  /** The tracks (GUIDs, lower case) that were named Narrator: renaming the Narrator track keeps it key 0. */
  narratorGuids: string[];
};

/**
 * What `BoothVoiceSet` did, or what `BoothVoiceGet` reads (src/studio/desktop/bindings_booth_voice.go): `selected`, the next take (or,
 * for a read, the take this app records now) records on `trackGuid`; `switched`,
 * the take this app started records on `trackGuid` from `at` (project seconds); `refused`, nothing changed and `message` says why.
 */
export type BoothVoice = {
  outcome: 'selected' | 'switched' | 'refused';
  reason?:
    | 'flat'
    | 'not_a_voice'
    | 'no_voices'
    | 'unlinked'
    | 'several_links'
    | 'track_missing'
    | 'standalone'
    | 'not_running'
    | 'failed'
    | 'unsupported'
    | 'timeout'
    | 'not_our_recording'
    | 'already_recording'
    | 'playing';
  message?: string;
  trackGuid?: string;
  /** `selected` from `BoothVoiceSet` only: the DAW's armed track is now this voice (#3429). When the DAW refused, `reason` and `message`
   * say so on a `selected` answer: the Booth still records on the voice, but the DAW's arms did not change. */
  armed?: boolean;
  at?: number;
  /** `BoothVoiceGet` only: the voices the Booth added to the chapter's folder this session (`BoothVoiceAdd`) that the saved project
   * does not hold yet. The page lists them after the folder's saved children until the narrator saves in the DAW. */
  added?: BoothVoiceTrack[];
};

/** A voice track the Booth added this session: its GUID and the name the DAW gave it. */
export type BoothVoiceTrack = { guid: string; name: string };

/**
 * What `BoothVoiceAdd` did (src/studio/desktop/boothvoiceadd.go): `added`, a track named `name` is the chapter folder's last child, the
 * characters are assigned to it and it is the voice the next take records on; `refused`, nothing was added or assigned and `message`
 * says why (`recording` while a take runs, `name_taken` for a name a voice of the folder has, `no_name`, `invalid` past the limits).
 */
export type BoothVoiceAdded = {
  outcome: 'added' | 'refused';
  reason?: BoothVoice['reason'] | 'no_name' | 'name_taken' | 'invalid' | 'recording';
  message?: string;
  trackGuid?: string;
  name?: string;
};

/**
 * Where a passage was recorded before, from `BoothPunchTarget` (src/studio/desktop/bindings_booth_punch.go): `found`, it plays from `start`
 * to `end` (project seconds) on the track `trackGuid` (named `trackName`), the voice that read it; `never_recorded`, none of it was heard,
 * so the take continues instead of punching; `refused`, `message` says why (no recording check, a stale one, the DAW not answering, part of
 * the passage cut, several voices) and nothing is guessed.
 */
export type BoothPunch = {
  outcome: 'found' | 'never_recorded' | 'refused';
  reason?: string;
  message?: string;
  trackGuid?: string;
  trackName?: string;
  start?: number;
  end?: number;
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
  /** Chooses the voice the Booth records the chapter on, by a voice track's GUID that must be a direct child of the chapter's linked
   * folder; during a take this app started it switches the take live. Sent only from a voice key or a press in the voice list. */
  boothVoiceSet(chapterId: string, trackGuid: string): Promise<BoothVoice>;
  /** The voice the host records the chapter on: the one chosen this session while it is still a voice of the chapter's folder, else
   * its Narrator voice. Refused, as a record start would be, for a flat, unlinked or empty-folder chapter. */
  boothVoiceGet(chapterId: string): Promise<BoothVoice>;
  /** Adds a voice track named `name` inside the chapter's linked folder, after its last child, assigns `characterIds` to it (added to
   * any the name already has) and chooses it. Sent only from the Booth's "Who is in Num N?" dialog, never during this app's take. */
  boothVoiceAdd(chapterId: string, name: string, characterIds: string[]): Promise<BoothVoiceAdded>;
  /** Where the words `fromWord` to `toWord` (inclusive, 0-based) of the paragraph were recorded before, so a take can record over them. Read-only. */
  boothPunchTarget(chapterId: string, paragraphId: string, fromWord: number, toWord: number): Promise<BoothPunch>;
}
