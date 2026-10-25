// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoadError, LoadErrorPanel } from './LoadError';

afterEach(cleanup);

// The failed-read states swap to a skeleton when Retry is pressed, so the button unmounts. Focus must not fall to <body>: it moves to the page's
// <main> (the shell's focusable landmark), so the next Tab continues from the page and a screen reader keeps its place.
function Page({ panelOnly = false }: { panelOnly?: boolean }) {
  const [failed, setFailed] = useState(true);
  const retry = () => setFailed(false);
  return (
    <main tabIndex={-1} aria-label="page">
      {failed ? (
        panelOnly ? (
          <LoadErrorPanel message="It failed." retry={retry} />
        ) : (
          <LoadError title="Thing" message="It failed." retry={retry} />
        )
      ) : (
        <p>Loaded</p>
      )}
    </main>
  );
}

describe.each([
  ['LoadError', false],
  ['LoadErrorPanel', true],
])('%s focus after Retry', (_name, panelOnly) => {
  it('moves focus to the page, not <body>, when Retry removes the button', async () => {
    render(<Page panelOnly={panelOnly} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('moves focus when Retry is pressed from the keyboard', async () => {
    render(<Page panelOnly={panelOnly} />);
    screen.getByRole('button', { name: 'Retry' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('still calls retry once, and works with no <main> around it', async () => {
    const retry = vi.fn();
    render(panelOnly ? <LoadErrorPanel message="x" retry={retry} /> : <LoadError title="T" message="x" retry={retry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

// Alignment audit cause J: the failed frame centred itself 768 px wide with its own 24 px padding, so the page title jumped between the
// loading, failed and loaded frames.
describe('LoadError placement', () => {
  it('starts at the page gutter like the loaded page, not centred with padding of its own', () => {
    render(<LoadError title="Proof" message="It failed." retry={() => undefined} />);
    const frame = screen.getByRole('heading', { name: 'Proof' }).closest('.space-y-4')!;
    expect(frame.className).not.toMatch(/\bmx-auto\b|\bp-6\b/);
  });
});
