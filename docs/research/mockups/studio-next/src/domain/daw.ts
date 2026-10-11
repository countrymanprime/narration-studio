/**
 * What the app knows about a DAW (REAPER, the built-in recorder, Audacity, others): what it can do right now, what a call
 * answered, and the state of the project. Everything the host reports crosses here, so a real bridge is checked against the
 * same schemas the mock is.
 */
import { z } from 'zod'

/** How far the app's support for a capability goes in this DAW. */
export const CapabilityLevel = z.enum(['supported', 'experimental', 'unsupported', 'notYetAvailable'])
export type CapabilityLevel = z.infer<typeof CapabilityLevel>

export const Capability = z.object({
  level: CapabilityLevel,
  /** Whether it can be used now (a DAW that is not running offers nothing). */
  available: z.boolean(),
  /** Why it cannot be used. Controls show this text; they never word their own refusal. */
  reason: z.string().optional(),
  /** Doing it replaces audio that cannot be brought back (a roll in a DAW with no backups): ask first. */
  destructive: z.boolean().optional(),
  /**
   * How a change that needs several edits is made: `native` (the DAW does it itself, one undo step), `app` (the app makes it, the DAW keeps
   * no project of its own) or `steps` (the app performs the edits one after another in a DAW with no native way).
   */
  mode: z.enum(['native', 'app', 'steps']).optional(),
})
export type Capability = z.infer<typeof Capability>

/** The DAW the project is connected to. `daw` is open-ended: reaper, builtin, audacity, and whatever comes next. */
export const DawCapabilities = z.object({
  daw: z.string(),
  reachable: z.boolean(),
  caps: z.record(z.string(), Capability),
})
export type DawCapabilities = z.infer<typeof DawCapabilities>

/** What a call to the DAW answered. A refused call changed nothing; `refused` holds the reason and `message` repeats it. */
export const DawResult = z.object({
  ok: z.boolean(),
  /** The project was changed. */
  changed: z.boolean(),
  message: z.string(),
  /** How many undo points the DAW added: 0 for a cursor move, 1 for one command. */
  undoSteps: z.number().int().min(0).max(12),
  refused: z.string().optional(),
  /** The edits a multi-step change performed, in order (a DAW that has no native way to do it). */
  steps: z.array(z.string()).optional(),
})
export type DawResult = z.infer<typeof DawResult>

export const dawOk = (message: string, o: { changed?: boolean; undoSteps?: number; steps?: string[] } = {}): DawResult => {
  const changed = o.changed ?? true
  return { ok: true, changed, message, undoSteps: o.undoSteps ?? (changed ? 1 : 0), ...(o.steps?.length ? { steps: o.steps } : {}) }
}
export const dawRefused = (reason: string): DawResult => ({ ok: false, changed: false, message: reason, undoSteps: 0, refused: reason })

/** Why Record cannot start: a code, and the reason the control shows. */
export const Refusal = z.object({ code: z.string(), reason: z.string() })
export type Refusal = z.infer<typeof Refusal>

/** The project as the DAW has it: as last saved, and what is only live. */
export const DawProjectState = z.object({
  /** When the project was last saved (local date and time); null when the DAW keeps no saved project. */
  savedAt: z.string().nullable(),
  unsavedChanges: z.boolean(),
  playState: z.enum(['stopped', 'playing', 'recording']),
  playPosition: z.number().nonnegative(),
})
export type DawProjectState = z.infer<typeof DawProjectState>

/** A stretch of audio on a track. Items and takes are known by guid, never by their time. */
export const DawItem = z.object({ guid: z.string(), start: z.number().nonnegative(), end: z.number().nonnegative(), takeGuids: z.array(z.string()) })
export type DawItem = z.infer<typeof DawItem>
export const DawTrack = z.object({ guid: z.string(), name: z.string(), chapterId: z.string(), armed: z.boolean(), items: z.array(DawItem) })
export type DawTrack = z.infer<typeof DawTrack>

/** A project marker. `ref` is the id the app stamped on it (a pickup's id). */
export const DawMarker = z.object({ guid: z.string(), chapterId: z.string(), sec: z.number().nonnegative(), label: z.string(), ref: z.string().optional() })
export type DawMarker = z.infer<typeof DawMarker>

