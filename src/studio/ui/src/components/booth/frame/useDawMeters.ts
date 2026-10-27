import { DAW_METERS_EVERY_MS, DAW_METERS_QUIET_MS, type DawMetersState } from '../../../daw/dawSession';
import { useDawMeterLease, useDawState } from '../../../daw/useDawSession';

export { DAW_METERS_EVERY_MS, DAW_METERS_QUIET_MS };
export type { DawMetersState };

/**
 * The DAW's own meters, from the app's DAW session: read every DAW_METERS_EVERY_MS while any screen holds a lease (this hook holds one
 * while its caller is mounted) and the DAW declares `daw_meters`, one read at a time. A reading that goes quiet is shown as quiet, never
 * as the level now. The Booth's footer holds a lease too, so the levels stream whether or not the Levels menu is open.
 */
export function useDawMeters(): DawMetersState {
  useDawMeterLease();
  return useDawState((state) => state.meters);
}
