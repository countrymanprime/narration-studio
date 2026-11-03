/**
 * Stage readiness: which stages the pipeline has, in order. The evidence itself is measured from the book's own data and the
 * measurement provider; a real host can report more stages or other labels without any screen changing.
 */
import { STAGES, type StageDef } from '@/fixtures/readiness'

export interface ReadinessProvider {
  stages(): StageDef[]
}
export function createMockReadiness(stages: StageDef[] = STAGES): ReadinessProvider {
  return { stages: () => stages }
}
let current: ReadinessProvider = createMockReadiness()
export const readiness = (): ReadinessProvider => current
export function setReadinessProvider(p: ReadinessProvider): void {
  current = p
}
