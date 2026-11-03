import type { StageId } from '@/domain/schemas'

const hash = (s: string): string => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return 'rd-' + h.toString(36)
}
/** Names what the evidence for a stage says now; a suggestion made on one key is out of date when the key changes. */
export const keyOfValues = (stage: StageId, values: Record<string, string>): string =>
  hash(stage + '|' + Object.keys(values).sort().map((k) => k + '=' + values[k]).join('|'))

