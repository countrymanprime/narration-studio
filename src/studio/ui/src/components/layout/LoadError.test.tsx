// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoadError, LoadErrorPanel } from './LoadError';
import { OverlayProvider } from '../../overlay/OverlayProvider';
import { createOverlayService } from '../../overlay/overlayService';
import { useToasts } from '../../hooks/useToasts';

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

// Alignment audit XPR2-42: the failed frame keeps the loaded page's title size, so Production's hero title does not shrink when it fails.
describe('LoadError title size', () => {
  it.each([
    ['Production', '2.125rem'],
    ['Proof', 'font-size-page-title'],
  ])('draws %s at the size its loaded page does', (title, size) => {
    render(<LoadError title={title} message="It failed." retry={() => {}} />);
    expect(screen.getByRole('heading', { name: title }).className).toContain(size);
  });
});

// Alignment audit R3PF-4: Production toasted a failed manuscript read, the narrator went to Proof, and its card said the same sentence under
// the toast. A panel that says the sentence in place takes away the error toast that says it; any other toast stays.
describe('LoadErrorPanel and the toasts', () => {
  it('takes away an error toast with its sentence, and leaves the others', () => {
    const service = createOverlayService();
    service.toast('It failed.', { tone: 'error' });
    service.toast('Something else failed.', { tone: 'error' });
    service.toast('It failed.');
    render(
      <OverlayProvider service={service}>
        <LoadErrorPanel message="It failed." retry={vi.fn()} />
      </OverlayProvider>,
    );
    expect(service.getSnapshot().toasts.map((toast) => [toast.text, toast.tone])).toEqual([
      ['Something else failed.', 'error'],
      ['It failed.', 'info'],
    ]);
  });
});

// The toast that was left over Proof's card came from the app's own queue (`useToasts`, App's `notify`), not the overlay service's.
describe('LoadErrorPanel and the app queue', () => {
  function Shell({ failed }: { failed: boolean }) {
    const { messages, notify } = useToasts();
    return (
      <>
        <button onClick={() => notify('It failed.', 'error')}>raise</button>
        <button onClick={() => notify('It failed.')}>inform</button>
        <ul>
          {messages.map((m) => (
            <li key={m.id}>{`${m.tone}: ${m.text}`}</li>
          ))}
        </ul>
        {failed && <LoadErrorPanel message="It failed." retry={vi.fn()} />}
      </>
    );
  }

  it("takes away the app queue's error toast with its sentence, and leaves an information one", async () => {
    const view = render(<Shell failed={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'raise' }));
    await userEvent.click(screen.getByRole('button', { name: 'inform' }));
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['error: It failed.', 'info: It failed.']);
    view.rerender(<Shell failed />);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['info: It failed.']);
  });
});

// Issue #2648: the technical text of a failed read is behind a Details disclosure with Copy, never in the card's visible body.
describe('LoadErrorPanel details', () => {
  const details = 'host.binding ManuscriptChapters did not match its schema: [0].index: Invalid input: expected number';

  it.each([
    ['LoadError', false],
    ['LoadErrorPanel', true],
  ])('%s keeps the technical text out of the visible body until Details is opened', async (_name, panelOnly) => {
    const props = { message: 'The app received data it could not read.', details, retry: () => {} };
    render(panelOnly ? <LoadErrorPanel {...props} /> : <LoadError title="Booth" {...props} />);
    expect(screen.getByText('The app received data it could not read.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('[0].index');
    const toggle = screen.getByRole('button', { name: /Details/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(toggle);
    expect(screen.getByText(details)).toBeTruthy();
  });

  it('copies the technical text and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const service = createOverlayService();
    render(
      <OverlayProvider service={service}>
        <LoadErrorPanel message="It failed." details={details} retry={() => {}} />
      </OverlayProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Details/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy details' }));
    expect(writeText).toHaveBeenCalledWith(details);
    expect(service.getSnapshot().toasts.map((toast) => toast.text)).toContain('Copied.');
  });

  it('draws no Details disclosure when there is nothing technical to show', () => {
    render(<LoadErrorPanel message="It failed." retry={() => {}} />);
    expect(screen.queryByRole('button', { name: /Details/ })).toBeNull();
  });
});
