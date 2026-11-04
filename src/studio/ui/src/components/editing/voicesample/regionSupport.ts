import type { DawCapabilities, DawCapabilitySupport } from '../../../api/contracts/daw';

/**
 * What the project's DAW says about keeping a voice sample as a region (`voice_sample_region`), or undefined before it has been asked. Settings
 * reads it here and not by name (swapScans.test.ts, no-hand-written-capability-row).
 */
export function voiceSampleRegionSupport(caps: DawCapabilities | null): DawCapabilitySupport | undefined {
  return caps?.capabilities['voice_sample_region'];
}
