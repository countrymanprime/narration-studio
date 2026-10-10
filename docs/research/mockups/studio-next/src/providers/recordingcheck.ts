/**
 * What a check of a chapter's recording finds: from speech (misread, skipped, repeated, extra words) and from the audio (background
 * noise, breaths, clicks). The mock answers from sample data; a real engine replaces it without any screen changing.
 */
import { CHECK_CATEGORIES, CHECK_FINDINGS, CHECK_GROUPS, type CheckCategory, type CheckFinding, type FindingSource } from '@/fixtures/recordingcheck'

export interface RecordingCheckProvider {
  categories(): CheckCategory[]
  groups(): Record<FindingSource, string>
  findings(chapterId: string): CheckFinding[]
}
export function createMockRecordingCheck(
  findings: CheckFinding[] = CHECK_FINDINGS, categories: CheckCategory[] = CHECK_CATEGORIES, groups: Record<FindingSource, string> = CHECK_GROUPS,
): RecordingCheckProvider {
  return {
    categories: () => categories,
    groups: () => groups,
    findings: (id) => findings.filter((x) => x.chapterId === id).sort((a, b) => a.sec - b.sec),
  }
}
let current: RecordingCheckProvider = createMockRecordingCheck()
export const recordingCheck = (): RecordingCheckProvider => current
export function setRecordingCheckProvider(p: RecordingCheckProvider): void {
  current = p
}
