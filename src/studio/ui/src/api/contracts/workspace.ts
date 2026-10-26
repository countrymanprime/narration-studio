import type { CoverageReason } from './coverage';
import type { DawResult } from './daw';
import type { FindingNavigation } from './findings';
import type { TakeComparisonJob } from './takeReview';

// The edit-and-proof workspace's stored word alignment: the
// recording check's per-token alignment (COVERAGE_TOKEN/COVERAGE_EXTRA, src/studio/sidecars/transcript-compare) read back and
// joined with the chapter's paragraphs and its items' current played ranges. The host shapes are
// src/studio/desktop/internal/coverage/{alignment.go,workspace.go} and src/studio/desktop/bindings_coverage.go's
// WorkspaceAlignment. Read-only: it never runs a check.

/** One chapter token as the check aligned it: `read` and `misread` are present, the rest are missing (a region kind)
 * or the optional heading. Item, start and end name where it was heard (source seconds), set only when something
 * was; heard is the misread word actually said. */
export type WorkspaceToken = {
  /** The token's position in the chapter, in order (kept short on the wire: a chapter has thousands of these). */
  i: number;
  /** The paragraph this token belongs to; absent for a title or subtitle token. */
  p?: string;
  /** The ordinal of this token's whitespace word in its paragraph's (or the heading's) text. */
  w: number;
  text: string;
  status: 'read' | 'misread' | 'heading' | 'head' | 'tail' | 'skip' | 'short_read' | 'different_text';
  heard?: string;
  item?: number;
  start?: number;
  end?: number;
  /** The recogniser's score for the word, 0 to 1, or null with `confReason`: null with 'no_word_scores'
   * until the words file carries Whisper word probabilities. Absent in a payload from before src/studio/desktop/internal/coverage/workspace.go. */
  conf?: number | null;
  confReason?: string;
  /** Never set: a token is in the script. Only an extra run's words are added. */
  added?: never;
};

/** How an added word's times were found: spread evenly between its run's two ends, or, for a run whose
 * ends are on two items, placed at the run's start with no duration. */
export type WorkspaceWordTiming = 'spread' | 'unplaced';

/** One word of an extra run: said, and not in the script. start and end are seconds of item's source. */
export type WorkspaceExtraWord = {
  text: string;
  item: number;
  start: number;
  end: number;
  added: true;
  timing: WorkspaceWordTiming;
  conf: number | null;
  confReason?: string;
};

/** A point in the audio: an item and a time in its source file (as coverage's RegionPosition). */
export type WorkspaceAudioPosition = { itemIndex: number; itemGuid: string; sourceTime: number };

/** The chapter text an extra run says again, a second take (issue #2251 item 30): the run's words `[first, last)` are
 * the chapter's tokens `[start, end)`, heard just before or just after the run, and `text` is those tokens as written.
 * The rest of the run is an aside ("sorry", "once more"). */
export type WorkspaceRepeat = { start: number; end: number; first: number; last: number; text: string };

/** One run of transcript words the chapter's tokens do not account for (a retake, a false start, an aside).
 * afterToken is the doc token index of the last token heard before this run, absent before anything was heard. */
export type WorkspaceExtra = {
  text: string;
  tokens: number;
  start: WorkspaceAudioPosition;
  end: WorkspaceAudioPosition;
  afterToken?: number;
  /** Set when the run says the chapter text beside it again; absent for an aside and from a host before it. */
  repeatOf?: WorkspaceRepeat;
  /** The run's words, in order; empty in a payload from before it. */
  words?: WorkspaceExtraWord[];
};

export type WorkspaceParagraph = { id: string; text: string };

/** One manifest item's current played range, joined by item GUID against the saved project (tracks.Item's
 * played-range fields). live is false when the saved project no longer has an item with this
 * GUID: the other fields are then absent. */
export type WorkspaceItem = {
  index: number;
  itemGuid: string;
  live: boolean;
  takeGuid?: string;
  sourceStart?: number;
  playRate?: number;
  position?: number;
  length?: number;
};

