import { EXTRACTION_SOURCES, type ExtractionSourceId } from '@/config/extraction'
import type { ComponentJob, ComponentSpec, ComponentStatus } from '@/domain/components'
import type { StudioState } from '@/state/types'

type Ui = Pick<StudioState['ui'], 'prefs' | 'components'>

export const isInstalled = (ui: Ui, id: string): boolean => ui.prefs.installedComponents.includes(id)
export const anyInstalled = (ui: Ui, specs: ComponentSpec[]): boolean => specs.some((s) => !s.unavailable && isInstalled(ui, s.id))
export const jobOf = (ui: Ui, id: string): ComponentJob | undefined => ui.components[id]

export function statusOf(ui: Ui, s: ComponentSpec): ComponentStatus {
  if (isInstalled(ui, s.id)) return 'installed'
  if (s.unavailable) return 'unavailable'
  return jobOf(ui, s.id)?.phase ?? 'not-installed'
}

/** The components offered together on the first scan. */
export const recommended = (specs: ComponentSpec[]): ComponentSpec[] => specs.filter((s) => s.recommended && !s.unavailable)

/** The extraction sources to run in a scan: the rules, then each installed tool's source, in the registry's order. */
export function scanSources(ui: Ui, specs: ComponentSpec[]): ExtractionSourceId[] {
  const have = new Set(specs.filter((s) => s.source && isInstalled(ui, s.id)).map((s) => s.source))
  return EXTRACTION_SOURCES.filter((s) => s.id === 'rules' || have.has(s.id)).map((s) => s.id)
}

/** Whether a scan should first offer better analysis: nothing downloaded, something to download, and the narrator has not said no. */
export const shouldOffer = (ui: Ui, specs: ComponentSpec[]): boolean =>
  ui.prefs.analysisPrompt === 'ask' && !anyInstalled(ui, specs) && !Object.values(ui.components).some((j) => j.phase !== 'failed') && specs.some((s) => !s.unavailable)
