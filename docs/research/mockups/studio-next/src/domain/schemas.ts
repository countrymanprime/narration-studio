/**
 * Domain schemas. These are the single source of truth for the shape of the book data:
 * the TypeScript types are inferred from them, fixtures are parsed through them, and the
 * same schemas can later check anything that crosses into the UI from the host.
 *
 * The shapes are a working draft taken from the mock. Align them with the app's real
 * types when those are available; everything else reads these types, so a change here
 * is a change in one place.
 */
import { z } from 'zod'
import { ResumePoint } from './daw'
import { ExtractionSuggestion } from './extraction'

export const PrepState = z.enum(['none', 'progress', 'prepped'])
export type PrepState = z.infer<typeof PrepState>

export const ChapterKind = z.enum(['chapter', 'credits'])
export type ChapterKind = z.infer<typeof ChapterKind>

/** A change in the manuscript that touched a chapter that was already worked on. */
export const ChapterFlag = z.object({
  text: z.string(),
  type: z.enum(['daw', 'archived', 'text']),
})
export type ChapterFlag = z.infer<typeof ChapterFlag>

/**
 * A chapter is an entity. Its heading is NOT stored as text: `n` and `title` are stored and
 * every page formats the heading with `format/headings.ts`, so a change of heading style
 * reaches every page.
 */
export const Chapter = z.object({
  id: z.string(),
  /** Ordinal. Absent for credits. */
  n: z.number().int().positive().optional(),
  title: z.string(),
  kind: ChapterKind,
  words: z.number().int().nonnegative(),
  prep: PrepState,
  /** Percent of the chapter recorded / edited / proofed (0 to 100). */
  rec: z.number().min(0).max(100),
  edit: z.number().min(0).max(100),
  /** Stored proof progress for chapters with no proof notes. With notes, it is derived. */
  proof: z.number().min(0).max(100).default(0),
  flag: ChapterFlag.optional(),
  /** Percent that was recorded in the app before its takes were archived. */
  archived: z.number().optional(),
})
export type Chapter = z.infer<typeof Chapter>

/** Who says a phrase: an alias from the Story Bible exactly as it is spelled, '?' (unknown) or 'NARR' (narration). */
export const Speaker = z.string()
export type Speaker = z.infer<typeof Speaker>

export const Paragraph = z.object({
  id: z.string(), // '8-1', 'o-1', 'c-1'
  chapterId: z.string(),
  /** Paragraph-level default speaker. Quoted phrases get their own speaker. */
  speaker: Speaker,
  text: z.string(),
})
export type Paragraph = z.infer<typeof Paragraph>

export const MarkColour = z.enum(['copper', 'info', 'ok', 'warn', 'bad', 'violet'])
export type MarkColour = z.infer<typeof MarkColour>
export const MarkStyle = z.enum(['highlight', 'underline', 'double', 'dotted', 'wavy', 'box'])
export type MarkStyle = z.infer<typeof MarkStyle>

/** The narrator defines mark types: a name, a colour and a line style. `ask` tracks a reply. */
export const MarkType = z.object({
  k: z.string(),
  name: z.string(),
  c: MarkColour,
  st: MarkStyle,
  ask: z.boolean().optional(),
})
export type MarkType = z.infer<typeof MarkType>

export const ThreadMessage = z.object({
  who: z.enum(['you', 'author', 'proofer']),
  text: z.string(),
  at: z.string(),
})
export type ThreadMessage = z.infer<typeof ThreadMessage>

/** Marks, notes, author queries and pronunciation flags all hang on a range of one paragraph. */
export const Annotation = z.object({
  id: z.string(),
  p: z.string(), // paragraph id
  s: z.number().int().nonnegative(),
  e: z.number().int().nonnegative(),
  q: z.string(), // the quoted text
  type: z.enum(['mark', 'pron']),
  mark: z.string().optional(), // MarkType.k
  key: z.string().optional(), // pronunciation word
  text: z.string().optional(),
  status: z.enum(['open', 'resolved']).optional(),
  thread: z.array(ThreadMessage).optional(),
})
export type Annotation = z.infer<typeof Annotation>

