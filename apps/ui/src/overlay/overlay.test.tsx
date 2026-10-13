// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from '../components/primitives/Dialog';
import { TOAST_INFO_MS } from '../components/primitives/Toast';
import { OverlayHost } from './OverlayHost';
import { OverlayProvider, useOverlay } from './OverlayProvider';
import { createOverlayService, type OverlayService } from './overlayService';

let service: OverlayService;
beforeEach(() => {
  service = createOverlayService();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const mount = () =>
  render(
    <main tabIndex={-1}>
      <button>Page button</button>
      <OverlayHost service={service} />
    </main>,
  );

const ask = () => service.confirm({ title: 'Delete the take?', body: 'It cannot be brought back.', confirmLabel: 'Delete take' });

describe('overlay.confirm', () => {
  it('confirm-resolves-with-the-answer: renders the alert dialog and resolves true on confirm', async () => {
    mount();
    const answer = ask();
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete the take?' });
    expect(within(dialog).getByText('It cannot be brought back.')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete take' }));
    await expect(answer).resolves.toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('resolves false on Cancel and on Escape', async () => {
    mount();
    const cancelled = ask();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await expect(cancelled).resolves.toBe(false);

    const escaped = ask();
    await screen.findByRole('alertdialog');
    await userEvent.keyboard('{Escape}');
    await expect(escaped).resolves.toBe(false);
  });

  // ADR 0048: a press on the backdrop of a confirm never answers it, so an accidental click cannot discard the question. The issue
  // lists the backdrop beside Cancel and Escape; the primitive is the authority and the service adds no dismissal of its own.
  it('confirm-names-its-way-out: a cancelLabel replaces Cancel ("Keep recording", the Booth\'s leave question) and still declines', async () => {
    mount();
    const answer = service.confirm({ title: 'Stop recording?', body: 'Leaving stops it.', confirmLabel: 'Stop and leave', cancelLabel: 'Keep recording' });
    const dialog = await screen.findByRole('alertdialog', { name: 'Stop recording?' });
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep recording' }));
    await expect(answer).resolves.toBe(false);
  });

  it('leaves a confirm waiting when the backdrop is pressed (the primitive ignores it)', async () => {
    mount();
    let settled = false;
    void ask().then(() => (settled = true));
    await screen.findByRole('alertdialog');
    await userEvent.click(document.querySelector('[data-dialog-backdrop]')!);
    await act(async () => void (await Promise.resolve()));
    expect(settled).toBe(false);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('imperative-without-a-component: runs from a bare async function', async () => {
    mount();
    async function deleteTake(): Promise<string> {
      return (await service.confirm({ title: 'Delete the take?', body: 'Sure?', confirmLabel: 'Delete take', confirmVariant: 'danger' })) ? 'deleted' : 'kept';
    }
    const result = deleteTake();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete take' }));
    await expect(result).resolves.toBe('deleted');
  });
});

describe('stacking and Escape order stay the primitives', () => {
  it('stacks a confirm above an open Dialog, closes only the topmost on Escape and returns focus to the opener', async () => {
    function Page() {
      const [open, setOpen] = useState(false);
      return (
        <main tabIndex={-1}>
          <button onClick={() => setOpen(true)}>Open details</button>
          {open && (
            <Dialog title="Details" onClose={() => setOpen(false)} actions={<button onClick={() => void ask()}>Ask</button>}>
              <p>Body</p>
            </Dialog>
          )}
          <OverlayHost service={service} />
        </main>
      );
    }
    render(<Page />);
    await userEvent.click(screen.getByRole('button', { name: 'Open details' }));
    const asker = await screen.findByRole('button', { name: 'Ask' });
    asker.focus();
    await userEvent.click(asker);
    await screen.findByRole('alertdialog', { name: 'Delete the take?' });
    // The confirm is the topmost layer: Escape answers it and leaves the Dialog open.
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Details' })).toBeTruthy();
    // Focus went back to what opened the confirm.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ask' })));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('overlay.toast', () => {
  it('toast-shows-and-expires: an information toast follows Toast timing', () => {
    vi.useFakeTimers();
    mount();
    act(() => service.toast('Saved.'));
    expect(screen.getByText('Saved.').closest('[data-tone]')?.getAttribute('data-tone')).toBe('info');
    act(() => void vi.advanceTimersByTime(TOAST_INFO_MS));
    expect(screen.queryByText('Saved.')).toBeNull();
  });

  it('an error toast stays until dismissed (ADR 0075)', () => {
    vi.useFakeTimers();
    mount();
    act(() => service.toast('Could not save.', { tone: 'error' }));
    expect(within(screen.getByRole('alert')).getByText('Could not save.')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(TOAST_INFO_MS * 20));
    expect(screen.getByText('Could not save.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
    expect(screen.queryByText('Could not save.')).toBeNull();
  });
});

describe('overlay.toastUndo', () => {
  it('runs the given function once and closes the toast on { ok: true }', async () => {
    mount();
    const undo = vi.fn().mockResolvedValue({ ok: true });
    act(() => service.toastUndo('Added a bookmark', undo));
    const button = screen.getByRole('button', { name: 'Undo' });
    fireEvent.click(button);
    expect(undo).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByText('Added a bookmark')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(undo).toHaveBeenCalledOnce();
  });

  it('shows the refusal reason as a toast when the undo refuses, and nothing else', async () => {
    mount();
    const undo = vi.fn().mockResolvedValue({ ok: false, refusal: { reason: 'Something newer changed the DAW.' } });
    act(() => service.toastUndo('Moved the marker', undo));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Something newer changed the DAW.')).toBeTruthy();
    expect(screen.queryByText('Moved the marker')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});

describe('overlay.announce', () => {
  it('writes to one polite region outside any dialog, and a second announcement replaces the first', async () => {
    mount();
    const region = () => document.querySelectorAll('[data-overlay-announcer]');
    expect(region()).toHaveLength(1);
    expect(region()[0].getAttribute('aria-live')).toBe('polite');
    act(() => service.announce('Chapter 3 selected'));
    act(() => service.announce('Chapter 4 selected'));
    expect(region()).toHaveLength(1);
    expect(region()[0].textContent).toBe('Chapter 4 selected');
    // Still in the page, not inside the modal, while a modal is open.
    void ask();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.contains(region()[0])).toBe(false);
    expect(region()[0].textContent).toBe('Chapter 4 selected');
  });
});

describe('overlay.open', () => {
  it('open-returns-a-closer: renders a Dialog; the closer closes it and closing twice is a no-op', async () => {
    mount();
    let close: () => void = () => undefined;
    act(() => {
      close = service.open({ kind: 'dialog', title: 'Voice details', render: () => <p>Narrator one</p> });
    });
    const dialog = await screen.findByRole('dialog', { name: 'Voice details' });
    expect(within(dialog).getByText('Narrator one')).toBeTruthy();
    act(() => close());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(() => act(() => close())).not.toThrow();
    expect(service.getSnapshot().dialogs).toHaveLength(0);
  });

  it('renders a SlideOver, hands render a close, and the header Close button closes it', async () => {
    mount();
    act(() => void service.open({ kind: 'slideOver', title: 'History', render: ({ close }) => <button onClick={close}>Done</button> }));
    const panel = await screen.findByRole('dialog', { name: 'History' });
    expect(panel.hasAttribute('data-slide-over')).toBe(true);
    await userEvent.click(within(panel).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes a Dialog on Escape and the state forgets it', async () => {
    mount();
    act(() => void service.open({ kind: 'dialog', title: 'Voice details', render: () => <p>x</p> }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(service.getSnapshot().dialogs).toHaveLength(0));
  });
});

describe('OverlayProvider', () => {
  it('gives components the service and renders the host', async () => {
    function Caller() {
      const o = useOverlay();
      return <button onClick={() => o.toast('From a component')}>Say</button>;
    }
    render(
      <OverlayProvider service={service}>
        <Caller />
      </OverlayProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Say' }));
    expect(screen.getByText('From a component')).toBeTruthy();
  });
});

describe('toast queue', () => {
  it('keeps four, dropping the oldest information toast before any error', () => {
    service.toast('boom', { tone: 'error' });
    for (const n of [1, 2, 3, 4]) service.toast(`info ${n}`);
    expect(service.getSnapshot().toasts.map((t) => t.text)).toEqual(['boom', 'info 2', 'info 3', 'info 4']);
  });
});

describe('overlay.open headerless', () => {
  it('overlay-dialog-spec-passes-headerless-through: the flag mounts the headerless Dialog, its absence the headed one', () => {
    mount();
    act(() => void service.open({ kind: 'dialog', title: 'Bare', headerless: true, render: () => <p>x</p> }));
    expect(screen.getByRole('dialog', { name: 'Bare' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    cleanup();
    mount();
    act(() => void service.open({ kind: 'dialog', title: 'Headed', render: () => <p>x</p> }));
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});
