/** What a delivery profile unlocks. `checkpoint15` offers the 15-minute checkpoint as a milestone measure. */
export type PlatformCapability = 'checkpoint15';

export type PlatformProfile = { id: string; label: string; capabilities: readonly PlatformCapability[] };

/** The delivery profiles the Schedule knows what to unlock for. Add a platform here, never in a component. */
export const PLATFORM_PROFILES: readonly PlatformProfile[] = [
  { id: 'acx', label: 'ACX', capabilities: ['checkpoint15'] },
  { id: 'none', label: 'Other / none', capabilities: [] },
];

/** A project with no profile, or one this table does not list, reads as this one. */
export const NEUTRAL_PROFILE = 'none';
