import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useApi } from '../api/ApiContext';
import type { NarrationApi } from '../types';
import { createHostDawClient } from './daw';
import { createHostMeasurements } from './measurements';
import { createHostAlignment } from './alignment';
import type { ClientPortMap, PortName, PortOf } from './index';

const CLIENT_BUILDERS: { [N in keyof ClientPortMap]: (api: NarrationApi) => ClientPortMap[N] } = {
  daw: createHostDawClient,
  measurements: createHostMeasurements,
  alignment: createHostAlignment,
};

const isClientPort = (name: PortName): name is keyof ClientPortMap => Object.hasOwn(CLIENT_BUILDERS, name);

const OverridesContext = createContext<Partial<ClientPortMap>>({});

/** Supplies client ports in place of the ones built over the api, e.g. a test provider handing `usePort('daw')` the mock DAW client. */
export function PortOverrides({ clients, children }: { clients: Partial<ClientPortMap>; children: ReactNode }) {
  return <OverridesContext.Provider value={clients}>{children}</OverridesContext.Provider>;
}

/**
 * The one hook a page uses to reach the backend: `usePort('production')` returns `ProductionApi` only, so a feature
 * sees the methods of the port it declares and not the whole `NarrationApi` facade (ADR 0770). A client port such as
 * `usePort('daw')` is built over the provider's api once per api, or comes from `PortOverrides`.
 */
export function usePort<N extends PortName>(name: N): PortOf<N> {
  let api: NarrationApi;
  try {
    api = useApi();
  } catch {
    throw new Error(`usePort('${name}') called outside an <ApiProvider>.`);
  }
  const overrides = useContext(OverridesContext);
  const client = useMemo(() => (isClientPort(name) ? (overrides[name] ?? CLIENT_BUILDERS[name](api)) : undefined), [api, name, overrides]);
  // The conditional return type cannot be narrowed from a generic `name`, so this is the one place the choice is asserted.
  return (client ?? api) as PortOf<N>;
}
