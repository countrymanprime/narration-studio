import type { Draft } from 'immer'
import type { StudioState } from '../types'
import type { FileFormat, LimitKey } from '@/domain/schemas'
import { toast } from '@/ui/overlay'
import { getState, update } from '../store'

export function setProfile(key: string): void {
  update((d) => {
    d.ui.delivery.profile = key
    d.ui.delivery.built = false
  })
}
/** The custom profile is the only one that can be edited; these changes are settings, not undoable steps. */
const custom = (d: Draft<StudioState>) => d.data.profiles.find((p) => !p.builtin)

export function renameProfile(name: string): void {
  const v = name.trim()
  if (!v) return
  update((d) => { const p = custom(d); if (p) p.name = v })
}
export function setLimit(k: LimitKey, field: 'lo' | 'hi', v: number): void {
  if (Number.isNaN(v)) return
  update((d) => {
    const p = custom(d)
    if (p) p.limits[k][field] = v
    d.ui.delivery.built = false
  })
}
export function setFormat(f: keyof FileFormat, v: string): void {
  update((d) => { const p = custom(d); if (p) p.format[f] = v })
}
export const setOutput = (v: string): void => update((d) => { d.ui.delivery.out = v })
export function buildPackage(name: string): void {
  update((d) => { d.ui.delivery.built = true })
  toast('Built the ' + name + ' package.')
}
export const openOutput = (): void => toast('Opened ' + getState().ui.delivery.out)
