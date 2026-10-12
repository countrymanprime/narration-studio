import type { AssetInstallState } from './assets';
import type { TtsInstallState, TtsVoice } from './tts';
import type { WorkJob } from './manuscript';

export type GuideEvidence = { chapter: string; chapterId?: string; paragraph: number; paragraphId?: string; excerpt: string; sourceLine?: number };
export type GuideRelationship = { id: string; name: string; label: string };
/** Where the narrator was with a pronunciation (ADR 0346, superseded by ADR 0792): read from an older file, set no longer; the Booth still
 * prints it until its swap (SNO-10). */
export type GuidePronunciationStatus = 'researched' | 'query_sent' | 'author_confirmed';
/** The pronunciation itself, without the narrator's bookkeeping about it. */
export type GuidePronunciationValue = { ipa: string; source: string; confidence: string };
/**
 * A name's pronunciation. `source` is `manual` for one the narrator typed (ADR 0792; a file written before it says `user`, which still parses). `alternate` is the one of the other kind (the narrator's own
 * or a dictionary's) kept beside it, so switching back is lossless. The schema fills `status` (`researched` on an entry written before it).
 */
export type GuidePronunciation = GuidePronunciationValue & {
  chosen?: boolean;
  status?: GuidePronunciationStatus;
  note?: string;
  alternate?: GuidePronunciationValue;
};
export type GuideNote = { text: string; evidence: { chapter?: string; excerpt?: string } };
/** One labelled fact of an entry ("Codename": "Wren"). The list is ordered and a key is unique whatever its case; a value may be empty. */
export type GuideProperty = { key: string; value: string };
/** One (chapter, scene) pair an entry's evidence touches. A scene restarts at 0 for each new chapter; a scene-break paragraph (e.g. "* * *") starts the next one. */
export type GuideAppearance = { chapterId: string; chapter: string; sceneIndex: number };
export type GuideAlias = { text: string; pronunciation: GuidePronunciation; occurrences: GuideEvidence[] };
/** What still needs the narrator's look: the entry itself, and the alias texts. The host reads it from `review_state` for a file written before it. */
export type GuideReview = { entry: boolean; aliases: string[] };
export type GuideEntity = {
  id: string;
  canonical_name: string;
  aliases: GuideAlias[];
  category: string;
  occurrences: GuideEvidence[];
  occurrence_count: number;
  pronunciation: GuidePronunciation;
  description: GuideNote;
  personality_notes: GuideNote[];
  relationships: GuideRelationship[];
  /** The narrator's ordered facts about the entry, filled by hand or from the labelled lines of an imported cast block; empty when there are none. */
  properties: GuideProperty[];
  locked: boolean;
  review_state: string;
  context?: string;
  /** Which chapters and scenes this entry's evidence touches (see `GuideDialogueCue`). Absent on a file written before it existed. */
  appearances?: GuideAppearance[];
  /** The review flags (SNB-3b). Absent only from an older host. */
  review?: GuideReview;
  /** The narrator's speaker colour, 1..7 (`--speaker-N`, ADR 0367), which wins over the stable pick; absent means automatic. */
  speaker_color?: number;
};

/** The colours a Story Bible type can take: the six kind hues (green `--character`, blue `--place`, violet `--org`, amber `--lore`,
 * teal `--item`, rose `--event`). */
export const GUIDE_TYPE_COLOURS = ['green', 'blue', 'violet', 'amber', 'teal', 'rose'] as const;
export type GuideTypeColour = (typeof GUIDE_TYPE_COLOURS)[number];
/** One Story Bible type (SN-B95): the name an entry's `category` takes, its colour, and whether its entries speak (can be a line's
 * speaker and have a speaker colour). A Story Bible with no list of its own has the defaults: Character (speaks), Place, Organization,
 * Lore, Item and Event. `Needs Review` and `Draft` are the Story Bible's own states, never a type. */
export type GuideType = { name: string; colour: GuideTypeColour; speaks: boolean };

export type GuidePreview =
  | { status: 'ready'; audioBase64: string; mimeType: string }
  | {
      status: 'asset_required';
      voice: Omit<TtsVoice, 'downloadSize' | 'installState'>;
      installState: TtsInstallState;
      downloadSize: number;
      diskSize: number;
      installPath: string;
    };

/** A spaCy language model as the host describes it before it is installed. */
export type LanguageModel = {
  id: string;
  provider: string;
  displayName: string;
  description: string;
  version: string;
  publisher: string;
  license: string;
  licenseUrl: string;
  modelCardUrl: string;
  provenanceUrl: string;
  attribution: string;
};

/** The answer to starting a build: it started, or the language model it needs is not installed and the narrator is asked (download, rules-only this once, cancel). */
export type GuideBuildResult =
  | { status: 'started'; job: WorkJob }
  | { status: 'asset_required'; model: LanguageModel; installState: AssetInstallState; downloadSize: number; diskSize: number; installPath: string };

/** What a merge answers: the id `guideUnmerge` takes it back by (16 lowercase hexadecimal characters). */
export type GuideMergeResult = { undoId: string };

/** One entry of the Story Bible's dialogue_cues: a quoted span with
 * its resolved (or unknown) speaker. A document-level list, a sibling of the entity list, not per-entity data. */
