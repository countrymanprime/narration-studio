import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ApiProvider } from '../api/ApiContext';
import { createMockApi } from '../api/mockApi';
import type { NarrationApi } from '../types';
import type { Scenario } from './scenario';

// The helper a page test calls to mount a page over a scenario book: the page reads it through its own port, from a mock API
// seeded with the scenario. Test-only (scenario.test.ts scans for importers). The mock's other domains still read the Alice
// chapters, so a scenario widens the manuscript domain only; a page swap that needs another adds that seed field to
// api/mockHost/state.ts.
export function renderScenario(scenario: Scenario, ui: ReactElement | ((api: NarrationApi) => ReactElement)): RenderResult & { api: NarrationApi } {
  const api = createMockApi({}, scenario.seed);
  const result = render(<ApiProvider api={api}>{typeof ui === 'function' ? ui(api) : ui}</ApiProvider>);
  return { ...result, api };
}
