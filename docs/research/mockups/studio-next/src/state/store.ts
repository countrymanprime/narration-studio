/**
 * The one store. Plain TypeScript, no framework state library:
 *  - `update(fn)` changes state (immer, so untouched parts keep their identity);
 *  - `act(label, fn, opts)` changes state AND records an undoable history entry from the patches;
 *  - `useStudio(selector)` subscribes a component. The selector must return a stable value
 *    (a slice of state), never a freshly built array or object: derive those with useMemo.
 */
import { applyPatches, enablePatches, produce, produceWithPatches, type Draft, type Patch } from 'immer'
import { useSyncExternalStore } from 'react'
import { makeBook, type BookOptions } from '@/fixtures/book'
import { DAW_LABEL, SETUP_DAW } from '@/fixtures/daw'
import { setBackupsSource } from '@/selectors/daw'
import { resetDaw } from './daw'
import { initialMock } from './slices/mock'
import { initialPrefs, initialUi, type Prefs } from './slices/ui'
import type { HistoryEntry, StudioState } from './types'

enablePatches()

const PREF_KEY = 'ns-prefs'
const MARKS_KEY = 'ns4-marks'
function loadPrefs(): Prefs {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(PREF_KEY)
    return raw ? { ...initialPrefs, ...JSON.parse(raw) } : initialPrefs
  } catch {
    return initialPrefs
  }
}
function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(p))
  } catch {
    /* storage can be unavailable; the app works without it */
  }
}

export function createInitialState(opts: BookOptions & { prefs?: Prefs } = {}): StudioState {
  const data = makeBook(opts)
  try {
    const m = typeof localStorage === 'undefined' ? null : localStorage.getItem(MARKS_KEY)
    if (m) data.marks = JSON.parse(m)
  } catch {
    /* use the default marks */
  }
  const prefs = opts.prefs ?? loadPrefs()
  return { data, ui: initialUi(prefs), mock: initialMock, history: [] }
}

let state: StudioState = createInitialState()
setBackupsSource(() => state.data.editor.backups)
const listeners = new Set<() => void>()
const emit = (): void => listeners.forEach((l) => l())

export const getState = (): StudioState => state
export const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

function commit(next: StudioState): void {
  if (next === state) return
  const prefsChanged = next.ui.prefs !== state.ui.prefs
  const marksChanged = next.data.marks !== state.data.marks
  state = next
  if (prefsChanged) savePrefs(next.ui.prefs)
  if (marksChanged) {
    try {
      localStorage.setItem(MARKS_KEY, JSON.stringify(next.data.marks))
    } catch {
      /* storage can be unavailable */
    }
  }
  emit()
}

/** Replace the whole state (tests, scenarios, "reset"). */
export function resetState(next: StudioState = createInitialState()): void {
  resetDaw()
  state = next
  histId = 0
  emit()
}

/**
 * A page can stop a change of state from going through. Returning true means the guard took it over (it asks the narrator first and
 * calls `replay` to make the same change if the answer is yes). The Booth uses it so nothing leaves the page while a take is recording.
 */
export type ChangeGuard = (current: StudioState, next: StudioState, replay: () => void) => boolean
let guard: ChangeGuard | null = null
export function setChangeGuard(g: ChangeGuard | null): void {
  guard = g
}

/** Change state without recording history. */
export function update(fn: (d: Draft<StudioState>) => void): void {
  const next = produce(state, fn)
  if (guard && guard(state, next, () => update(fn))) return
  commit(next)
}

let histId = 0
export interface ActOptions {
  /** The change is made in the DAW too. */
  daw?: boolean
  /** Extra UI paths to restore on undo, as dotted paths under `ui` (e.g. 'proof.sel'). Book data is always restored. */
  restoreUi?: string[]
}

const pathKey = (p: Patch['path']): string => p.slice(0, 3).join('/')
const overlaps = (a: string, b: string): boolean => a.startsWith(b) || b.startsWith(a)

/** Change state and record how to undo it. Returns the entry so a toast can offer Undo for exactly this change. */
export function act(label: string, fn: (d: Draft<StudioState>) => void, opts: ActOptions = {}): HistoryEntry {
  const keep = (opts.restoreUi ?? []).map((p) => 'ui/' + p.split('.').join('/'))
  const [next, forward, inverse] = produceWithPatches(state, fn)
  const wanted = (p: Patch): boolean => p.path[0] === 'data' || keep.some((k) => p.path.join('/').startsWith(k))
  const own = inverse.filter(wanted)
  const patches = forward.filter(wanted)
  const entry: HistoryEntry = {
    id: ++histId, label, daw: !!opts.daw, inverse: own, paths: patches.map((p) => pathKey(p.path)),
  }
  commit({ ...next, history: [...next.history, entry].slice(-40) })
  return entry
}

export interface UndoResult { ok: boolean; message: string }

/** Undo one entry. Refuses (with the reason) when a later change touches the same data, or when it is a DAW change that is no longer the last. */
export function undoEntry(entry: HistoryEntry): UndoResult {
  const h = state.history
  const i = h.findIndex((e) => e.id === entry.id)
  if (i < 0) return { ok: false, message: 'Already undone.' }
  const later = h.slice(i + 1)
  if (entry.daw && later.length) return { ok: false, message: 'Undo “' + h[h.length - 1].label + '” first. It came after this.' }
  if (entry.daw && state.mock.setup === 'reaper' && state.mock.reaperTop === 'other')
    return { ok: false, message: DAW_LABEL[SETUP_DAW[state.mock.setup]] + '’s last action is not this one, so it was left alone. Use Edit > Undo in ' + DAW_LABEL[SETUP_DAW[state.mock.setup]] + '.' }
  if (later.some((e) => e.paths.some((p) => entry.paths.some((q) => overlaps(p, q)))))
    return { ok: false, message: 'Undo “' + later[later.length - 1].label + '” first. It changed the same thing.' }
  try {
    const restored = applyPatches(state, entry.inverse)
    commit({ ...restored, history: restored.history.filter((e) => e.id !== entry.id) })
    return { ok: true, message: 'Undid: ' + entry.label }
  } catch {
    return { ok: false, message: 'That change could not be undone.' }
  }
}

export function undoLast(): UndoResult {
  const e = state.history[state.history.length - 1]
  return e ? undoEntry(e) : { ok: false, message: 'Nothing to undo' }
}

export function useStudio<T>(selector: (s: StudioState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state))
}
export const useData = () => useStudio((s) => s.data)
export const useUi = () => useStudio((s) => s.ui)
export const useMock = () => useStudio((s) => s.mock)
export const useHistory = () => useStudio((s) => s.history)
