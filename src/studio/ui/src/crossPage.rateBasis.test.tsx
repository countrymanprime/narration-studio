// @vitest-environment jsdom
// The Schedule basis toggle changes every hours figure (docs/research/ui-function-audit.md, cluster 5): choosing "Your pace" in the
// Production popover moves the rate the Schedule's "Finished audio is words ÷ N" line and the stage bar's hours divide by.
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { ApiProvider } from './api/ApiContext';
import { createMockApi } from './api/mockApi';
import { CommandRouter } from './input/router';
import { createMockMeasurements } from './ports/measurements';
import { PortOverrides } from './ports/usePort';
import { ThemeProvider } from './theme/ThemeContext';

configure({ asyncUtilTimeout: 12_000 });
beforeEach(() => window.history.replaceState(null, '', '/production'));
afterEach(cleanup);

const rail = async (name: RegExp) => within(await screen.findByRole('complementary', { name: 'Primary navigation' })).findByRole('button', { name });

describe('the Schedule basis toggle', () => {
  it('moves the rate the Schedule divides words by, not just the Production popover', async () => {
    const api = createMockApi();
    // Three chapters with a measured length, so the narrator's own rate exists and differs from the standard.
    const lengths = Object.fromEntries((await api.productionOverview()).chapters.slice(0, 3).map((c) => [c.id, 600]));
    render(
      <ThemeProvider>
        <ApiProvider api={api}>
          <PortOverrides clients={{ measurements: createMockMeasurements({ lengths }) }}>
            <CommandRouter>
              <App />
            </CommandRouter>
          </PortOverrides>
        </ApiProvider>
      </ThemeProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Finished-hour target' }));
    const popover = await screen.findByRole('dialog', { name: 'Finished-hour target' });
    const yoursOf = () => within(popover).getByText('Yours').parentElement?.textContent ?? '';
    await waitFor(() => expect(yoursOf()).toMatch(/\d/));
    const rate = /([\d,]+)/.exec(yoursOf().replace('Yours', ''))?.[1];
    if (!rate) throw new Error('the mock has no own rate');
    await user.click(within(popover).getByRole('button', { name: 'Your pace' }));
    await waitFor(async () => expect((await api.productionPlan()).rateBasis).toBe('own'));

    await user.click(await rail(/^Schedule/));
    expect(await screen.findByText(new RegExp(`Finished audio is words ÷ ${rate}\\.`))).toBeTruthy();
  });
});
