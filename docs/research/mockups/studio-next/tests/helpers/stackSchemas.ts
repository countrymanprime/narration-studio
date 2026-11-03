import { DawResult } from '@/domain/daw'
import { PassageStack } from '@/domain/schemas'

export { DawResult }
export const PassageStackSchemaCheck = (v: unknown): boolean => PassageStack.safeParse(v).success
