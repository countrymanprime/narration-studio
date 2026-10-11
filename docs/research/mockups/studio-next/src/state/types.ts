import type { BookData } from '@/domain/schemas'
import type { Patch } from 'immer'
import type { MockState } from './slices/mock'
import type { UiState } from './slices/ui'

export type { Page } from './slices/ui'

/** One undoable change. */
export interface HistoryEntry {
  id: number
  label: string
  /** A change made in the DAW is only undone when it is the last one and the DAW's own last action is still it. */
  daw: boolean
  inverse: Patch[]
  /** Paths the change touched, to tell whether a later change overlaps it. */
  paths: string[]
}

export interface StudioState {
  data: BookData
  ui: UiState
  mock: MockState
  history: HistoryEntry[]
}
