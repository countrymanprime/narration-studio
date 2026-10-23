import type { ComponentType } from 'react';
import { PROJECT_CONTROLS } from './projectControls';
import { RECORDING_CONTROLS } from './recordingControls';

/**
 * The bodies of the settings that are more than one value, by registry row id (`rows.ts` rows without a `field`, and the few whose host field
 * has a richer control than its kind). Each takes no props and reads what it needs through the page's contexts. A row with no entry here and no
 * host field is not drawn.
 */
export const CUSTOM: Record<string, ComponentType> = { ...RECORDING_CONTROLS, ...PROJECT_CONTROLS };