/** The prefixes of marker names: the DAW-side truth for a pickup is `PICKUP:` (open) or `PICKUP_DONE:`. */
export const MARKER_KINDS = ['PICKUP', 'PICKUP_DONE'] as const
export type MarkerKind = (typeof MARKER_KINDS)[number] | string

/** The ids of an item and a take as the app last read them. The DAW refuses a call whose guid no longer matches. */
export const TakeHandle = z.object({ itemGuid: z.string(), takeGuid: z.string() })
export type TakeHandle = z.infer<typeof TakeHandle>

/** Where the narrator stopped in a chapter: the paragraph and the word in it. `source` says where the answer came from. */
export const ResumePoint = z.object({
  pid: z.string(),
  word: z.number().int().nonnegative(),
  source: z.enum(['live', 'saved', 'booth']),
  /** False when the position is an estimate. */
  confident: z.boolean(),
})
export type ResumePoint = z.infer<typeof ResumePoint>

/** A line the live speech check suspects was skipped or read again. Automatic only; the narrator can dismiss it. */
export const LiveFlag = z.object({
  chapterId: z.string(),
  pid: z.string(),
  kind: z.enum(['skip', 'restart']),
  /** The words involved, as [first, last+1) word numbers in the paragraph. */
  words: z.tuple([z.number().int().nonnegative(), z.number().int().positive()]),
  /** What was heard, when known. */
  heard: z.string().optional(),
})
export type LiveFlag = z.infer<typeof LiveFlag>

/** One take moved by stacking (or by un-stacking): where it began and where it begins afterwards, seconds into the chapter recording. */
export const StackMove = z.object({ takeId: z.string(), from: z.number().nonnegative(), to: z.number().nonnegative(), len: z.number().positive() })
export type StackMove = z.infer<typeof StackMove>
/** The takes of one passage a stack call moves. `itemGuid` is the item as the app last read it: the DAW refuses a call whose id no longer matches. */
export const StackGroup = z.object({ passageId: z.string(), itemGuid: z.string(), base: z.string(), moves: z.array(StackMove).min(1) })
export type StackGroup = z.infer<typeof StackGroup>
/** `shift` is how far the audio that follows moves (negative: earlier), summed over the groups. */
export const StackRequest = z.object({ chapterId: z.string(), groups: z.array(StackGroup).min(1), shift: z.number() })
export type StackRequest = z.infer<typeof StackRequest>

/**
 * Cutting a range from the script: the words' audio from `start` to `end` (seconds in the chapter recording, snapped to a zero crossing).
 * `itemGuid` is the item the words sit in as the app last read it; the DAW refuses a call whose id no longer matches.
 */
export const RangeRequest = z.object({
  chapterId: z.string(),
  /** The passage (or, with none, the chapter's track) the words sit in, and the item's id as the app last read it. */
  itemKey: z.string(),
  itemGuid: z.string(),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  /** How many words the range holds, for the undo name. */
  words: z.number().int().positive(),
})
export type RangeRequest = z.infer<typeof RangeRequest>
export const DeleteRangeRequest = RangeRequest.extend({
  /** `close`: later audio moves up. `gap`: the length stays, filled with room tone. */
  mode: z.enum(['close', 'gap']),
  fadeMs: z.number().int().nonnegative(),
})
export type DeleteRangeRequest = z.infer<typeof DeleteRangeRequest>
/** An effect on a range: one of the chains or effects the DAW itself lists. */
export const FxRangeRequest = RangeRequest.extend({ chainId: z.string(), chainName: z.string(), fadeMs: z.number().int().nonnegative() })
export type FxRangeRequest = z.infer<typeof FxRangeRequest>

/** One saved chain, effect or macro as a DAW lists it. `id` is the DAW's own. */
export const FxChoice = z.object({ id: z.string(), name: z.string() })
export type FxChoice = z.infer<typeof FxChoice>
/** What a DAW offers for Add FX: where the list comes from ("Your REAPER FX chains") and the entries. */
export const FxList = z.object({ source: z.string(), choices: z.array(FxChoice) })
export type FxList = z.infer<typeof FxList>