/**
 * A bookmark: the narrator's own place-holder in the manuscript, a way back to a spot. It is not a discussion (that is a note or a query):
 * it carries a short label and a note for what the mark was for, and nothing else. It sits on a character offset in one paragraph.
 */
export const Bookmark = z.object({
  id: z.string(),
  chapterId: z.string(),
  /** Paragraph id and the character offset in its text where the mark sits */
  pid: z.string(),
  offset: z.number().int().nonnegative(),
  label: z.string().max(60).default(''),
  note: z.string().max(500).default(''),
  /** The mock clock's date when it was made (ISO) */
  at: z.string(),
})
export type Bookmark = z.infer<typeof Bookmark>

/**
 * Where a pronunciation can come from. The list is data supplied by the pronunciation provider (one default, other supported
 * sources, and the narrator's own entry); screens render whatever it reports.
 */
export const PronSource = z.object({
  id: z.string(),
  label: z.string(),
  /** An icon name known to ui/Icon. */
  icon: z.string(),
  /** `generated`: made by the app; `lookup`: taken from a service or dictionary; `manual`: typed by the narrator. */
  kind: z.enum(['generated', 'lookup', 'manual']),
  /** What the source needs before it can answer. */
  needs: z.enum(['network', 'localDictionary']).optional(),
  /** The definitions source (Settings) this one stands for, so "Use" in a definition records where the value came from. */
  definitions: z.enum(['local', 'api']).optional(),
})
export type PronSource = z.infer<typeof PronSource>

/** How a word is said, and the id of the PronSource it came from ('' while nothing is set). */
export const Pronunciation = z.object({
  say: z.string(),
  src: z.string(),
})
export type Pronunciation = z.infer<typeof Pronunciation>

export const StoryBibleType = z.object({
  k: z.string(),
  c: MarkColour,
  /** Entries of this type can be picked as the speaker of a quoted line: each of their names is a speaker. */
  speaker: z.boolean().optional(),
})
export type StoryBibleType = z.infer<typeof StoryBibleType>

export const BibleEntry = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(), // StoryBibleType.k
  aka: z.array(z.string()),
  sum: z.string(),
  voice: z.string(),
  acts: z.string(),
  knows: z.string(),
  /** Chapter id of the first mention, if known. */
  first: z.string().nullable(),
  /** How the first name is said. */
  say: z.string(),
  /** How each other name is said, by name. */
  sayA: z.record(z.string(), z.string()).optional(),
  /** The PronSource id behind each name's pronunciation, by name. A pronunciation with no entry here was typed by the narrator. */
  saySrc: z.record(z.string(), z.string()).optional(),
  /** The speaker colour chosen for this entry. Absent: a stable colour is assigned from the palette. */
  colour: MarkColour.optional(),
  /** Arrived with the manuscript import and has not been looked at yet: the entry as a whole, and the names among its aliases. */
  review: z.object({ entry: z.boolean(), aliases: z.array(z.string()) }).optional(),
  /** Created by the narrator rather than imported. */
  user: z.boolean().optional(),
})
export type BibleEntry = z.infer<typeof BibleEntry>

export const Relationship = z.object({
  id: z.number(),
  a: z.string(), // entry id
  rel: z.string(),
  b: z.string(), // entry id
})
export type Relationship = z.infer<typeof Relationship>

export const FindingType = z.enum(['misread', 'skip', 'mouth', 'pron', 'pacing', 'repeat', 'plosive', 'noise', 'takes', 'breath'])
export type FindingType = z.infer<typeof FindingType>

export const Resolution = z.enum(['pickup', 'edit', 'waive', 'defer', 'keep', 'fixed'])
export type Resolution = z.infer<typeof Resolution>

/** How sure an analysis is, 0 to 1. Null when it cannot say; a null always travels with its reason, never a made-up number. */
export const Confidence = z.number().min(0).max(1).nullable()

