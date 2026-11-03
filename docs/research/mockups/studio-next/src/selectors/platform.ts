/** The project's delivery profile, and the one lookup every gated option goes through. */
import type { BookData, PlatformCapability, PlatformProfile } from '@/domain/schemas'
import { NEUTRAL_PROFILE, PLATFORM_PROFILES } from '@/fixtures/platforms'

export const platformProfiles = (): readonly PlatformProfile[] => PLATFORM_PROFILES

/** The profile the project chose; an unknown id reads as the neutral one. */
export function platformOf(b: Pick<BookData, 'deliveryProfile'>): PlatformProfile {
  return PLATFORM_PROFILES.find((p) => p.id === b.deliveryProfile) ?? PLATFORM_PROFILES.find((p) => p.id === NEUTRAL_PROFILE) ?? PLATFORM_PROFILES[0]
}

/** Whether the project's delivery profile unlocks `cap`. */
export const platformHas = (b: Pick<BookData, 'deliveryProfile'>, cap: PlatformCapability): boolean => platformOf(b).capabilities.includes(cap)
