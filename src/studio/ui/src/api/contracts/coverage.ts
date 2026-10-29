import type { Finding } from './findings';
import type { WhisperInstallState, WhisperModel } from './whisper';

// Recording coverage (docs/utilities/recording-coverage.md): a check of one chapter's saved recording
// against its manuscript text, run only when the narrator asks, and the stored result read back as current,
// stale or never. The host shapes are src/studio/desktop/bindings_coverage.go and src/studio/desktop/internal/coverage/view.go.

/** Why a chapter cannot be checked (or its result read) right now: nothing was run or written (coverage/reason.go). */
export type CoverageRefusalReason =
  | 'no_project'
  | 'no_project_file'
  | 'project_unreadable'
  | 'no_manuscript'
  | 'chapter_not_found'
  | 'not_narration'
  | 'unmapped'
  | 'multiple_tracks'
  | 'mapped_track_missing'
  | 'no_items'
  | 'unsupported_item'
  | 'source_missing'
  | 'item_unreadable'
  | 'busy'
  | 'sidecar_missing'
  | 'invalid_params'
  | 'manuscript_changed'
  | 'result_missing'
  | 'credits_not_set_up'
  | 'credits_changed';

/** Why a stored result is stale or never, from the staleness evaluator (evidence/staleness.go). */
export type CoverageEvaluatorReason =
  | 'item_added'
  | 'item_removed'
  | 'item_trimmed'
  | 'item_moved'
  | 'item_muted'
  | 'take_switched'
  | 'source_changed'
  | 'analyzer_changed'
  | 'params_changed'
  | 'mapping_changed'
  | 'mapped_track_missing'
  | 'project_unreadable';

export type CoverageReason = CoverageRefusalReason | CoverageEvaluatorReason;

export type CoveragePhase = 'idle' | 'running' | 'complete' | 'cancelled' | 'failed';

/** The one check the host runs at a time, or the last one that ended. Sent by CoverageState and the `coverage:state` event. */
/** Which sidecar pass is running now: set only for a run that asked for a
 * re-check. "first_pass" is every run's own first launch, or "pipeline" when that launch also re-checks what it doubts with the
 * larger model as it goes; the other three only ever follow it. */
export type CoveragePass = 'first_pass' | 'pipeline' | 'recheck_windows' | 'recheck_whole' | 'realign';

/** One model's share of a running check. A unit is the audio one transcription takes: an item, or a chunk of a long item. */
export type CoveragePassActivity = {
  model: string;
  /** The transcriptions this model runs at once, as the sidecar planned them (what really runs, not what was asked for). */
  workers: number;
  /** How many of them are running now. */
  busy: number;
  total: number;
  done: number;
  /** False while `total` can still grow: the larger model's passages, until the first pass has handed over every item. */
  final: boolean;
};

/** Why the larger model was asked to look at a passage. */
export type CoverageRecheckReason = 'low_confidence' | 'missing_words' | 'widespread';

export type CoverageRecheckActivity = CoveragePassActivity & { reasons: CoverageRecheckReason[] };

/** What a running check is doing now, beyond its percent (host activity.go, read from the sidecar's activity file). Absent until the sidecar
 * has written its first count, and for a state the page builds itself. */
export type CoverageActivity = {
  /** The worker count the narrator set; 0 is Automatic. */
  requested: number;
  items: { total: number; done: number };
  firstPass: CoveragePassActivity;
  /** Present only for a run that asked for a second look with a larger model. */
  recheck?: CoverageRecheckActivity;
};

export type CoverageState = {
  runId?: string;
  chapterId?: string;
  phase: CoveragePhase;
  /** Real progress from the sidecar; it never moves backwards. */
  percent: number;
  stage?: string;
  message: string;
  /** The ledger record a finished run wrote. */
  recordId?: string;
  startedAt?: string;
  completedAt?: string;
  /** The host started this check on its own: label it "(background)". The
   * narrator's own Check pre-empts it. The host always sends it; absent reads as false (a state the page builds itself). */
  background?: boolean;
  /** Which pass is running, and the models involved, for a cascade-enabled run only; absent for a plain,
   * single-model check. recheckWindows is only set once the windowed re-check stage has started planning. */
  pass?: CoveragePass;
  firstPassModel?: string;
  recheckModel?: string;
  recheckWindows?: number;
  activity?: CoverageActivity;
};

/** The re-check model's own asset gate: the same shape as asset_required, kept apart so the UI can
 * offer "Check with tiny only" beside the download, instead of blocking the check the way a missing first-pass
 * model does. */
type ModelAssetRequired = {
  model: Omit<WhisperModel, 'downloadSize' | 'installState'>;
  installState: WhisperInstallState;
  downloadSize: number;
  diskSize: number;
  installPath: string;
};

export type CoverageStartResult =
  | { status: 'started'; state: CoverageState }
  | { status: 'refused'; reason: CoverageRefusalReason; message: string }
  | ({ status: 'asset_required' } & ModelAssetRequired)
  | ({ status: 'recheck_asset_required' } & ModelAssetRequired);

