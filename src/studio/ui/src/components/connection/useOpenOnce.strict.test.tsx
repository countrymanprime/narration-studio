// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetOpenOnce, useOpenOnce } from './useOpenOnce';

beforeEach(resetOpenOnce);
afterEach(cleanup);

function Probe({ hold, on = true }: { hold: boolean; on?: boolean }) {
  const dialog = useOpenOnce(on ? 'reaper-off:REAPER' : null, hold);
  return <p>{dialog.open ? 'open' : 'shut'}</p>;
}

// The decision to open is made in an effect, not inside a `setState` updater (#3668). These cases hold the behaviour under StrictMode, but they also pass with the
// old updater: the development-server failure (the dialog never opening by itself after the grace) did not reproduce in jsdom, and was checked by hand on `pnpm dev:mock`
// (0 dialogs with the old hook, 1 with this one).
describe('useOpenOnce under StrictMode', () => {
  it('opens once when the hold ends', () => {
    const { rerender } = render(
      <StrictMode>
        <Probe hold />
      </StrictMode>,
    );
    expect(screen.getByText('shut')).toBeTruthy();
    rerender(
      <StrictMode>
        <Probe hold={false} />
      </StrictMode>,
    );
    expect(screen.getByText('open')).toBeTruthy();
  });

  it('opens when the hold ends for a condition that appeared while it was held (the DAW going off, then the grace running out)', () => {
    const tree = (props: { hold: boolean; on?: boolean }) => (
      <StrictMode>
        <Probe {...props} />
      </StrictMode>
    );
    const { rerender } = render(tree({ hold: false, on: false }));
    rerender(tree({ hold: true, on: true }));
    expect(screen.getByText('shut')).toBeTruthy();
    rerender(tree({ hold: false, on: true }));
    expect(screen.getByText('open')).toBeTruthy();
  });

  it('opens at once when nothing holds it', () => {
    render(
      <StrictMode>
        <Probe hold={false} />
      </StrictMode>,
    );
    expect(screen.getByText('open')).toBeTruthy();
  });
});
