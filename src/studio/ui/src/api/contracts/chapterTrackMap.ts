/** One narrator-confirmed trackGuid -> chapterId link (the analysis evidence ledger). ChapterTitle is the
 * chapter's title *at confirmation time*, stored beside the id because chapter ids reset on every manuscript
 * re-import; it is what a re-suggestion can match against the new chapter list. */
export type TrackMapping = {
  trackGuid: string;
  chapterId: string;
  chapterTitle: string;
  confirmedAt: string;
  /** Who made the link: the narrator, or chapter sync once the narrator
   * consented for the project. Both are links. The host always sends it; it is optional here only so hand-built fixtures that
   * predate it still type-check, and a missing one means `manual`. */
  origin?: TrackLinkOrigin;
  /** How an automatic link matched; `null` for a manual one. */
  match?: TrackLinkMatch | null;
};

export type TrackLinkOrigin = 'manual' | 'auto';

/** An automatic link's basis: the matcher's score and whether the track name matched exactly, as the one title it is a
 * whole-token prefix of, or because the track held this chapter's title before a manuscript re-import. */
export type TrackLinkMatch = {
  score: number;
  kind: 'exact' | 'contained' | 'previous-link';
};

/** Every confirmed link for one manuscript document (the store is keyed by `documentId`). */
export type ChapterTrackMapping = {
  documentId: string;
  mappings: TrackMapping[];
};

/** How sure the chapter-to-track matcher is of a chapter's track: a narrator-confirmed link, a confident name
 * match, a guess the narrator must confirm, a tie, or nothing. */
export type ChapterTrackMatchStatus = 'confirmed' | 'matched' | 'uncertain' | 'ambiguous' | 'none';

/** What made a track a candidate. */
export type ChapterTrackMatchSource = 'confirmed' | 'track-name' | 'region-name';

/** Something the narrator should see beside the result. */
export type ChapterTrackMatchWarning = 'confirmed-track-missing' | 'confirmed-track-renamed' | 'confirmed-links-conflict';

/** One track that may hold the chapter; `region` is the project region it was found through, if any. */
export type ChapterTrackCandidate = {
  trackGuid: string;
  trackName: string;
  trackIndex: number;
  score: number;
  source: ChapterTrackMatchSource;
  region: { name: string; start: number; end: number } | null;
};

/** Where a track's recorded audio ends, as of the .rpp's last save: in project time, and in the source file the last
 * item plays (SECTION start + SOFFS + length * PLAYRATE), which starts at `sourceStart` (SECTION start + SOFFS).
 * `approximate` when stretch markers or a looping section make the source time inexact. */
export type RecordedEnd = {
  projectTime: number;
  itemGuid: string;
  takeGuid: string;
  sourceFile: string;
  sourceStart: number;
  sourceTime: number;
  sourceAvailable: boolean;
  supported: boolean;
  approximate: boolean;
};

/** ChapterTrackMatch's answer. `track` and `recordedEnd` are set only for a confirmed or matched chapter; otherwise the
 * narrator picks from `candidates` (best first) or `tracks` (every track). Nothing is ever created. */
export type ChapterTrackMatch = {
  chapterId: string;
  chapterTitle: string;
  projectFile: string;
  /** The .rpp's modification time: the UI labels the result "as of last save". */
  savedAt: string;
  status: ChapterTrackMatchStatus;
  track: ChapterTrackCandidate | null;
  candidates: ChapterTrackCandidate[];
  warnings: ChapterTrackMatchWarning[];
  tracks: Array<{ guid: string; name: string; index: number; depth: number; isFolder: boolean; hasAudio: boolean }>;
  recordedEnd: RecordedEnd | null;
};

/** ChapterTrackSet's answer: the chapter's one link as written, the link the track held for
 * another chapter before (null when the track was free), and every link that remains. */
export type ChapterTrackSetResult = {
  documentId: string;
  link: TrackMapping;
  displaced: TrackMapping | null;
  mappings: TrackMapping[];
};

/** ChapterTrackCreate's answer: a new track named after the chapter was added at the end of the DAW project (not saved) and
 * linked to the chapter, as ChapterTrackSet links one; or a refusal that changed nothing. `unsupported` is an engine that cannot
 * add a track from this app (the sentence says what to do in it instead). In a Voice folders project on an engine with folders the
 * track is a folder and `voice` is the Narrator track the DAW added inside it (#2840); a plain track has no `voice`. */