/** CoverageStart's own options: skipRecheck starts a cascade-enabled chapter with the first pass alone -
 * "Check with tiny only" - regardless of what the re-check settings or its install state are. model names one of
 * the engines coverageEngines lists to run alone, replacing the cascade for that run. */
export type CoverageStartOptions = {
  skipRecheck?: boolean;
  model?: string;
  /** Turns the second pass on or off whatever the cascade setting says; with recheckModel and recheckBelow it is docs/utilities/recording-coverage.md. */
  recheck?: boolean;
  /** The larger model of the second pass: one of the engines coverageEngines lists. */
  recheckModel?: string;
  /** Also re-check passages whose words Whisper scored under this share (0 to 1), not only what is missing. */
  recheckBelow?: number;
  /** Transcriptions at once: items side by side, or a long item's chunks, each a copy of the model. 0 is Automatic: the host plans it
   * from the processors, the free memory and the model (coverageWorkerPlan says the number). */
  workers?: number;
  /** Each chunk's length in seconds; 0 transcribes an item whole. */
  chunkSeconds?: number;
  /** How many seconds neighbouring chunks overlap, where their words are joined. */
  overlapSeconds?: number;
  /** How many chapters one Check recordings run checks at once. Each start of the run names it, so the host allows that many in progress. */
  chapters?: number;
};

/** One engine a recording check can run: an approved Whisper model. Moonshine is the Booth's, not offered. */
export type CoverageEngine = { id: string; label: string; family: 'whisper'; installState: WhisperInstallState };

/** What a start naming no option would do besides the first-pass model: the second pass, the passages it takes and how a long
 * item is cut up. `recheckModel` is always one of the listed engines. */
export type CoverageRunDefaults = {
  recheck: boolean;
  recheckModel: string;
  recheckBelow: number;
  workers: number;
  chunkSeconds: number;
  overlapSeconds: number;
  chapters: number;
};

/** The engines a recording check can run, in catalog order, the id a start naming none would use (always listed) and
 * what else such a start would do. */
export type CoverageEngines = { engines: CoverageEngine[]; default: string; defaults: CoverageRunDefaults };

export type CoverageAlignment = { maxMisreadRun: number; minAnchorRun: number };

/** One played item of the chapter's track as the check treated it. */
export type CoverageItem = {
  index: number;
  itemGuid: string;
  status: 'analyzed' | 'muted';
  /** Whether the item's words were transcribed in that run or reused from the cache; absent for a muted item. */
  words?: 'transcribed' | 'reused';
  playedSeconds: number;
  wordCount: number;
  model?: string;
  language?: string;
};

export type CoverageParagraph = { id: string; tokens: number; present: number; longestMissingRun: number };

export type CoverageRegionKind = 'head' | 'tail' | 'skip' | 'short_read' | 'different_text';

/** A point in the audio: an item and a time in its source file. */
export type CoverageRegionPosition = { itemIndex: number; itemGuid: string; sourceTime: number };

export type CoverageRegion = {
  kind: CoverageRegionKind;
  paragraphIds: string[];
  tokenCount: number;
  firstWord: string;
  lastWord: string;
  /** Where the missing text would sit. */
  position?: CoverageRegionPosition;
  /** The end of the last matched word before the region; absent before a head, when nothing was said, and in an older result. */
  before?: CoverageRegionPosition;
  /** The start of the first matched word after the region; absent after a tail, when nothing was said, and in an older result. */
  after?: CoverageRegionPosition;
};

/** The model cascade's second pass over this report: Model stays the
 * report's own top-level model (the first pass, for compatibility) - this is the other one. Absent for a plain,
 * single-model check. Every region still listed on a report with a recheck was re-checked and still missing: the
 * planner windows every region a first pass reports (or, wholeChapter, re-transcribes the whole chapter), so a
 * region surviving realignment was seen by both models. */
export type CoverageRecheck = { model: string; wholeChapter: boolean; windows: number; seconds: number };

/** What a gap in the recording is: script not said, words said that are not in the script, other words in
 * place of the script's, or a region kind this app does not know yet. */
export type CoverageGapKind = 'missing' | 'extra' | 'misread' | 'other';

/** A line to redo inside the read part of a chapter. `confidence` is a number or null; it is null with a `confReason`
 * ('no_word_scores') until the words file carries Whisper word probabilities. */
export type CoverageGap = {
  id: string;
  kind: CoverageGapKind;
  paragraphIds: string[];
  tokenCount: number;
  firstWord: string;
  lastWord: string;
  /** The extra words heard; only on an `extra` gap. */
  text?: string;
  /** On an `extra` gap that says the chapter text again (a second take): the chapter words it repeats. */
  repeatOf?: string;
  position?: CoverageRegionPosition;
  before?: CoverageRegionPosition;
  after?: CoverageRegionPosition;
  confidence: number | null;
  confReason: string;
};

