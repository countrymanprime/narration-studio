/**
 * Where the optional analysis tools come from. The provider lists them and installs or removes one, reporting progress; the mock
 * paces a download over time and can fail the ways a real one can (host unreachable, no room on the disk). It never touches a network.
 * A real provider replaces it without any screen changing.
 */
import { COMPONENT_STEP_MS, COMPONENT_STEP_PCT, COMPONENT_VERIFY_MS } from '@/config/components'
import { ComponentSpec, type AnalysisHost } from '@/domain/components'
import { COMPONENT_SPECS, HOST_FREE_DISK_MB } from '@/fixtures/components'
import { sizeText } from '@/format/size'
import { getState } from '@/state/store'

export interface InstallProgress { phase: 'downloading' | 'verifying'; pct: number }
export type InstallResult = { ok: true } | { ok: false; kind: 'unreachable' | 'disk' | 'cancelled' | 'unavailable'; reason: string }

export interface ComponentProvider {
  specs(): ComponentSpec[]
  install(id: string, onProgress: (p: InstallProgress) => void, signal?: AbortSignal): Promise<InstallResult>
  remove(id: string): Promise<{ ok: true } | { ok: false; reason: string }>
}

export interface MockComponentOptions {
  specs?: ComponentSpec[]
  host?: () => AnalysisHost
  freeDiskMB?: (host: AnalysisHost) => number
  stepMs?: number
  stepPct?: number
  verifyMs?: number
}

const wait = (ms: number, signal?: AbortSignal): Promise<boolean> =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve(false)
    const done = (): void => { signal?.removeEventListener('abort', stop); resolve(true) }
    const t = setTimeout(done, ms)
    const stop = (): void => { clearTimeout(t); resolve(false) }
    signal?.addEventListener('abort', stop, { once: true })
  })

export function createMockComponents(o: MockComponentOptions = {}): ComponentProvider {
  const specs = (o.specs ?? COMPONENT_SPECS).map((s) => ComponentSpec.parse(s))
  const host = o.host ?? ((): AnalysisHost => getState().mock.analysisHost)
  const free = o.freeDiskMB ?? ((h: AnalysisHost): number => HOST_FREE_DISK_MB[h])
  const stepMs = o.stepMs ?? COMPONENT_STEP_MS
  const stepPct = o.stepPct ?? COMPONENT_STEP_PCT
  const verifyMs = o.verifyMs ?? COMPONENT_VERIFY_MS
  return {
    specs: () => specs,
    async install(id, onProgress, signal) {
      const s = specs.find((x) => x.id === id)
      if (!s) return { ok: false, kind: 'unavailable', reason: 'There is no such component.' }
      if (s.unavailable) return { ok: false, kind: 'unavailable', reason: s.unavailable }
      const room = free(host())
      if (room < s.sizeMB) return { ok: false, kind: 'disk', reason: 'Not enough free disk space: ' + sizeText(s.sizeMB) + ' needed, ' + sizeText(room) + ' free.' }
      onProgress({ phase: 'downloading', pct: 0 })
      for (let pct = stepPct; pct <= 100; pct += stepPct) {
        if (!(await wait(stepMs, signal))) return { ok: false, kind: 'cancelled', reason: 'Download cancelled.' }
        if (host() === 'blocked') return { ok: false, kind: 'unreachable', reason: 'Could not reach ' + s.host + '.' }
        onProgress({ phase: 'downloading', pct: Math.min(100, pct) })
      }
      onProgress({ phase: 'verifying', pct: 100 })
      if (!(await wait(verifyMs, signal))) return { ok: false, kind: 'cancelled', reason: 'Download cancelled.' }
      return { ok: true }
    },
    async remove(id) {
      return specs.some((x) => x.id === id) ? { ok: true } : { ok: false, reason: 'There is no such component.' }
    },
  }
}

let current: ComponentProvider = createMockComponents()
export const componentProvider = (): ComponentProvider => current
export function setComponentProvider(p: ComponentProvider): void {
  current = p
}