export type WorkspaceAlignmentResult = {
  chapterId: string;
  /** Shared with CoverageResult: an alignment is only ever as current as the coverage result it was written with. */
  state: 'current' | 'stale' | 'never';
  reasons: CoverageReason[];
  basis?: { label: string; modifiedAt: string; stale: boolean };
  /** True when the newest current or stale result has no stored alignment yet (a report from before the sidecar
   * wrote COVERAGE_TOKEN lines): align-again re-aligns it from cached words alone, without running the check. */
  needsAlignAgain: boolean;
  /** The chapter's heading, which a narrator reads aloud before the first paragraph: the page sets it against what was heard too. Absent for a credits row and from a host that predates it. */
  title?: string;
  subtitle?: string;
  paragraphs: WorkspaceParagraph[];
  tokens: WorkspaceToken[];
  extras: WorkspaceExtra[];
  items: WorkspaceItem[];
  /** The recogniser whose words the alignment came from; absent when there is no stored alignment. */
  engine?: { id: string; name: string };
  /** The recording check these word times came from, present only while that check is current. A voice sample marked from these words sends
   * it back (`VoiceSampleMarkRequest.alignmentRecordId`), and the host refuses the mark when the chapter's current check is another one. */
  recordId?: string;
};

/** The narrator's FX chains, from REAPER's FXChains folder: by
 * relative name, sorted; truncated is true when the bridge's depth or count limit left some out. Read-only. The
 * narrator's favourites are a Settings field (DAW.fx_favourites), not part of this read. */
export type WorkspaceFXChainsResult = { names: string[]; truncated: boolean };

/** One plug-in in a DAW chain, as the DAW names it, and whether it is switched on. */
export type ProjectFxSlot = { name: string; enabled: boolean };

/** The FX on the linked DAW's tracks and master track now (WorkspaceProjectFx; master_chain_read), in the DAW's own order. */
export type WorkspaceProjectFxResult = { tracks: { trackGuid: string; name: string; fx: ProjectFxSlot[] }[]; master: ProjectFxSlot[]; total: number };

/** Where a take offered for a passage comes from: another take
 * of the item the passage was heard on, another retake of its line on a fixed-lane track, or a read a take-review
 * group set beside it. */
export type PassageTakeSource = 'item_take' | 'lane_retake' | 'take_review';

/** What choosing a take does: make it the item's active take (one undo step), make its lane the one that plays,
 * or add a read from another item as a take and make that active (two steps, so `confirm` is set). */
export type PassageTakeAction = 'make_active' | 'pick_lane' | 'add_and_activate';

/** One take the narrator can hear against the passage and choose. The id names it for `workspaceUseTake`: the page
 * sends that id back, never a GUID, file or time (src/studio/desktop/internal/passagetakes). */
export type PassageTake = {
  id: string;
  source: PassageTakeSource;
  action: PassageTakeAction;
  confirm: boolean;
  label: string;
  detail: string;
  /** What plays in REAPER now. */
  active: boolean;
  itemGuid: string;
  takeGuid: string;
  /** The range of its own file the take plays, for the in-app A/B. */
  sourceFile: string;
  sourceStart: number;
  sourceLength: number;
  /** False when the take cannot be heard or chosen; `reason` says why. */
  usable: boolean;
  reason?: string;
  /** Whether a saved comparison of this passage covered this take, with how much of the passage's words it matched. */
  compared: boolean;
  fidelity?: number;
  notComparedReason?: string;
};

/** The Takes panel's read for a passage of a chapter (WorkspaceTakes): the passage as the host snapped it to whole
 * paragraphs, and every take offered for it. `message` says why there are none; `comparisonId` is the saved
 * take_comparison finding (a finding, read with findingsList), when one was made. */
export type WorkspaceTakesResult = {
  chapterId: string;
  firstToken: number;
  lastToken: number;
  firstParagraph: number;
  lastParagraph: number;
  words: number;
  passageId: string;
  itemGuid: string;
  message?: string;
  comparisonId?: string;
  candidates: PassageTake[];
};

/** Why choosing a take was refused: nothing in REAPER changed for any of these (except `failed` after the read of an
 * add-and-activate was added, which the message says). */
