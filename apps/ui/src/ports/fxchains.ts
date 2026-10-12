import type { DawCapabilities } from '../api/contracts/daw';
import { DAW_PROJECT, fxListOf } from '../fixtures/daw';
import type { NarrationApi } from '../types';
import type { FxList } from './daw';

// The FX chains port (SNE-6b): what the connected DAW offers for Add FX, as it lists it: its saved chains (REAPER's FX chains),
// effects or macros, under the source line the DAW names. A screen lists what this answers and never names a chain; a
// different DAW or a different port implementation changes the menu with no change to the screen. It reads only, and it
// rejects with the capability's own sentence when the DAW cannot list now. Applying a chain is `DawClient.applyFxToRange`.

export interface FxChainsPort {
  /** The DAW's own list, or an empty one (with its source) when it has none. Rejects with the DAW's sentence when it cannot list now. */
  list(): Promise<FxList>;
}

/** The `NarrationApi` methods the host adapter calls. */
export type FxChainsHostApi = Pick<NarrationApi, 'dawCapabilities' | 'workspaceListFXChains'>;

/** The sentence for a DAW that cannot list chains now, or null when it can. */
function cannotList(capabilities: DawCapabilities): string | null {
  const support = capabilities.capabilities.fx_chains;
  if (support?.available) return null;
  return support?.message ?? `${capabilities.daw} cannot list its effects now.`;
}

/** Reads `workspaceListFXChains`, named for the launch's DAW; the folder is not read when the capability is off. */
export function createHostFxChains(api: FxChainsHostApi): FxChainsPort {
  return {
    async list() {
      const capabilities = await api.dawCapabilities();
      const sentence = cannotList(capabilities);
      if (sentence) throw new Error(sentence);
      return fxListOf(capabilities, (await api.workspaceListFXChains()).names);
    },
  };
}

/** The mock: the setup's declaration decides whether the DAW can list; `names` are the chains its folder holds. */
export function createMockFxChains(setup: DawCapabilities, names: readonly string[] = DAW_PROJECT.fxChains ?? []): FxChainsPort {
  return createHostFxChains({
    dawCapabilities: () => Promise.resolve(setup),
    workspaceListFXChains: () => Promise.resolve({ names: [...names], truncated: false }),
  });
}