/** One line of a note's decision history. The list only grows; reopening a note is a line too (`res` null). */
export const Decision = z.object({
  res: Resolution.nullable(),
  /** The day it was decided (yyyy-mm-dd). */
  at: z.string(),
  /** What the narrator typed with the decision. */
  note: z.string(),
  /** The evidence key the decision was made on, and the text that was heard then. */
  evidence: z.string(),
  heard: z.string(),
})
export type Decision = z.infer<typeof Decision>

export const ProofNote = z.object({
  id: z.number(),
  chapterId: z.string(),
  pid: z.string().nullable(),
  /** Display time and seconds into the chapter recording. */
  t: z.string(),
  sec: z.number(),
  ty: FindingType,
  h: z.string(),
  script: z.string(),
  heard: z.string(),
  from: z.string(),
  note: z.string(),
  res: Resolution.nullable(),
  thread: z.array(ThreadMessage).optional(),
  /** Measured by the analysis: peak level in dB (full scale) and length in seconds. Gaps have a length only. */
  db: z.number().optional(),
  dur: z.number().optional(),
  /** How sure the analysis is. Null with a reason when it cannot say (a proofer's note has no score). */
  conf: Confidence,
  confReason: z.string().optional(),
  /** Names what the note was found on (the heard text and its score). A re-check that changes it makes decisions made on the old evidence stale. */
  evidence: z.string(),
  /** Every decision ever made on the note, oldest first. */
  history: z.array(Decision),
})
export type ProofNote = z.infer<typeof ProofNote>

/**
 * A take is a region of recorded audio that reads one passage. `source` says where it lives: a REAPER take
 * (stacked in one item), the built-in recorder's own take, or a clip cut out of a track (what Audacity gives).
 * Whatever the source, a take is a start and a length in the chapter recording.
 */
export const TakeSource = z.enum(['reaper', 'recorder', 'clip'])
export type TakeSource = z.infer<typeof TakeSource>
export const Take = z.object({
  id: z.string(),
  source: TakeSource,
  /** Seconds into the chapter recording, and length in seconds. */
  start: z.number().nonnegative(),
  len: z.number().positive(),
  /** The take that plays. Exactly one take of a passage is active; the others are muted, not deleted. */
  active: z.boolean(),
  /** What the speech check heard in this take. */
  text: z.string(),
  /** The Booth wrote this take's place when it was recorded (`map`); otherwise it was found by aligning the audio to the text (`alignment`). */
  via: z.enum(['map', 'alignment']).optional(),
  /** The ids the DAW gave the item and the take when the Booth recorded it. */
  itemGuid: z.string().optional(),
  takeGuid: z.string().optional(),
  /** Muted and put out of the way by Hide other takes. It is still in the DAW. */
  hidden: z.boolean().optional(),
})
export type Take = z.infer<typeof Take>

/** How the retries of a passage are kept: stacked on the first read's spot, or left where they were recorded and cleaned up when one is kept. */
export const RetryMode = z.enum(['stack', 'leave'])
export type RetryMode = z.infer<typeof RetryMode>

/**
 * A passage whose retries were stacked on the first read: the takes that were moved, with where each one began relative to the first read
 * (so it can go back, even when audio before it has moved since). The first read is the base and never moves.
 */
export const PassageStack = z.object({
  id: z.string(),
  /** The first read, the take the others are stacked on. */
  base: z.string(),
  /** Seconds after the base's start where each stacked take began before it was stacked, by take id. A take leaves this list when it is un-stacked. */
  offsets: z.record(z.string(), z.number().nonnegative()),
  /** The backup taken before the audio was stacked (DAWs that keep backups). */
  backupId: z.string().optional(),
})
export type PassageStack = z.infer<typeof PassageStack>

