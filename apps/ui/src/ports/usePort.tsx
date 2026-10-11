import { useApi } from '../api/ApiContext';
import type { NarrationApi } from '../types';
import type { PortMap, PortName } from './index';

/**
 * The one hook a page uses to reach the backend: `usePort('production')` returns `ProductionApi` only, so a feature
 * sees the methods of the port it declares and not the whole `NarrationApi` facade (ADR 0770).
 */
export function usePort<N extends PortName>(name: N): PortMap[N] {
  let api: NarrationApi;
  try {
    api = useApi();
  } catch {
    throw new Error(`usePort('${name}') called outside an <ApiProvider>.`);
  }
  return api;
}
