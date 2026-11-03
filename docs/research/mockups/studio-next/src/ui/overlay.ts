/**
 * Overlays: modals, popovers, context menus and toasts. A tiny store of their own, so any code
 * (a command, a menu item, a keyboard handler) can open one without being a component.
 */
import type { CSSProperties, ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import { getState, undoEntry } from '@/state/store'
import type { HistoryEntry } from '@/state/types'

export interface ModalSpec {
  id: number
  label: string
  wide?: boolean
  /** Full-screen, no scrim click or Escape (the project picker). */
  full?: boolean
  /** A panel that slides in from the right edge (stage readiness). */
  side?: boolean
  render: (api: { close: () => void }) => ReactNode
  onClose?: () => void
  /** Element focus returns to */
  opener: HTMLElement | null
}
export interface PopoverSpec {
  id: number
  /** Position in the zoomed page, or an element to sit under */
  x: number
  y: number
  className: string
  render: (api: { close: () => void }) => ReactNode
  /** Element focus returns to */
  opener: HTMLElement | null
  style?: CSSProperties
  /** y is the top of the element the popover opens above, so it grows upward */
  above?: boolean
}
export type CtxItem =
  | { sep: true }
  | { label: string }
  | { l: string; fn?: () => void; disabled?: boolean; checked?: boolean; k?: string; sw?: string; sub?: CtxItem[]; /** Why it is disabled, or what it does. */ title?: string }
export interface CtxSpec { id: number; items: CtxItem[]; x: number; y: number; opener: HTMLElement | null }
export interface ToastSpec { id: number; msg: string; undo?: () => void }

export interface OverlayState {
  modals: ModalSpec[]
  popover: PopoverSpec | null
  ctx: CtxSpec | null
  toasts: ToastSpec[]
  /** The live-region message for screen readers */
  announcement: string
}

let state: OverlayState = { modals: [], popover: null, ctx: null, toasts: [], announcement: '' }
const listeners = new Set<() => void>()
let seq = 0
const set = (next: Partial<OverlayState>): void => {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}
export const getOverlay = (): OverlayState => state
/** Run `fn` whenever any overlay opens or closes; returns the unsubscribe. */
export const subscribeOverlay = (fn: () => void): (() => void) => (listeners.add(fn), () => { listeners.delete(fn) })
export const useOverlay = (): OverlayState => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state)

const zoom = (): number => getState().ui.prefs.zoom || 1
const activeEl = (): HTMLElement | null => (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null)

export function toast(msg: string, undo?: () => void, ms = 5000): void {
  const id = ++seq
  const keep = state.toasts.length >= 2 ? state.toasts.slice(1) : state.toasts
  set({ toasts: [...keep, { id, msg, undo }] })
  setTimeout(() => set({ toasts: state.toasts.filter((t) => t.id !== id) }), ms)
}
/** A toast whose Undo undoes exactly one recorded change (and says so, or says why not). */
export function toastUndo(msg: string, entry: HistoryEntry, ms = 7000): void {
  toast(msg, () => toast(undoEntry(entry).message), ms)
}
export const dismissToast = (id: number): void => set({ toasts: state.toasts.filter((t) => t.id !== id) })
export const announce = (t: string): void => set({ announcement: t })

export function openModal(spec: Omit<ModalSpec, 'id' | 'opener'>): () => void {
  const id = ++seq
  const m: ModalSpec = { ...spec, id, opener: activeEl() }
  set({ modals: [...state.modals, m] })
  return () => closeModal(id)
}
export function closeModal(id: number): void {
  const m = state.modals.find((x) => x.id === id)
  if (!m) return
  set({ modals: state.modals.filter((x) => x.id !== id) })
  m.onClose?.()
  m.opener?.isConnected && m.opener.focus?.()
}
export const closeTopModal = (): void => {
  const m = state.modals[state.modals.length - 1]
  if (m) closeModal(m.id)
}

export function closePop(): void {
  if (state.popover || state.ctx) set({ popover: null, ctx: null })
}
export function openPopoverAt(x: number, y: number, render: PopoverSpec['render'], className = '', opener: HTMLElement | null = activeEl(), style?: CSSProperties): void {
  set({ ctx: null, popover: { id: ++seq, x, y, className, render, opener, style } })
}
/** Open a popover under an element. */
export function popAt(el: HTMLElement, render: PopoverSpec['render'], className = ''): void {
  const r = el.getBoundingClientRect()
  const z = zoom()
  openPopoverAt(r.left / z, r.bottom / z + 6, render, className, el)
}
/** Open a popover above an element (for controls at the bottom of the window). */
export function popAbove(el: HTMLElement, render: PopoverSpec['render'], className = ''): void {
  const r = el.getBoundingClientRect()
  const z = zoom()
  set({ ctx: null, popover: { id: ++seq, x: r.left / z, y: r.top / z - 6, className, render, opener: el, above: true } })
}
export function openCtx(items: CtxItem[], x: number, y: number): void {
  set({ popover: null, ctx: { id: ++seq, items, x, y, opener: activeEl() } })
}
/** Open the context menu under an element. */
export function openCtxAt(el: HTMLElement, items: CtxItem[]): void {
  const r = el.getBoundingClientRect()
  const z = zoom()
  openCtx(items, r.left / z, r.bottom / z + 4)
}

export const I = (l: string, fn?: () => void, o: { disabled?: boolean; checked?: boolean; k?: string; sw?: string; title?: string } = {}): CtxItem => ({ l, fn, ...o })
export const L = (label: string): CtxItem => ({ label })
export const SEP: CtxItem = { sep: true }
export const SUB = (l: string, sub: CtxItem[], o: { disabled?: boolean; title?: string } = {}): CtxItem => ({ l, sub, ...o })
