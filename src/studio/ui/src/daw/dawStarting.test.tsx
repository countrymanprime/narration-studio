// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import type { DawChoice } from '../api/contracts/daw';
import { createMockApi } from '../api/mockApi';
import { EngineChip } from '../components/layout/EngineChip';
import { TooltipProvider } from '../components/primitives/Tooltip';
import { EnginePanelProvider } from '../components/engine/EnginePanelContext';
import { DAW_SETUPS } from '../fixtures/daw';
import type { NarrationApi } from '../types';
import { useCapability } from '../useCapability';
import { useDawStarting } from './useDawSession';

afterEach(cleanup);

const choice = (state: string) =>
  ({ hasProject: true, daw: 'REAPER', state, linkedFile: 'Alice.rpp', foundFiles: [], options: [], starting: null, bridge: null }) as unknown as DawChoice;

function Probe() {
  const starting = useDawStarting();
  const record = useCapability('review');
  return (
    <>
      <p>{starting ? 'starting' : 'not starting'}</p>
      <p>{record.message ?? ''}</p>
    </>
  );
}

function mount(api: Partial<NarrationApi>, body: React.ReactNode) {
  render(
    <ApiProvider api={createMockApi({ dawCapabilities: async () => structuredClone(DAW_SETUPS['reaper-off']), ...api })}>
      <TooltipProvider>
        <EnginePanelProvider value={() => {}}>{body}</EnginePanelProvider>
      </TooltipProvider>
    </ApiProvider>,
  );
}

// Every mark that words the DAW being off follows the host's "starting" (#3668): the engine chip, and the capability sentences the pages print.
describe('while the host starts the DAW', () => {
  it('says so in the engine chip and in the capability sentence, instead of "Not running" and "Open REAPER"', async () => {
    mount(
      { dawChoice: async () => choice('starting') },
      <>
        <Probe />
        <EngineChip daw="REAPER" dawFileLinked dawReachable={false} />
      </>,
    );
    await waitFor(() => expect(screen.getByText('starting')).toBeTruthy());
    expect(screen.getByText('REAPER is starting. The app connects to it by itself.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /REAPER: Starting/ })).toBeTruthy();
    expect(screen.queryByText(/Not running/)).toBeNull();
  });

  it('keeps the host\'s own words, and "Not running", when it is not starting anything', async () => {
    mount(
      { dawChoice: async () => choice('linked') },
      <>
        <Probe />
        <EngineChip daw="REAPER" dawFileLinked dawReachable={false} />
      </>,
    );
    await waitFor(() => expect(screen.getByText('not starting')).toBeTruthy());
    expect(screen.queryByText(/is starting/)).toBeNull();
    expect(screen.getByRole('button', { name: /REAPER: Not running/ })).toBeTruthy();
  });
});
