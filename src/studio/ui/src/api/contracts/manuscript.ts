import type { TrackMapping } from './chapterTrackMap';
export type ChapterStatus = 'not_started' | 'recording' | 'editing' | 'proofing' | 'finalized';
export type ManuscriptContentKind = 'narration' | 'opening' | 'reference';
/** Why a chapter has no recorded length: no linked track, several, the linked track is
 * not in the saved project, or no saved project could be read. */
export type RecordedUnavailable = 'unlinked' | 'multiple_tracks' | 'track_missing' | 'no_project';
/** Where a chapter's recorded-through place was read from: its current Proof result, the takes the Booth followed, or the
 * linked track's length against the chapter's words (an estimate). */
export type RecordedThroughSource = 'proof' | 'booth' | 'daw';
/**
 * How far a chapter is recorded (`internal/recordedthrough`): the last recorded word, as a paragraph and the word's index in it,
 * the share of the chapter's words up to there and whether that is the whole chapter. `confident` is false for `daw`, which is
 * an estimate the page says as "about". The one value the Booth resumes at and Production, Editing and Proof show.
 */
export type RecordedThrough = {
  paragraphId: string;
  /** The paragraph's 1-based place among the chapter's paragraphs, the ¶ number a page shows. An older host leaves it out. */
  paragraph?: number;
  word: number;
  percent: number;
  complete: boolean;
  source: RecordedThroughSource;
  confident: boolean;
};
export type ManuscriptChapter = {
  id: string;
  title: string;
  subtitle?: string;
  index: number;
  wordCount: number;
  recordedFraction?: number;
  /** The chapter's one confirmed track's recorded audio in the saved project, in seconds: the union of its unmuted items
   * on playing lanes (AR2 A). Only on the chapter list, and never an estimate. */
  recordedSeconds?: number;
  /** Set instead of `recordedSeconds` when the chapter has none, saying why. */
  recordedUnavailable?: RecordedUnavailable;
  /** How far the chapter is recorded; absent when nothing says any of it is. Only on the chapter list. */
  recordedThrough?: RecordedThrough;
  status: ChapterStatus;
  /** Omitted by manuscripts imported before structural classification. */
  contentKind?: ManuscriptContentKind;
  /** When the chapter's kind was changed after import (`manuscriptSetChapterKind`). */
  kindChangedAt?: string;
  /** Set while a chapter imported as narration has been removed from recording: list it under "Removed from recording"
   * with Restore (`manuscriptSetChapterKind(id, 'narration')`). */
  removedFromRecording?: true;
  /** The opening or closing credits, listed as chapters: no paragraphs, text from a template (`id` is `credits-opening` or `credits-closing`). */
  isCredits?: true;
  paragraphIds?: Array<{ id: string; index: number }>;
};

/**
 * `manuscriptSetChapterKind`'s answer: the chapter as the chapter list now sends it,
 * the kind it had before, and the track links a removal cleared (empty on Restore or when it had none).
 */