/** The part of a paragraph that was read, with every take of it. The script is the manuscript text from `s` to `e`. */
export const Passage = z.object({
  id: z.string(),
  chapterId: z.string(),
  pid: z.string(),
  s: z.number().int().nonnegative(),
  e: z.number().int().positive(),
  takes: z.array(Take),
  /** The narrator chose the active take. Until then it is only the one REAPER or the recorder left on top. */
  kept: z.boolean().default(false),
  /** Take preparation steps already applied to this passage (ids from the prep steps list). */
  prepped: z.array(z.string()).optional(),
  /** How this passage's retries are kept, when the narrator chose differently from its chapter. */
  retryMode: RetryMode.optional(),
  /** Set while some takes are stacked on the first read. */
  stack: PassageStack.optional(),
})
export type Passage = z.infer<typeof Passage>

/**
 * What the Booth writes while it records: where in the text a take began, and the ids the DAW gave it. Editing lists passages from this
 * log; only takes recorded elsewhere are found by aligning the audio to the text.
 */
export const PassageMark = z.object({
  id: z.string(),
  /** The recording run (one Record to Stop) the mark belongs to. */
  run: z.string(),
  chapterId: z.string(),
  pid: z.string(),
  /** The word in the paragraph the take began at. */
  word: z.number().int().nonnegative(),
  /** Seconds into the chapter recording. */
  sec: z.number().nonnegative(),
  kind: z.enum(['start', 'roll', 'stop']),
  /** Where the take before this mark ended (a roll or a stop ends one): the paragraph and the word the reading had reached. */
  prev: z.object({ pid: z.string(), word: z.number().int().nonnegative() }).optional(),
  itemGuid: z.string(),
  takeGuid: z.string(),
})
export type PassageMark = z.infer<typeof PassageMark>

/**
 * Audio cloned before a punch or an edit, so it can be put back (Audacity keeps no takes of its own). It covers a stretch either
 * side of the change; the length of that stretch and how long backups are kept are settings.
 */
export const Backup = z.object({
  id: z.string(),
  chapterId: z.string(),
  /** The DAW's id for the clone. */
  guid: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  /** The day it was made (yyyy-mm-dd). */
  at: z.string(),
  /** What it was made for: "Roll at ¶ 3", "Trim white space". */
  label: z.string(),
  /** The day it was put back, once it has been. */
  restored: z.string().optional(),
})
export type Backup = z.infer<typeof Backup>

/** A problem found by the app's own analysis of a recording (a breath, a gap). Proof notes of the same kinds are listed with them. */
export const Detection = z.object({
  id: z.string(),
  chapterId: z.string(),
  ty: FindingType,
  sec: z.number().nonnegative(),
  /** Seconds, and peak level in dB (full scale; absent for gaps). */
  dur: z.number().positive(),
  db: z.number().optional(),
  pid: z.string().nullable(),
  res: z.enum(['fixed']).nullable(),
})
export type Detection = z.infer<typeof Detection>

export const EffectId = z.enum(['pitch', 'deess', 'deplosive', 'declick', 'denoise', 'eq'])
export type EffectId = z.infer<typeof EffectId>
/** A saved set of settings for one effect. */
export const FxPreset = z.object({
  id: z.string(),
  name: z.string(),
  effect: EffectId,
  params: z.record(z.string(), z.number()),
})
export type FxPreset = z.infer<typeof FxPreset>

/** `section`: a stretch of the chapter. `take`: travels with one take. `track`: the whole chapter. */
export const FxScope = z.enum(['section', 'take', 'track'])
export type FxScope = z.infer<typeof FxScope>
export const FxRegion = z.object({
  id: z.string(),
  chapterId: z.string(),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  scope: FxScope,
  /** The take the effect belongs to (scope `take`). */
  takeId: z.string().optional(),
  effect: EffectId,
  /** The preset it started from, for the name. */
  presetId: z.string().optional(),
  params: z.record(z.string(), z.number()),
  bypass: z.boolean().default(false),
})
export type FxRegion = z.infer<typeof FxRegion>


/**
 * Words and their audio cut out of a chapter from the script text. The range is in the chapter recording as it was before any cut
 * (`a`, `b`: seconds), so later cuts and the audio that follows can be placed from it; `off0` and `off1` are the same range as seconds from
 * the start of the take (or of the paragraph, when no take was read). A cut hides the audio, it never erases it: where it lives depends on the
 * DAW (a muted Cuts track, the app's edit list, an Audacity backup) and the words stay in the text, struck through, until the cut is undone.
 */
