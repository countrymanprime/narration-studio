import type { DawKind } from './api/contracts/daw';
import { useDawState } from './daw/useDawSession';

/** Which DAW backs this session (the capability report's `daw`), from the app's DAW session. Undefined until the first answer. */
export function useDawKind(): DawKind | undefined {
  return useDawState((state) => state.caps?.daw);
}