export type ChapterTrackCreateReason =
  | 'standalone'
  | 'not_running'
  | 'recording'
  | 'unsupported'
  | 'failed'
  /** The chapter already has a track the project has (or one this app just added): nothing was added. */
  | 'already_linked'
  /** A track or folder already has the name the new one would get: link it with the picker. */
  | 'name_taken'
  /** The DAW added the track but its link was not saved: the sentence names the track to link by hand. */
  | 'link_failed';
export type CreatedTrack = { guid: string; name: string; index: number };
export type ChapterTrackCreateResult =
  | (ChapterTrackSetResult & { outcome: 'created'; track: CreatedTrack; voice?: CreatedTrack })
  | { outcome: 'refused'; reason: ChapterTrackCreateReason; message: string };

/** TrackSelectInReaper's answer: "Select in REAPER" from the chapter track
 * slide-over. `refused` reasons mirror ReadAloudRecording's connection cases, plus `track_missing`
 * for a track no longer in the project; nothing in REAPER changes for a refusal. */
export type TrackSelectOutcome = 'selected' | 'refused';
export type TrackSelectReason = 'track_missing' | 'standalone' | 'not_running' | 'unsupported' | 'failed';
export type TrackSelectResult = {
  outcome: TrackSelectOutcome;
  reason?: TrackSelectReason;
  message?: string;
  trackGuid?: string;
};

/** Whether the saved .rpp could be read: ready, none found, several found and none chosen, or unreadable. */
export type ChapterTrackLinksProject = 'ready' | 'none' | 'choose' | 'error';

/** One track's facts as of the .rpp's last save. `playableCount` counts supported items whose source is present;
 * `span` runs from the first item's start to the last item's end (null with no items); `linkedChapterId` is the chapter
 * the track is confirmed for, '' when none. */
export type ChapterTrackSummary = {
  guid: string;
  index: number;
  name: string;
  color: string;
  muted: boolean;
  soloed: boolean;
  /** Folders the track sits inside, and whether it is a folder parent (see Track). */
  depth: number;
  isFolder: boolean;
  itemCount: number;
  playableCount: number;
  missingSourceCount: number;
  unsupportedCount: number;
  span: { start: number; end: number } | null;
  linkedChapterId: string;
};

/** One narration chapter's link state: the matcher's answer, every confirmed link it holds (a missing track's too), and
 * where the matched track's audio ends. */
export type ChapterTrackLink = {
  chapterId: string;
  chapterTitle: string;
  status: ChapterTrackMatchStatus;
  track: ChapterTrackCandidate | null;
  candidates: ChapterTrackCandidate[];
  warnings: ChapterTrackMatchWarning[];
  links: TrackMapping[];
  recordedEnd: RecordedEnd | null;
  /** The direct children of the folder the chapter's track is, in REAPER's order; empty when it is not a folder. The one answer
   * every page reads for what a chapter's folder holds. `isVoice` is false for a track another chapter is linked to. */
  members: ChapterMember[];
};

/** One direct child of a chapter's linked folder. */
export type ChapterMember = { guid: string; name: string; isVoice: boolean };

/** ChapterTrackLinks' answer: every narration chapter and every track from one parse of the saved .rpp. When `project`
 * is not ready, `message` says why, `tracks` is empty and each chapter's status is `none`, with its links still listed. */
export type ChapterTrackLinks = {
  project: ChapterTrackLinksProject;
  message: string;
  projectFile: string;
  savedAt: string;
  tracks: ChapterTrackSummary[];
  chapters: ChapterTrackLink[];
};

/** What a planned region is: the opening or closing credits (named like the chapter table's rows) or a narration chapter. */
export type ChapterRegionKind = 'opening' | 'chapter' | 'closing';

/** What create_regions is expected to do with a row, judged against the saved .rpp's regions: add it, leave a matching
 * region alone, move the one region with its title (an update run only) or leave several with its title alone (an
 * update run only). Without update, a `moves` or `ambiguous` row adds a second region with that title. */
export type ChapterRegionState = 'new' | 'exists' | 'moves' | 'ambiguous';

/** One region the plan asks REAPER for, bounded by its track's first item start and last item end (project seconds). */
export type ChapterRegionRow = {
  kind: ChapterRegionKind;
  /** Empty for a credits row. */
  chapterId: string;
  title: string;
  trackGuid: string;
  trackName: string;
  start: number;
  end: number;
  state: ChapterRegionState;
};