export type UseTakeRefusal = 'not_offered' | 'unusable' | 'stale' | 'recording' | 'script_outdated' | 'standalone' | 'not_running' | 'failed';

/** What "Use this take" did: `done` (changed says whether the active take changed), `started` (a lane pick, whose end
 * retakeLanesState reports) or `refused`. */
export type WorkspaceUseTakeResult = {
  outcome: 'done' | 'started' | 'refused';
  reason?: UseTakeRefusal;
  message: string;
  changed: boolean;
};

/** A waveform overview of a stretch of a WAV source (measure.Peaks): for each bucket of 1/bucketsPerSecond seconds, the lowest and highest sample over every channel, as two
 * signed bytes scaled to +-127 packed into minMax (base64: buckets * 2 bytes, minimum then maximum per bucket). */
export type WorkspacePeaks = {
  startSeconds: number;
  bucketsPerSecond: number;
  buckets: number;
  minMax: string;
  sampleRate: number;
  channels: number;
};

/** One analyzed item's waveform, or why it has none (WorkspacePeaksItem, src/studio/desktop/bindings_workspace_peaks.go):
 * peaks is absent, and reason set, for an item that is not live, has no source audio, or whose source is not a WAV
 * ("no waveform") - never an error, so one bad item does not blank the rest of the strip. */
export type WorkspacePeaksEntry = { index: number; peaks?: WorkspacePeaks; reason?: string };

export type WorkspacePeaksResult = { chapterId: string; items: WorkspacePeaksEntry[] };

export interface WorkspaceApi {
  /** Reads a chapter's stored word alignment joined with its paragraphs and items' current played ranges. Never
   * runs anything. */
  workspaceAlignment(chapterId: string): Promise<WorkspaceAlignmentResult>;
  /** Selects tokenIndex's item in REAPER and puts the edit cursor on the spot it was heard (navigate_item): the host resolves the
   * token's item, take and source time, exactly as findingsGoTo does for a finding. Connection status is shared with the Review page (findingsReaperStatus). */
  workspaceGoTo(chapterId: string, tokenIndex: number): Promise<FindingNavigation>;
  /** Lists the narrator's FX chains (list_fx_chains). Refused offline or before the DAW port's FX chains
   * capability is available (dawport.CapFXChains). */
  workspaceListFXChains(): Promise<WorkspaceFXChainsResult>;
  /** Lists the FX on the linked DAW's tracks and master track now (master_chain_read). Reads only; refused offline or before
   * the DAW port's master chain capability is on. */
  workspaceProjectFx(): Promise<WorkspaceProjectFxResult>;
  /** Lists the takes that can be set beside a passage (the tokens firstToken to lastToken, snapped out to whole
   * paragraphs). Reads only, and works with REAPER closed. */
  workspaceTakes(chapterId: string, firstToken: number, lastToken: number): Promise<WorkspaceTakesResult>;
  /** Compares the passage's usable takes as the one take comparison job: takeComparisonState and takeComparisonCancel
   * answer for it, with the passage's id as the job's findingId. It saves one take_comparison finding. */
  workspaceTakesCompareStart(chapterId: string, firstToken: number, lastToken: number): Promise<TakeComparisonJob>;
  /** Makes a take the passage's playing one, by an id workspaceTakes offered. */
  workspaceUseTake(chapterId: string, firstToken: number, lastToken: number, candidateId: string): Promise<WorkspaceUseTakeResult>;
  /** Plays a take workspaceTakes offered through the DAW's preview (file_preview), outside the project: the host reads the take's own
   * file and range from the saved project, and plays the first 60 s of a longer one. A take it no longer offers is refused with code
   * `stale`; dawStopFilePreview stops it. */
  workspacePreviewTake(chapterId: string, firstToken: number, lastToken: number, candidateId: string): Promise<DawResult>;
  /** Reads the waveform strip's peaks for every analyzed item of a chapter's stored alignment: host-computed from each item's active take's source file, cached by source identity. */
  workspacePeaks(chapterId: string): Promise<WorkspacePeaksResult>;
}
