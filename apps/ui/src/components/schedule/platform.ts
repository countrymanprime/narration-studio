import { NEUTRAL_PROFILE, PLATFORM_PROFILES, type PlatformCapability, type PlatformProfile } from './profiles';

/** The profile the project chose; an unknown or missing id reads as the neutral one. */
export function platformOf(profileId: string | undefined): PlatformProfile {
  const neutral = PLATFORM_PROFILES.find((p) => p.id === NEUTRAL_PROFILE) ?? PLATFORM_PROFILES[0];
  return PLATFORM_PROFILES.find((p) => p.id === profileId) ?? neutral;
}

/**
 * Whether the project's delivery profile unlocks `cap`, and the one lookup every gated option goes through. Capabilities the host
 * reports for the profile win over the table (a pure selector over the delivery-profile binding, no new binding); the binding reports
 * none today, so the table answers.
 */
export function platformHas(profileId: string | undefined, cap: PlatformCapability, reported?: readonly PlatformCapability[]): boolean {
  return (reported ?? platformOf(profileId).capabilities).includes(cap);
}
