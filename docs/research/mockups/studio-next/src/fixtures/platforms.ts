/** Delivery profiles a project can choose, and the one the sample book starts with. Add a platform here, never in a component. */
import type { PlatformProfile } from '@/domain/schemas'

export const PLATFORM_PROFILES: PlatformProfile[] = [
  { id: 'acx', label: 'ACX', capabilities: ['checkpoint15'], defaultPayment: 'pfh' },
  { id: 'none', label: 'Other / none', capabilities: [], defaultPayment: 'none' },
]

/** A new project has not chosen a delivery profile yet. */
export const NEUTRAL_PROFILE = 'none'
/** The sample book is being made for ACX. */
export const SAMPLE_PROFILE = 'acx'
