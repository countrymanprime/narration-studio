import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { DawCapabilities } from '../api/contracts/daw';
import { dawCapabilitiesSchema } from '../api/schemas/daw';
import { workspaceFXChainsResultSchema } from '../api/schemas/workspace';
import { parseWire } from '../api/wire/parseWire';
import { DAW_PROJECT, DAW_SETUPS, fxChainsSource } from '../fixtures/daw';
import { createHostFxChains, createMockFxChains, type FxChainsHostApi, type FxChainsPort } from './fxchains';
import { describeProviderContract, type Goldens } from './providerContract';

const GOLDEN_DIR = fileURLToPath(new URL('../../../../tests/fixtures/contracts/', import.meta.url));
const FILES = ['daw-capabilities-reaper.json', 'workspace-fx-chains.json'] as const;
const goldens: Goldens = Object.fromEntries(FILES.map((file) => [file, JSON.parse(readFileSync(`${GOLDEN_DIR}${file}`, 'utf8'))]));

const capabilities = parseWire(dawCapabilitiesSchema, goldens['daw-capabilities-reaper.json'], { boundary: 'fxchains contract', payload: 'caps' });
const listing = parseWire(workspaceFXChainsResultSchema, goldens['workspace-fx-chains.json'], { boundary: 'fxchains contract', payload: 'chains' });

/** The host's bindings over the goldens: the DAW's capabilities and the chains its folder lists. */
const hostApi = (caps: DawCapabilities = capabilities, calls: string[] = []): FxChainsHostApi => ({
  dawCapabilities: () => Promise.resolve(caps),
  workspaceListFXChains: () => {
    calls.push('workspaceListFXChains');
    return Promise.resolve(listing);
  },
});

// The golden is the host with no heartbeat, so the cases run on a REAPER that answers (DAW_SETUPS.reaper), as the mock does.
const reachable = { ...DAW_SETUPS.reaper };

const cases = [
  {
    name: 'lists-the-daws-own-chains: the list is answered alike, with its source',
    observe: (port: FxChainsPort) => port.list(),
  },
  {
    name: 'lists-the-daws-own-chains: every choice is the DAW name for the chain, which is also its id',
    check: async (port: FxChainsPort) => {
      const list = await port.list();
      expect(list.source).toBe(fxChainsSource('REAPER'));
      expect(list.choices.map((c) => c.name)).toEqual(DAW_PROJECT.fxChains);
      for (const c of list.choices) expect(c.id).toBe(c.name);
    },
  },
];

describeProviderContract<FxChainsPort>('fxchains', { mock: () => createMockFxChains(reachable), host: () => createHostFxChains(hostApi(reachable)) }, cases, {
  goldens,
});

describe('the host adapter', () => {
  it('reads-the-folder-only-when-the-daw-can-list: a DAW that cannot rejects with its own sentence and the folder is not read', async () => {
    const calls: string[] = [];
    const port = createHostFxChains(hostApi(DAW_SETUPS['reaper-off'], calls));
    await expect(port.list()).rejects.toThrow(DAW_SETUPS['reaper-off'].capabilities.fx_chains?.message ?? 'missing sentence');
    expect(calls).toEqual([]);
  });

  it('empty-list-keeps-its-source: no chains is an empty list, not an error', async () => {
    const port = createHostFxChains({ ...hostApi(reachable), workspaceListFXChains: () => Promise.resolve({ names: [], truncated: false }) });
    expect(await port.list()).toEqual({ source: fxChainsSource('REAPER'), choices: [] });
  });
});

describe('the mock', () => {
  it('refuses-like-the-host: a DAW that cannot list rejects with its sentence', async () => {
    await expect(createMockFxChains(DAW_SETUPS['reaper-off']).list()).rejects.toThrow(
      DAW_SETUPS['reaper-off'].capabilities.fx_chains?.message ?? 'missing sentence',
    );
  });

  it('answers-what-it-is-given: other chains change the list and nothing else', async () => {
    const port = createMockFxChains(reachable, ['Warm.RfxChain']);
    expect(await port.list()).toEqual({ source: fxChainsSource('REAPER'), choices: [{ id: 'Warm.RfxChain', name: 'Warm.RfxChain' }] });
  });
});