/** Paragraphs not read at the start and at the end of the chapter: unfinished recording, not pickups. */
export type CoverageUnfinished = { start: number; end: number };

/** A stored report: counts, never a verdict (the thresholds are applied on read). */
export type CoverageReport = {
  model: string;
  language?: string;
  alignment: CoverageAlignment;
  bodyTokens: number;
  presentTokens: number;
  missingTokens: number;
  extraTokens: number;
  longestMissingRun: number;
  playedSeconds: number;
  items: CoverageItem[];
  paragraphs: CoverageParagraph[];
  regions: CoverageRegion[];
  /** The lines to redo inside the read part; the host always sends both (an empty list and zeros for a result stored before the taxonomy); optional so a report built by hand need not. */
  gaps?: CoverageGap[];
  unfinished?: CoverageUnfinished;
  recheck?: CoverageRecheck;
};

export type CoverageResult = {
  chapterId: string;
  state: 'current' | 'stale' | 'never';
  reasons: CoverageReason[];
  /** "saved project, file modified <time>", and whether the saved file is older than the newest evidence or audio. */
  basis?: { label: string; modifiedAt: string; stale: boolean };
  record?: { id: string; outcome: 'complete' | 'partial' | 'failed'; startedAt: string; completedAt: string };
  /** The newest complete check's report, kept when it is stale so the narrator can see what changed since. */
  result?: CoverageReport;
  /** The share of the chapter's words present, only for a current result: the chapter payload's recordedFraction. */
  recordedFraction?: number;
  /** The report judged by the narrator's thresholds, by the same rule as the stage signal: set for any
   * complete result with a report, stale included (as of the last check), absent otherwise. */
  judgement?: CoverageJudgement;
};

/** Passes the check (`met`) or not, with the gap that fails first, and the thresholds it was judged by. */
export type CoverageJudgement = {
  state: 'met' | 'not_met';
  reason: string;
  thresholds: { minParagraphPresent: number; maxMissingRun: number };
};

/** What set a worker plan's count: half the processors (Automatic) or all of them (a named number), the free memory, the number
 * named, or the model's fixed cap when the free memory cannot be read. */
export type CoverageWorkerLimit = 'processors' | 'memory' | 'requested' | 'model';

/** How many transcriptions each chapter of a recording check runs at once on this computer, and why: the count a start sends. */
export type CoverageWorkerPlan = {
  /** The number asked for; 0 is Automatic. */
  requested: number;
  /** Transcriptions at once, at least 1. */
  workers: number;
  /** Processors each one decodes with. */
  threadsEach: number;
  /** Processors one chapter's check may use, and the whole computer's. */
  cpus: number;
  computerCpus: number;
  /** Free memory one chapter's check plans with, in MB; 0 when it cannot be read. */
  freeMemoryMB: number;
  model: string;
  modelLabel: string;
  /** About how much one copy of the model takes, in MB (an estimate). */
  modelMemoryMB: number;
  limit: CoverageWorkerLimit;
  /** Chapters checked at once, which share the computer. */
  chapters: number;
};

/** The narrator's call on one gap of a current check: accepted became a note, ignored is remembered. */
export type CoverageGapReview = 'accepted' | 'ignored';

/** The gaps of a chapter's current check that have a review, by gap id; a gap without one is to review. */
export type CoverageGapReviews = Record<string, CoverageGapReview>;

export interface CoverageApi {
  /** Starts a recording check of one chapter: the narrator's Transcript Compare model, or, with the model cascade on,
   * its own two models - unless options.skipRecheck asks for the first pass alone. */
  coverageStart(chapterId: string, options?: CoverageStartOptions): Promise<CoverageStartResult>;
  /** The engines a recording check can run and the one a start naming none would use; needs no project. */
  coverageEngines(): Promise<CoverageEngines>;
  /** How many transcriptions a start with these options would run at once on this computer, and why; needs no project. */
  coverageWorkerPlan(options?: CoverageStartOptions): Promise<CoverageWorkerPlan>;
  coverageState(): Promise<CoverageState>;
  /** Asks a running check to stop; the items it finished stay cached. */
  coverageCancel(): Promise<void>;
  /** Reads a chapter's newest complete check back; never runs one. */
  coverageResult(chapterId: string): Promise<CoverageResult>;
  subscribeCoverage(onUpdate: (state: CoverageState) => void): () => void;
  /** Turns one gap of the chapter's current check into a note with the accepted decision and answers that finding
   * The same gap again answers the same finding. Rejects, writing nothing, when the check is out of date or
   * was never run, the gap is not in it, or the gap was ignored. A check never calls this. */
  coverageGapAccept(chapterId: string, gapId: string): Promise<Finding>;
  /** Remembers that the narrator passed on one gap of the chapter's current check; no note is made. Rejects like coverageGapAccept. */
  coverageGapIgnore(chapterId: string, gapId: string): Promise<void>;
  /** The reviews of the chapter's current check by gap id; empty while the check is out of date or after a new run. */
  coverageGapReviews(chapterId: string): Promise<CoverageGapReviews>;
}