export const EditCut = z.object({
  id: z.string(),
  chapterId: z.string(),
  pid: z.string(),
  /** The take the words were heard in; absent when the paragraph had no take of its own. */
  takeId: z.string().optional(),
  /** Keys of the words cut (script words and words that were said but not written). */
  keys: z.array(z.string()).min(1),
  /** The words, as shown in the question. */
  text: z.string(),
  a: z.number().nonnegative(),
  b: z.number().positive(),
  off0: z.number(),
  off1: z.number(),
  /** `close`: the audio that follows moves up by the length of the cut. `gap`: the length stays, filled with room tone. */
  mode: z.enum(['close', 'gap']),
  /** Crossfade at the join, in milliseconds (0 for none). */
  fadeMs: z.number().int().nonnegative(),
  /** The DAW the cut was made in, and the id it gave the cut (the muted item, the edit-list entry). */
  daw: z.string(),
  guid: z.string(),
  /** The backup taken before the cut (DAWs that change the audio itself). */
  backupId: z.string().optional(),
  /** The day it was made. */
  at: z.string(),
})
export type EditCut = z.infer<typeof EditCut>

/**
 * An effect on a range of words, from one of the DAW's own saved chains or effects. The item is split at the range and the chain is put on the
 * middle piece. `a` and `b` are in the chapter recording as it was before any cut (like `EditCut`).
 */
export const WordFx = z.object({
  id: z.string(),
  chapterId: z.string(),
  pid: z.string(),
  takeId: z.string().optional(),
  keys: z.array(z.string()).min(1),
  text: z.string(),
  a: z.number().nonnegative(),
  b: z.number().positive(),
  off0: z.number(),
  off1: z.number(),
  /** The chain as the DAW lists it (`chainId` is the DAW's own id) and where the list came from. */
  chainId: z.string(),
  chainName: z.string(),
  source: z.string(),
  fadeMs: z.number().int().nonnegative(),
  daw: z.string(),
  guid: z.string(),
  backupId: z.string().optional(),
  at: z.string(),
})
export type WordFx = z.infer<typeof WordFx>

/** Project settings of the Editing page. */
export const EditorSettings = z.object({
  /** The share of a chapter (percent) effects may cover before the page warns. */
  fxCapPct: z.number().min(0).max(100),
  /** Audacity keeps backups: the audio around a punch or an edit is cloned first, so a punch loses nothing. */
  backups: z.boolean(),
  /** Seconds of audio cloned either side of a punch or an edit. */
  backupWindow: z.number().min(10).max(300),
  /** Days a backup is kept. */
  backupKeepDays: z.number().int().min(1).max(365),
  /** How retries are kept unless a chapter or a passage says otherwise. Nothing is stacked by itself: this only decides what the page offers. */
  retryMode: RetryMode.default('leave'),
  /** Chapters that chose differently from the project, by chapter id. */
  retryChapters: z.record(z.string(), RetryMode).default({}),
})
export type EditorSettings = z.infer<typeof EditorSettings>

export const PickupSource = z.enum(['speech', 'audio', 'proof', 'you'])
/** What a speech check found between two stretches that matched the text: words left out, words added, or other words said. */
export const GapKind = z.enum(['missing', 'extra', 'misread'])
export type GapKind = z.infer<typeof GapKind>
export type PickupSource = z.infer<typeof PickupSource>

export const Pickup = z.object({
  id: z.string(),
  chapterId: z.string(),
  pid: z.string().nullable(),
  t: z.string(),
  ty: FindingType,
  script: z.string(),
  ctx: z.string(),
  src: PickupSource,
  /** How sure the check is. Null with a reason when it cannot say. */
  conf: Confidence.optional(),
  confReason: z.string().optional(),
  /** What kind of gap the speech check found. */
  gap: GapKind.optional(),
  /** Suspected by the live speech check while the narrator was reading in the Booth (the narrator can dismiss it). */
  live: z.boolean().optional(),
  /** The proof note this pickup came from, when it came from one. */
  rid: z.number().optional(),
})
export type Pickup = z.infer<typeof Pickup>