export type ManuscriptChapterKindResult = {
  chapter: ManuscriptChapter;
  previousKind: ManuscriptContentKind;
  clearedLinks: TrackMapping[];
};
/** Inline formatting over a paragraph's `text`. Offsets are UTF-16 code units (JS string indexes). */
export type TextSpan = { start: number; end: number; style: 'bold' | 'italic' | 'underline' };
export type ManuscriptParagraph = {
  id: string;
  chapterId: string;
  chapter: string;
  index: number;
  sourceLine?: number;
  /** May contain "\n" for author-intended line breaks. */
  text: string;
  /** Omitted by manuscripts imported before formatting was preserved. */
  spans?: TextSpan[];
  entityIds: string[];
};
export type ManuscriptNote = {
  id: string;
  chapter: string;
  chapterId?: string;
  paragraph: number;
  paragraphId?: string;
  text: string;
  createdAt: string;
  anchorStart?: number;
  anchorEnd?: number;
  anchorText?: string;
};
export type ReaderState = { activeChapter?: string; activeSourceLine?: number; expandedChapters?: string[] };
// `matchStart` is the excerpt's own match offset (UTF-16 code units), added for the windowing helper
// - additive, so no hostAPIVersion bump (this shape carries inside a map[string]any-style payload, not a fixed
// binding signature).
export type SearchHit = {
  chapter: string;
  chapterId?: string;
  paragraph: number;
  paragraphId?: string;
  sourceLine?: number;
  excerpt: string;
  matchStart?: number;
};
export type ManuscriptImportSection = {
  id: string;
  title: string;
  /** What follows the title in the heading ("CHAPTER ONE / Bad Ideas..."): the first paragraph's, which is what the written chapter gets. Omitted when there is none. */
  subtitle?: string;
  /**
   * Where the subtitle's line goes if the narrator says it is not a subtitle: `title` joins it to the title (a title wrapped onto two
   * lines), `body` makes it the chapter's first paragraph (a line of plain text under a plain-text heading, an epigraph say). Sent with
   * every subtitle, omitted with none.
   */
  subtitleOff?: 'title' | 'body';
  contentKind: ManuscriptContentKind;
  paragraphCount: number;
  /** The words in the section's paragraphs as the importer read them; absent from a host that predates the outline's Words column. */
  wordCount?: number;
  /** How the section's text begins, cut with an ellipsis; omitted for a section with no text. */
  firstText?: string;
};
export type ManuscriptCharacterCandidate = {
  id: string;
  name: string;
  description: string;
  sourceSectionId: string;
  /** How often the character's first name stands alone in the story, counted by the host (whole words, any script). Absent from a host that predates it. */
  appearances?: number;
  /** Labelled facts captured from the manuscript's cast block ("Codename": "Wren"), in source order. Omitted when there are none. */
  properties?: Array<{ key: string; value: string }>;
};
export type ManuscriptImportSelection = {
  sectionKinds?: Record<string, ManuscriptContentKind>;
  characterCandidateIds?: string[];
  /** The review's "Read a heading's second line as its subtitle" default (true when unset). Review state only: the commit sends it resolved into `subtitleOverrides`. */
  subtitleDefault?: boolean;
  /** Per section id, whether its subtitle is one. In the review, the rows the narrator set by hand; on the wire, every section whose subtitle is turned off, as `false`. */
  subtitleOverrides?: Record<string, boolean>;
};
export type ManuscriptImportPreview = {
  // `pdf` remains readable for a pre-migration canonical manuscript, but the
  // native picker and shipped importer currently reject new PDF imports.
  format: 'docx' | 'markdown' | 'txt' | 'epub' | 'pdf';
  sourceName: string;
  paragraphCount: number;
  chapterTitles: string[];
  sections?: ManuscriptImportSection[];
  characterCandidates?: ManuscriptCharacterCandidate[];
  /** What the importer repaired in the source (a title and subtitle it found run together), as sentences. Omitted when it repaired nothing. */
  notices?: string[];
};
export type ManuscriptFileSelection = { selected: boolean; jobId?: string };
/** The `manuscript:dropped` event: what became of a file dropped on the import's drop zone. The host checks the file and starts the import itself, so it names the file and the job, never the path. */
export type ManuscriptDropped = { jobId: string; name: string } | { message: string };
export type ManuscriptReader = { chapters: ManuscriptChapter[]; paragraphs: ManuscriptParagraph[]; notes: ManuscriptNote[] };
export type WorkJob = {
  id: string | null;
  /** The wire kinds are the first two; the others are client-side jobs shown in the same work dialog (a download, the update, a recording check, the pickup and duplicate scan, the take comparison). */
  kind: 'manuscript_import' | 'story_bible' | 'app_update' | 'asset_install' | 'recording_coverage' | 'take_review' | 'take_comparison';
  phase: 'idle' | 'preparing' | 'ready' | 'committing' | 'running' | 'success' | 'cancelled' | 'error';
  message: string;
  percent: number;
  /** The bytes so far ("44 of 109 MB"), shown next to the message but never announced: it changes on nearly every poll. */
  detail?: string;
  logs: string[];
  elapsed: number;
  preview?: ManuscriptImportPreview | null;
  requiresReset?: boolean;
  result?: { id?: string; format?: string; sourceName?: string; importedAt?: string; message?: string } | null;
  error?: string;
};

export interface ManuscriptApi {
  selectManuscript(): Promise<ManuscriptFileSelection>;
  /** Begins an import for the file offered as `Bootstrap.manuscriptCandidate`; the host accepts only that exact path. */
  manuscriptBeginImport(path: string): Promise<ManuscriptFileSelection>;
  /** Calls `onDropped` when a file is dropped on the import's drop zone (desktop only). A `jobId` is an import already begun; a `message` says in words why the file cannot be imported. */
  subscribeManuscriptDropped(onDropped: (event: ManuscriptDropped) => void): () => void;
  manuscriptImportState(jobId: string): Promise<WorkJob>;
  manuscriptImportPreview(jobId: string, options: { markdownHeadingLevel: number }): Promise<WorkJob>;
  manuscriptImportCommit(jobId: string, options: { confirmedReset: boolean; selection?: ManuscriptImportSelection }): Promise<WorkJob>;
  manuscriptImportCancel(jobId: string): Promise<void>;
  clearProjectData(): Promise<void>;
  manuscriptChapters(): Promise<ManuscriptChapter[]>;
  manuscriptParagraphs(chapter: string): Promise<ManuscriptParagraph[]>;
  manuscriptSearch(query: string): Promise<SearchHit[]>;
  manuscriptSetChapterStatus(chapter: string, status: ChapterStatus): Promise<ManuscriptChapter>;
  /**
   * Remove a chapter from recording (`reference`, or `opening` for Front Matter) or Restore it (`narration`). Nothing is
   * deleted: ids, text, status, notes and results stay. Refused for the last narration chapter and while an import runs.
   */
  manuscriptSetChapterKind(chapterId: string, kind: ManuscriptContentKind): Promise<ManuscriptChapterKindResult>;
  noteList(chapter?: string): Promise<ManuscriptNote[]>;
  manuscriptReader(): Promise<ManuscriptReader>;
  readerState(): Promise<ReaderState>;
}
