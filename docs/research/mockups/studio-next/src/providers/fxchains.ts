/**
 * The effects a DAW offers for Add FX: its own saved chains (REAPER's FX chains), effects (the built-in recorder's) or macros (Audacity's).
 * The screens list what this reports and never name a chain themselves. The mock reads fixtures/fxchains.ts; a real bridge reads the
 * DAW's folders and answers the same shape.
 */
import type { FxList } from '@/domain/daw'
import { FX_LISTS } from '@/fixtures/fxchains'

export interface FxChainProvider {
  /** The list the DAW offers, or an empty one (with its source) when it has none. */
  list(daw: string): FxList
}

export function createMockFxChains(data: Record<string, FxList> = FX_LISTS): FxChainProvider {
  return { list: (daw) => data[daw] ?? { source: '', choices: [] } }
}

let current: FxChainProvider = createMockFxChains()
export const fxChains = (): FxChainProvider => current
/** Swap the provider (a real one, or a test double). */
export function setFxChainProvider(p: FxChainProvider): void {
  current = p
}