export const MasterRow = z.object({
  /** Chapter id, or 'sample' for the retail sample. */
  id: z.string(),
  label: z.string().optional(),
  waiting: z.string().optional(),
  len: z.string().optional(),
  rms: z.number().optional(),
  peak: z.number().optional(),
  nf: z.number().optional(),
  head: z.number().optional(),
  tail: z.number().optional(),
  clicks: z.string().optional(),
  text: z.string().optional(),
})
export type MasterRow = z.infer<typeof MasterRow>

export const LimitKey = z.enum(['rms', 'peak', 'nf', 'head', 'tail'])
export type LimitKey = z.infer<typeof LimitKey>
export const Limit = z.object({
  l: z.string(),
  u: z.string(),
  lo: z.number().optional(),
  hi: z.number().optional(),
})
export type Limit = z.infer<typeof Limit>
export const Limits = z.record(LimitKey, Limit)
export type Limits = z.infer<typeof Limits>

export const FileFormat = z.object({
  format: z.string(),
  rate: z.string(),
  bitrate: z.string(),
  channels: z.string(),
  max: z.string(),
  sample: z.string(),
  files: z.string(),
})
export type FileFormat = z.infer<typeof FileFormat>

export const DeliveryProfile = z.object({
  key: z.string(),
  name: z.string(),
  builtin: z.boolean(),
  limits: Limits,
  format: FileFormat,
})
export type DeliveryProfile = z.infer<typeof DeliveryProfile>

/** What a milestone measures. 'custom' has no estimate and is marked done by hand. */
export const Measure = z.string() // 'custom' | 'rec' | 'edit' | 'proof' | 'all' | `ch${number}`
export const Milestone = z.object({
  id: z.number(),
  name: z.string(),
  date: z.string(), // yyyy-mm-dd
  done: z.boolean().optional(),
  scope: Measure,
  /** A free note on the milestone (what the platform or a proofer asked for). */
  note: z.string().optional(),
})
export type Milestone = z.infer<typeof Milestone>

/** What a delivery profile unlocks in the app. Every gated option asks for its capability through selectors/platform.ts. */
export const PlatformCapability = z.enum(['checkpoint15'])
export type PlatformCapability = z.infer<typeof PlatformCapability>
/** Where the book is going to be delivered: it unlocks the options that platform asks for and sets sensible defaults. */
export const PlatformProfile = z.object({
  id: z.string(),
  label: z.string(),
  capabilities: z.array(PlatformCapability),
  /** The payment type a contract starts with when the profile is chosen and none was set yet. */
  defaultPayment: z.enum(['pfh', 'royalty', 'none']),
})
export type PlatformProfile = z.infer<typeof PlatformProfile>

/** How the narrator is paid. Only 'pfh' (per finished hour) has a rate to work a value out from. */
export const PaymentKind = z.enum(['pfh', 'royalty', 'none'])
export type PaymentKind = z.infer<typeof PaymentKind>
export const PaymentType = z.object({
  id: PaymentKind,
  label: z.string(),
  /** What the amount is, written after the number; empty when there is no amount. */
  unit: z.string(),
})
export type PaymentType = z.infer<typeof PaymentType>
/** The contract: how it pays and the amount that goes with it (a rate per finished hour, or a royalty share in percent). */
export const Contract = z.object({
  payment: PaymentKind,
  amount: z.number().nonnegative().nullable(),
})
export type Contract = z.infer<typeof Contract>

/**
 * The result of checking a recording against the manuscript, kept with what it was checked against. It is as of the last save of the
 * project: when the chapter's text or its recorded length has moved on since, the result is out of date.
 */
