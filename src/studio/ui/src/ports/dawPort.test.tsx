// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { createMockApi } from '../api/mockApi';
import { DAW_SETUPS } from '../fixtures/daw';
import { createMockDawClient } from './daw';
import type { DawClient } from './index';
import { PortOverrides, usePort } from './usePort';

describe('usePort daw', () => {
  it('use-port-resolves-it: returns a DawClient built over the provider api, the same one on a rerender', async () => {
    const seen: DawClient[] = [];
    function Probe() {
      const daw = usePort('daw');
      expectTypeOf(daw).toEqualTypeOf<DawClient>();
      seen.push(daw);
      return null;
    }
    const api = createMockApi();
    const { rerender } = render(
      <ApiProvider api={api}>
        <Probe />
      </ApiProvider>,
    );
    rerender(
      <ApiProvider api={api}>
        <Probe />
      </ApiProvider>,
    );
    expect(seen[0]).toBe(seen.at(-1));
    expect((await seen[0].capabilities()).capabilities).toHaveProperty('record');
  });

  it('use-port-resolves-it: a test provider can supply the mock client', () => {
    const mock = createMockDawClient(DAW_SETUPS['reaper-off']);
    let got: DawClient | undefined;
    function Probe() {
      got = usePort('daw');
      return null;
    }
    render(
      <ApiProvider api={createMockApi()}>
        <PortOverrides clients={{ daw: mock }}>
          <Probe />
        </PortOverrides>
      </ApiProvider>,
    );
    expect(got).toBe(mock);
  });
});
