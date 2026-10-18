import type { ComponentType } from 'react';

/**
 * The bodies of the settings that are more than one value, by registry row id (`rows.ts` rows without a `field`). Each takes no props and reads
 * what it needs through the page's contexts. A row with no entry here and no host field is not drawn.
 */
export const CUSTOM: Record<string, ComponentType> = {};