export const RecordingCheck = z.object({
  chapterId: z.string(),
  /** The speech model that did the check. */
  model: z.string(),
  /** The chapter's text when it was checked. */
  textKey: z.string(),
  /** How much of the chapter was recorded (percent) when it was checked. */
  rec: z.number(),
  /** The day it was checked (yyyy-mm-dd). */
  at: z.string(),
  /** The saved project it was checked against (the DAW's last save). */
  basis: z.string().optional(),
  /** Lines to redo found inside the read part. */
  gaps: z.number().int().optional(),
  /** Paragraphs read, and in the chapter. */
  readTo: z.number().int().optional(),
  paras: z.number().int().optional(),
  /** Paragraphs left unread at the start and at the end: unfinished recording, not pickups. */
  unfinished: z.object({ start: z.number().int(), end: z.number().int() }).optional(),
})
export type RecordingCheck = z.infer<typeof RecordingCheck>


/**
 * Stage readiness: where a chapter is in the pipeline and what the narrator decided about moving on. Nothing here is ever applied by the
 * app on its own: a suggestion is derived from the data, and only a narrator's Confirm records a move.
 */
export const StageId = z.enum(['prep', 'record', 'edit', 'proof', 'pickups', 'master', 'delivery'])
export type StageId = z.infer<typeof StageId>
/** One line of a chapter's decision list. The list only grows; a revert is a line of its own. */
export const StageDecision = z.object({
  id: z.number().int(),
  chapterId: z.string(),
  kind: z.enum(['confirmed', 'reverted', 'dismissed']),
  /** The stage the chapter was in and the one it moved to (a revert goes back: `to` is the earlier stage). */
  from: StageId,
  to: StageId,
  /** The day (yyyy-mm-dd) and the evidence key the decision was made on. */
  at: z.string(),
  evidence: z.string(),
})
export type StageDecision = z.infer<typeof StageDecision>
/** What the evidence for a stage looked like when the app last suggested moving on: its key, and each item's value. */
export const StageSuggestion = z.object({
  chapterId: z.string(),
  stage: StageId,
  key: z.string(),
  at: z.string(),
  values: z.record(z.string(), z.string()),
})
export type StageSuggestion = z.infer<typeof StageSuggestion>

/** Which basis the schedule's finished hours are worked out on: the standard rate, or the narrator's own measured rate. */
export const RateBasis = z.enum(['standard', 'own'])
export type RateBasis = z.infer<typeof RateBasis>

/** A status report that was exported: what it was called, its format and which sections it held. (The mock keeps no file.) */
export const StatusReportRecord = z.object({
  id: z.number().int(),
  file: z.string(),
  location: z.string(),
  format: z.enum(['html', 'json']),
  at: z.string(),
  include: z.record(z.string(), z.boolean()),
  size: z.number().int().nonnegative(),
})
export type StatusReportRecord = z.infer<typeof StatusReportRecord>

/** What the narrator did with a finding of a recording check: made it a note, or ignored it. */
export const CheckFindingReview = z.object({
  id: z.string(),
  chapterId: z.string(),
  status: z.enum(['accepted', 'ignored']),
  /** The proof note an accepted finding became. */
  noteId: z.number().int().optional(),
})
export type CheckFindingReview = z.infer<typeof CheckFindingReview>

/** One day's recorded audio, as a measurement reports it. */
export const RecordedDay = z.object({ date: z.string(), seconds: z.number().nonnegative() })
export type RecordedDay = z.infer<typeof RecordedDay>

export const ProjectRef = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  when: z.string(),
})
export type ProjectRef = z.infer<typeof ProjectRef>

export const HeadingStyleSchema = z.enum(['gutenberg', 'numbered', 'colon'])
export const Manuscript = z.object({
  name: z.string(),
  path: z.string(),
  imported: z.string(),
  /** How the manuscript wrote its chapter headings. */
  headingStyle: HeadingStyleSchema,
})
export type Manuscript = z.infer<typeof Manuscript>