export type GuideDialogueCueEvidence = { chapterId: string; paragraphId: string; excerpt: string; tag: string };
export type GuideDialogueCueSpeakerSource = 'tag' | 'continuation' | 'unknown' | 'correction';
export type GuideDialogueCue = {
  id: string;
  chapterId: string;
  paragraphId: string;
  quote_start: number;
  quote_end: number;
  quote_text: string;
  speaker_entity_id: string | null;
  speaker_source: GuideDialogueCueSpeakerSource;
  evidence: GuideDialogueCueEvidence;
  corrected: boolean;
};

export interface StoryBibleApi {
  /**
   * Starts the Story Bible build with the language model the narrator selected, or answers `asset_required` when that model is not
   * installed (the first-use gate). `rulesOnly` builds without a model for this run: lower quality, chosen by the narrator.
   */
  guideBuild(options?: { rulesOnly?: boolean }): Promise<GuideBuildResult>;
  guideBuildState(): Promise<WorkJob>;
  guideEntities(): Promise<GuideEntity[]>;
  guideEdit(id: string, values: Record<string, string>): Promise<void>;
  guideSetLocked(id: string, locked: boolean): Promise<void>;
  guideRescan(id: string): Promise<void>;
  guideCreate(name: string, category: string, aliases: string[]): Promise<string>;
  /** Folds the source entry into the target (names with their say-values, relationships re-pointed, Appears in unioned) and deletes the
   * source; one undo step, taken back by `guideUnmerge` with the answer's id. */
  guideMerge(sourceId: string, targetId: string): Promise<GuideMergeResult>;
  /** Takes back one merge: both entries, every re-pointed relationship and the names the merge absorbed, as they were. Rejects with the
   * reason, changing nothing, when the target or a re-pointed entry changed since, or the merge is gone (undone, a rebuild, ten newer). */
  guideUnmerge(undoId: string): Promise<void>;
  guideDelete(id: string): Promise<void>;
  guideRelate(id: string, otherId: string, label: string): Promise<void>;
  guideUnrelate(id: string, otherId: string, label: string): Promise<void>;
  guidePreview(id: string, aliasIndex?: number): Promise<GuidePreview>;
  /**
   * Sets the pronunciation of the entry's own name (`aliasIndex` omitted) or one of its aliases from exactly `source`
   * (a registered source id: "cmu", "wiktextract" or "espeak"), and marks it as the narrator's explicit choice so a rebuild keeps it. Refused
   * on a locked entity, and when the chosen engine has nothing for the name.
   */
  guidePronounce(id: string, source: string, aliasIndex?: number): Promise<void>;
  /** Sets the narrator's own pronunciation (source `manual`); the one it replaces is kept as the alternate. Never asks a dictionary. */
  guidePronounceUser(id: string, ipa: string, aliasIndex?: number): Promise<void>;
  /** Puts the kept alternate back in use, keeping the one it replaces: lossless both ways. */
  guidePronunciationUseAlternate(id: string, aliasIndex?: number): Promise<void>;
  /** The Story Bible's extracted dialogue cues: one entry per quoted
   * span, with its resolved or unknown speaker. */
  guideDialogueCues(): Promise<GuideDialogueCue[]>;
  /**
   * Records the narrator's own attribution for one dialogue cue. `speakerEntityId` of `"unknown"` or `""` clears
   * the cue back to unknown. A rebuild never overwrites a correction (mirroring the entity lock guard, ADR 0007).
   */
  guideCorrectCue(cueId: string, speakerEntityId: string): Promise<void>;
  /** Clears the review flags of the entry and every name (`aliasIndex` omitted), or of one name; the entry is reviewed when nothing is left. Refused on a locked entry. */
  guideMarkReviewed(id: string, aliasIndex?: number): Promise<void>;
  /** Flags the entry (`aliasIndex` omitted), or one name, as needing review: the undo of `guideMarkReviewed`. A set flag stays as it is. Refused on a locked entry. */
  guideFlagReview(id: string, aliasIndex?: number): Promise<void>;
  /** Sets a speaking entry's speaker colour, 1..7; null or 0 puts it back to automatic. Refused outside 0..7, on a locked entry and for an entry whose type cannot speak. */
  guideSetSpeakerColor(id: string, index: number | null): Promise<void>;
  /** The Story Bible's types, in order (the defaults until the narrator changes one). Read it again after each change below. */
  guideTypes(): Promise<GuideType[]>;
  /** Adds a type at the end, with the next colour, that does not speak. Refused for an empty, taken (whatever its case) or reserved name. */
  guideTypeAdd(name: string): Promise<void>;
  /** Renames a type and moves every entry of it, a locked one too. Refused for an empty, taken or reserved name. */
  guideTypeRename(name: string, to: string): Promise<void>;
  guideTypeSetColour(name: string, colour: GuideTypeColour): Promise<void>;
  /** Whether the type's entries speak; the dialogue cues follow on the next build. */
  guideTypeSetSpeaks(name: string, speaks: boolean): Promise<void>;
  /** Removes a type no entry uses. The last type cannot be removed. */
  guideTypeRemove(name: string): Promise<void>;
}
