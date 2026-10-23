// The narrator's voice samples: stretches of a take marked as how a character sounds, each copied into the project's
// narration-studio/voice-samples/ folder with a record of where it came from (src/studio/desktop/internal/voicesample,
// docs/prds/character-voice-samples.prd.md). The host finds the audio file in the saved REAPER project by item and take GUID, so a
// request names ids, word keys and seconds and never a path, and an answer carries the words and a state for where a sample came
// from, never the file or the GUIDs.

/** The limits the owner decided; the host checks them and sends them in every list so a page can show them. */
export const VOICE_SAMPLE_LABEL_MAX = 60;
export const VOICE_SAMPLE_NOTE_MAX = 500;

/** Whether the clip is still the file that was saved. `hash_changed` is found only when the clip is served, never on a list. */
export type VoiceSampleClipState = 'ok' | 'missing' | 'size_changed' | 'hash_changed';

/** Whether the words the sample was marked on still read as they did, checked against the current manuscript on every read. */
export type VoiceSampleSourceState = 'ok' | 'text_changed' | 'chapter_missing';

/** Why the host refused: a mark can be refused for the first eleven, an update for `character_limit` or `not_found`. */
export type VoiceSampleRefusalReason =
  | 'stale_alignment'
  | 'not_heard'
  | 'spans_takes'
  | 'spans_cut'
  | 'too_short'
  | 'too_long'
  | 'unsupported_source'
  | 'source_missing'
  | 'project_unreadable'
  | 'character_limit'
  | 'project_limit'
  | 'not_found';

/** The sentence the host sends with each refusal (src/studio/desktop/internal/voicesample's `sentence`), so a page that refuses before it asks says the same words. */
export const VOICE_SAMPLE_SENTENCES: Record<VoiceSampleRefusalReason, string> = {
  stale_alignment: 'The recording changed since this chapter was checked. Check it again, then mark the sample.',
  not_heard: 'These words were not heard in the recording.',
  spans_takes: 'Choose words inside one take.',
  spans_cut: 'Restore the cut words or choose words without them.',
  too_short: 'A sample is at least half a second.',
  too_long: 'A sample is at most 30 seconds.',
  unsupported_source: 'Only WAV recordings can be copied.',
  source_missing: 'The audio file for these words is missing.',
  project_unreadable: 'The saved REAPER project could not be read. Save the project in REAPER, then try again.',
  character_limit: 'This character already has 20 samples. Delete one first.',
  project_limit: 'Voice samples already use the 200 MiB a project may hold. Delete one first.',
  not_found: 'That voice sample is no longer there.',
};

export type VoiceSampleSource = {
  chapterId: string;
  /** Empty when the chapter is no longer in the manuscript. */
  chapterTitle: string;
  /** The words as they were marked. */
  text: string;
  /** `paragraphId:ordinal` of the first and last word. */
  startKey: string;
  endKey: string;
  state: VoiceSampleSourceState;
};

export type VoiceSample = {
  /** 32 lowercase hex characters. */
  id: string;
  characterId: string;
  label: string;
  note: string;
  /** At most one sample of a character is primary: the one the quick play uses. */
  primary: boolean;
  createdAt: string;
  durationMs: number;
  bytes: number;
  clipState: VoiceSampleClipState;
  source: VoiceSampleSource;
};

export type VoiceSampleLimits = {
  minSeconds: number;
  maxSeconds: number;
  perCharacter: number;
  projectBytes: number;
  labelUnits: number;
  noteUnits: number;
};

/** Every sample, sorted by character, then primary first, then newest. */
export type VoiceSamples = {
  samples: VoiceSample[];
  totals: { count: number; bytes: number };
  limits: VoiceSampleLimits;
};

/**
 * What the page sends to mark a stretch. `sourceStart` and `sourceEnd` are seconds in the item's source file, from the playlist
 * segment under the first and last heard word; the keys are `paragraphId:ordinal`; `alignmentRecordId` is the recording check
 * record the word times came from.
 */
export type VoiceSampleMarkRequest = {
  chapterId: string;
  itemGuid: string;
  takeGuid: string;
  sourceStart: number;
  sourceEnd: number;
  startKey: string;
  endKey: string;
  characterId: string;
  label: string;
  note: string;
  makePrimary: boolean;
  alignmentRecordId: string;
};

export type VoiceSampleChange = { label: string; note: string; characterId: string };

/** What a mark or an update answers: the sample, or why the host refused (nothing was saved) with the sentence to show. */
export type VoiceSampleAnswer = { status: 'saved'; sample: VoiceSample } | { status: 'refused'; reason: VoiceSampleRefusalReason; message: string };

/** What a remove took away. */
export type VoiceSamplesRemoved = { removed: number; bytes: number };

/** The `voice_samples_changed` event: the revision rises with every change the host makes, and the page reads the list again. */
export type VoiceSamplesChanged = { revision: number };

export interface VoiceSamplesApi {
  /** Every sample with its clip and provenance state, what they add up to and the limits. Creates nothing. */
  voiceSamplesList(): Promise<VoiceSamples>;
  /** Copies the stretch into a clip and stores it. A stretch that cannot be copied is a refused answer, not a rejection. */
  voiceSampleMark(request: VoiceSampleMarkRequest): Promise<VoiceSampleAnswer>;
  /** Changes a sample's label, note and character. */
  voiceSampleUpdate(id: string, change: VoiceSampleChange): Promise<VoiceSampleAnswer>;
  /** Makes a sample its character's primary and answers the list. */
  voiceSampleSetPrimary(id: string): Promise<VoiceSamples>;
  /** Deletes a sample and its clip. A sample that is not there is not an error: `removed` is then 0. */
  voiceSampleRemove(id: string): Promise<VoiceSamplesRemoved>;
  /** Deletes every sample and every clip in the project. */
  voiceSamplesRemoveAll(): Promise<VoiceSamplesRemoved>;
  /**
   * Where a sample's clip plays from, built from its id alone: synchronous, not a request, and never a file path. The host serves the
   * clip only for an id it lists and only while the file is the one that was saved, so a bad id or a changed clip is a failed load.
   */
  voiceSampleMediaUrl(id: string): string;
  /** Called after any change to the samples (a mark, an update, a remove, Clear project data). The page reads the list again. */
  subscribeVoiceSamples(onChange: (event: VoiceSamplesChanged) => void): () => void;
}