/** What the manuscript being imported or swapped in would change (sample until a real parse exists). */
export const PendingManuscript = z.object({
  /** Chapters whose text differs from the project's current manuscript. */
  changes: z.array(z.object({ chapterId: z.string(), what: z.string() })),
  characterSuggestions: z.number().int().nonnegative(),
  itemsToReview: z.number().int().nonnegative(),
  /** A subtitle the parser found inside a chapter heading. */
  subtitle: z.object({ chapterId: z.string(), text: z.string() }).optional(),
})
export type PendingManuscript = z.infer<typeof PendingManuscript>

export const Dictionary = z.object({ pos: z.string(), def: z.string(), say: z.string(), ipa: z.string() })
export type Dictionary = z.infer<typeof Dictionary>

/** Everything about the book that is data rather than screen state. */
export const BookData = z.object({
  projectName: z.string(),
  /** The id of the project's delivery profile (fixtures/platforms.ts). */
  deliveryProfile: z.string(),
  today: z.string(),
  due: z.string(),
  manuscript: Manuscript,
  chapters: z.array(Chapter),
  paragraphs: z.array(Paragraph),
  /** Speakers the narrator confirmed, by phrase key ("8-2:0"): an alias of a speaking Story Bible entry. */
  confirmedSpeakers: z.record(z.string(), Speaker),
  annotations: z.array(Annotation),
  /** The narrator's bookmarks for the book (cleared when the manuscript is replaced). */
  bookmarks: z.array(Bookmark).default([]),
  marks: z.array(MarkType),
  bibleTypes: z.array(StoryBibleType),
  bible: z.array(BibleEntry),
  relationships: z.array(Relationship),
  /** What an extraction (rules, an imported file, a local model) offered; rejected ones stay as tombstones. Cleared when the manuscript is replaced. */
  suggestions: z.array(ExtractionSuggestion).default([]),
  pronunciations: z.record(z.string(), Pronunciation),
  dictionary: z.record(z.string(), Dictionary),
  proofNotes: z.array(ProofNote),
  passages: z.array(Passage),
  /** The Booth's log of where each take began. */
  passageMap: z.array(PassageMark),
  /** Audio cloned before punches and edits, newest last. */
  backups: z.array(Backup),
  detections: z.array(Detection),
  fxPresets: z.array(FxPreset),
  fxRegions: z.array(FxRegion),
  /** Words cut from the chapters through the script, and effects put on ranges of words. */
  cuts: z.array(EditCut).default([]),
  wordFx: z.array(WordFx).default([]),
  /** Words the narrator said on purpose or read differently on purpose ("keep this addition", "it is right"): they stop being flagged. By word key. */
  accepted: z.array(z.string()).default([]),
  editor: EditorSettings,
  pickups: z.array(Pickup),
  pickDone: z.array(z.string()),
  pickOut: z.array(z.string()),
  pickGone: z.array(z.string()),
  /** Pickups whose done state could not be written to the DAW's markers yet (it was not running). */
  pickSync: z.array(z.string()).default([]),
  /** Where the narrator stopped in each chapter, by chapter id. */
  resume: z.record(z.string(), ResumePoint).default({}),
  /** Recording checks that have been run, one per chapter (the latest). */
  checks: z.array(RecordingCheck),
  /** What the narrator decided on each finding of a recording check. */
  findingReviews: z.array(CheckFindingReview).default([]),
  /** Stage readiness: decisions (append-only) and the evidence the app last suggested moving on. */
  stageDecisions: z.array(StageDecision).default([]),
  stageSuggestions: z.array(StageSuggestion).default([]),
  /** The basis the schedule's finished hours use. */
  rateBasis: RateBasis.default('standard'),
  /** Status reports exported, and the folder they are saved to. */
  reports: z.array(StatusReportRecord).default([]),
  reportDir: z.string().default(''),
  masterRows: z.array(MasterRow),
  profiles: z.array(DeliveryProfile),
  milestones: z.array(Milestone),
  contract: Contract,
  projects: z.array(ProjectRef),
  pendingManuscript: PendingManuscript,
})
export type BookData = z.infer<typeof BookData>
