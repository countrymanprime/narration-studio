/** What the screens ask about the DAW: its name, its capabilities in the current setup, the guids the app holds. Pure; the DAW itself is state/daw.ts. */
import type { Capability, DawCapabilities, DawProjectState, DawTrack, Refusal } from '@/domain/daw'
import { fmtD, parseIso } from '@/format/time'
import { AUDACITY_BACKUP_CAPS, CAPABILITY_SETS, DAW_LABEL, DAW_SHORT, RANGE_PLAN, REFUSAL_TEXT, SETUP_DAW, STACK_PLAN, type RangePlan } from '@/fixtures/daw'
import type { MockState } from '@/state/slices/mock'

type Setup = MockState['setup']

export const dawIdOf = (setup: Setup): string => SETUP_DAW[setup] ?? setup
/** "REAPER", "The built-in recorder", "Audacity": for a sentence. */
export const dawLabel = (daw: string): string => DAW_LABEL[daw] ?? daw
/** "REAPER", "Built-in recorder", "Audacity": for a chip. */
export const dawShort = (daw: string): string => DAW_SHORT[daw] ?? daw

/** What the DAW of this setup can do now. Audacity with backups on clones the audio around a punch, so its roll is no longer destructive. */
export function capabilitiesFor(setup: Setup, backups = false): DawCapabilities {
  const base = CAPABILITY_SETS[setup] ?? CAPABILITY_SETS.reaper
  if (!(backups && base.daw === 'audacity')) return base
  return { ...base, caps: { ...base.caps, ...AUDACITY_BACKUP_CAPS } }
}
/** Backups are a project setting (Editing, Backups): with them on, Audacity's roll is no longer destructive. */
let backupsSource: () => boolean = () => false
/** The store tells this module where the setting lives (kept out of here so selectors do not import the store). */
export function setBackupsSource(fn: () => boolean): void {
  backupsSource = fn
}
export const backupsOn = (): boolean => backupsSource()
export const capsOf = (m: Pick<MockState, 'setup'>, backups: boolean = backupsOn()): DawCapabilities => capabilitiesFor(m.setup, backups)
export const capOf = (m: Pick<MockState, 'setup'>, name: string): Capability | undefined => capsOf(m).caps[name]

/** Whether the connected DAW offers a capability now, what the DAW is called, and why not when it is not offered. */
export function gateOf(m: Pick<MockState, 'setup'>, name: string): { ok: boolean; label: string; reason: string } {
  const c = capsOf(m)
  const cap = c.caps[name]
  return { ok: !!cap?.available, label: dawLabel(c.daw), reason: cap?.reason ?? '' }
}

/**
 * Whether the narrator can change something that lives in the DAW. The built-in recorder is the app's own, so the app makes those
 * changes itself; every other DAW answers by its capability, with its own reason when it cannot.
 */
export function editGateOf(m: Pick<MockState, 'setup'>, name: string): { ok: boolean; label: string; reason: string } {
  const c = capsOf(m)
  return c.daw === 'builtin' ? { ok: true, label: dawLabel(c.daw), reason: '' } : gateOf(m, name)
}

/** How stacking retries is done and undone in the connected DAW, in words, with the edits the app performs where the DAW has no native way. */
export function stackPlanOf(m: Pick<MockState, 'setup'>): { mode: NonNullable<Capability['mode']>; undo: string; steps: string[]; undoSteps: number } {
  const c = capsOf(m)
  const mode = c.caps.stackTakes?.mode ?? (c.daw === 'builtin' ? 'app' : 'native')
  const plan = STACK_PLAN[mode]
  const n = Math.max(1, plan.steps.length)
  return { mode, undo: plan.undo.replace('{daw}', dawLabel(c.daw)).replace('{n}', String(n)), steps: plan.steps, undoSteps: mode === 'steps' ? n : mode === 'native' ? 1 : 0 }
}

/** The text of a refusal, with the DAW named. */
export function refusal(code: string, daw: string): Refusal {
  return { code, reason: (REFUSAL_TEXT[code] ?? code).replace('{daw}', dawLabel(daw)) }
}

export { guidOf } from '@/format/guid'

/** Seconds into the recording where the last item on a track ends; 0 for an empty track. */
export const lastEnd = (t: DawTrack | undefined): number => (t ? t.items.reduce((a, i) => Math.max(a, i.end), 0) : 0)

/**
 * What "as of last save" means right now: when the project was saved, and whether the DAW has changes since that the checks and
 * measurements do not include. Empty when the DAW keeps no saved project.
 */
export function saveNote(state: Pick<DawProjectState, 'savedAt' | 'unsavedChanges'>, daw: string): string {
  if (!state.savedAt) return ''
  const [day, time] = state.savedAt.split('T')
  const when = fmtD(parseIso(day)) + (time ? ', ' + time : '')
  return 'Project saved ' + when + (state.unsavedChanges ? '. Changes in ' + dawLabel(daw) + ' since then are not included' : '')
}

/**
 * What cutting words and adding an effect to words do in the connected DAW, in words: where the audio goes, how it is undone, how many undo
 * points it adds, and whether the DAW changes the audio itself (so a backup comes first). `{daw}` is already filled in; `{n}`, `{chain}`,
 * `{from}` and `{to}` are filled by `fillPlan`.
 */
export function rangePlanOf(m: Pick<MockState, 'setup'>): RangePlan & { mode: NonNullable<Capability['mode']>; daw: string } {
  const c = capsOf(m)
  const mode = c.caps.cutRange?.mode ?? (c.daw === 'builtin' ? 'app' : c.daw === 'audacity' ? 'steps' : 'native')
  const plan = RANGE_PLAN[mode]
  const name = dawLabel(c.daw)
  const own = (t: string): string => t.replace(/\{daw\}/g, name)
  return { ...plan, cut: own(plan.cut), cutUndo: own(plan.cutUndo), fx: own(plan.fx), fxUndo: own(plan.fxUndo), mode, daw: c.daw }
}
/** Fill the words, the chain and the backed-up stretch into a sentence of a plan. */
export const fillPlan = (t: string, v: { n?: number; chain?: string; from?: string; to?: string }): string =>
  t.replace(/\{n\}/g, String(v.n ?? '')).replace(/\{chain\}/g, v.chain ?? '').replace(/\{from\}/g, v.from ?? '').replace(/\{to\}/g, v.to ?? '')
