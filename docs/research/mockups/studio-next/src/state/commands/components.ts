/**
 * The optional analysis tools: download (with progress, cancel, retry), remove, and the "ask first" preference. The provider does the
 * downloading; this keeps what the screens show. A download is not book data, so it is not in the undo history; a scan is.
 */
import { announce, toast } from '@/ui/overlay'
import { componentProvider } from '@/providers/components'
import { statusOf } from '@/selectors/components'
import { getState, update } from '../store'
import type { Prefs } from '../slices/ui'

const running = new Map<string, AbortController>()
const specOf = (id: string) => componentProvider().specs().find((s) => s.id === id)

const setInstalled = (id: string, on: boolean): void =>
  update((d) => {
    const have = d.ui.prefs.installedComponents.filter((x) => x !== id)
    d.ui.prefs.installedComponents = on ? [...have, id] : have
  })

/** Start downloading one component. Does nothing if it is already there, already downloading, or cannot be downloaded. */
export async function installComponent(id: string): Promise<boolean> {
  const spec = specOf(id)
  if (!spec) return false
  const status = statusOf(getState().ui, spec)
  if (status === 'installed' || status === 'downloading' || status === 'verifying' || status === 'unavailable') return false
  const ctl = new AbortController()
  running.set(id, ctl)
  update((d) => { d.ui.components[id] = { phase: 'downloading', pct: 0 } })
  const res = await componentProvider().install(id, (p) => update((d) => { if (d.ui.components[id]) d.ui.components[id] = { phase: p.phase, pct: p.pct } }), ctl.signal)
  running.delete(id)
  if (res.ok) {
    update((d) => { delete d.ui.components[id] })
    setInstalled(id, true)
    toast(spec.name + ' is downloaded and ready.')
    announce(spec.name + ' downloaded.')
    return true
  }
  if (res.kind === 'cancelled') {
    update((d) => { delete d.ui.components[id] })
    toast('Download of ' + spec.name + ' cancelled.')
    return false
  }
  update((d) => { d.ui.components[id] = { phase: 'failed', pct: d.ui.components[id]?.pct ?? 0, reason: res.reason } })
  announce(spec.name + ' could not be downloaded. ' + res.reason)
  return false
}

/** Download several (the consent dialog's Download). They run one after another so the disk and the connection are not shared out. */
export async function installComponents(ids: string[]): Promise<void> {
  for (const id of ids) await installComponent(id)
}

export function cancelInstall(id: string): void {
  running.get(id)?.abort()
}

/** Forget a failed download so the row goes back to Download. */
export function dismissFailure(id: string): void {
  update((d) => { if (d.ui.components[id]?.phase === 'failed') delete d.ui.components[id] })
}

export async function removeComponent(id: string): Promise<boolean> {
  const spec = specOf(id)
  if (!spec || !getState().ui.prefs.installedComponents.includes(id)) return false
  const res = await componentProvider().remove(id)
  if (!res.ok) { toast(res.reason); return false }
  setInstalled(id, false)
  toast(spec.name + ' removed.')
  return true
}

export function setAnalysisPrompt(v: Prefs['analysisPrompt']): void {
  update((d) => { d.ui.prefs.analysisPrompt = v })
}