/** A chapter or credits entry that gets no region, and why. */
export type ChapterRegionSkip = {
  kind: ChapterRegionKind;
  chapterId: string;
  title: string;
  reason: string;
};

/** ChapterRegionsPreview's answer: rows run opening credits, the linked chapters in book order, then closing credits.
 * When `project` is not ready, `message` says why and both lists are empty. Nothing is written. */
export type ChapterRegionPlan = {
  project: ChapterTrackLinksProject;
  message: string;
  projectFile: string;
  savedAt: string;
  rows: ChapterRegionRow[];
  skipped: ChapterRegionSkip[];
};

/** ChapterRegionsCreate's answer: the rows sent and REAPER's counts (create_regions). */
export type ChapterRegionsCreated = {
  sent: number;
  created: number;
  existing: number;
  invalid: number;
  updated: number;
  ambiguous: number;
  failed: number;
};

/** One track whose folder moving nested chapters out changes (`ChapterFoldersCheck`, src/studio/desktop/chapterfolders.go): the
 * track, the chapter linked to it (absent for a voice or other track) and its old and new folder (empty for the top level). */
export type ChapterFolderMove = {
  trackGuid: string;
  trackName: string;
  chapterId?: string;
  fromGuid: string;
  fromName: string;
  toGuid: string;
  toName: string;
};

/** `ChapterFoldersCheck` / `ChapterFoldersRepair` (#2838): `clean`, no chapter sits inside another's folder; `nested`, `moves` would put
 * it right and `expected` is what to send to the repair; `repaired`; `stale`, the project changed since the check; `refused`, nothing
 * changed and `message` says why. */
export type ChapterFolders = {
  outcome: 'clean' | 'nested' | 'repaired' | 'stale' | 'refused';
  reason?: 'standalone' | 'not_running' | 'recording' | 'unsupported' | 'failed';
  message?: string;
  moves: ChapterFolderMove[];
  expected: string[];
};

export interface ChapterTrackMapApi {
  chapterTrackMapList(): Promise<ChapterTrackMapping>;
  /** Confirms trackGuid as chapterId's link; refuses a chapterId outside the current manuscript. */
  chapterTrackMapConfirm(trackGuid: string, chapterId: string): Promise<TrackMapping>;
  /** Makes trackGuid chapterId's one link, replacing its old one; `displaced` names the chapter the track was taken from. */
  chapterTrackSet(chapterId: string, trackGuid: string): Promise<ChapterTrackSetResult>;
  /** Adds a track named after chapterId in the DAW (at the end, unsaved) and links it as chapterTrackSet would; a DAW that cannot is a refusal. */
  chapterTrackCreate(chapterId: string): Promise<ChapterTrackCreateResult>;
  /** Asks the DAW whether a linked chapter's track sits inside another linked chapter's folder, and what a repair would move; writes nothing. */
  chapterFoldersCheck(): Promise<ChapterFolders>;
  /** Moves the chapters a check listed (its `expected`) out of those folders, in one DAW undo point, only when the DAW plans the same moves. */
  chapterFoldersRepair(expected: string[]): Promise<ChapterFolders>;
  /** Clears every link chapterId holds and returns the links that remain. */
  chapterTrackUnlink(chapterId: string): Promise<ChapterTrackMapping>;
  /** Every narration chapter's link state and track facts from one parse of the saved .rpp; read-only. */
  chapterTrackLinks(): Promise<ChapterTrackLinks>;
  /** Finds the track holding chapterId in the selected .rpp and where its recorded audio ends; read-only. */
  chapterTrackMatch(chapterId: string): Promise<ChapterTrackMatch>;
  /** Plans one REAPER region per linked chapter, plus the credits on the given tracks ('' leaves one out); read-only. */
  chapterRegionsPreview(openingTrackGuid: string, closingTrackGuid: string): Promise<ChapterRegionPlan>;
  /** Recomputes the plan and sends it to REAPER in one undo step; `update` moves a region whose title already exists. */
  chapterRegionsCreate(openingTrackGuid: string, closingTrackGuid: string, update: boolean): Promise<ChapterRegionsCreated>;
  /** "Select in REAPER": deselects every other track and selects trackGuid. Changes nothing else. */
  trackSelectInReaper(trackGuid: string): Promise<TrackSelectResult>;
}
