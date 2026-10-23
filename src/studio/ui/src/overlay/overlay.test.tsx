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

  // docs/design/design-system.md#base-ui-wrappers: a press on the backdrop of a confirm never answers it, so an accidental click cannot discard the question. The issue
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

  it('closes a dialog spec that declares dismissOnOutsidePress when the backdrop is pressed, and keeps a form that declares false (issue 1706)', async () => {
    mount();
    service.open({ kind: 'dialog', title: 'Detail view', dismissOnOutsidePress: true, render: () => <p>Read only</p> });
    await screen.findByRole('dialog', { name: 'Detail view' });
    await userEvent.click(document.querySelector('[data-dialog-backdrop]')!);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Detail view' })).toBeNull());

    service.open({
      kind: 'dialog',
      title: 'Add milestone',
      dismissOnOutsidePress: false,
      render: () => <input aria-label="Name" />,
    });
    await screen.findByRole('dialog', { name: 'Add milestone' });
    await userEvent.click(document.querySelector('[data-dialog-backdrop]')!);
    await act(async () => void (await Promise.resolve()));
    expect(screen.getByRole('dialog', { name: 'Add milestone' })).toBeTruthy();
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
            <Dialog dismissOnOutsidePress={false} title="Details" onClose={() => setOpen(false)} actions={<button onClick={() => void ask()}>Ask</button>}>
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

describe('Escape while focus is still in the layer under a confirm', () => {
  it('answers the confirm, not the Dialog beneath it', async () => {
    function Page() {
      const [open, setOpen] = useState(true);
      return (
        <main tabIndex={-1}>
          {open && (
            <Dialog dismissOnOutsidePress={false} title="Details" onClose={() => setOpen(false)} actions={<button onClick={() => void ask()}>Ask</button>}>
              <p>Body</p>
            </Dialog>
          )}
          <OverlayHost service={service} />
        </main>
      );
    }
    render(<Page />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ask' }));
    await screen.findByRole('alertdialog', { name: 'Delete the take?' });
    // Base UI moves focus into the confirm a frame later; a key pressed before that lands in the Dialog.
    screen.getByRole('button', { name: 'Ask', hidden: true }).focus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Details' })).toBeTruthy();
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

  it('an Undo toast with its own duration outlasts the usual time and is gone after it', () => {
    vi.useFakeTimers();
    mount();
    act(() => service.toastUndo('Saved voice sample.', () => Promise.resolve({ ok: true }), { durationMs: 10_000 }));
    act(() => void vi.advanceTimersByTime(TOAST_INFO_MS + 1000));
    expect(screen.getByText('Saved voice sample.')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(10_000 - TOAST_INFO_MS - 1000));
    expect(screen.queryByText('Saved voice sample.')).toBeNull();
  });

  it('an error toast stays until dismissed', () => {
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

describe('an Undo toast goes when its change is no longer there to undo', () => {
  const ok = () => Promise.resolve({ ok: true as const });

  it('settleUndo takes away the Undo toast of an entry that is gone and keeps the others', () => {
    mount();
    act(() => service.toastUndo('Waived 00:10', ok, { entry: 1 }));
    act(() => service.toastUndo('Waived 00:20', ok, { entry: 2 }));
    act(() => service.settleUndo((entry) => entry === 2));
    expect(screen.queryByText('Waived 00:10')).toBeNull();
    expect(screen.getByText('Waived 00:20')).toBeTruthy();
  });

  it('settleUndo leaves a toast with no entry, and a plain message, alone', () => {
    mount();
    act(() => service.toastUndo('Deleted the note', ok));
    act(() => service.toast('Saved.'));
    act(() => service.settleUndo(() => false));
    expect(screen.getByText('Deleted the note')).toBeTruthy();
    expect(screen.getByText('Saved.')).toBeTruthy();
  });

  it('dismissUndo takes away every Undo toast (the page, the chapter or the project it was about is gone) and nothing else', () => {
    mount();
    act(() => service.toastUndo('Waived 00:10', ok, { entry: 1 }));
    act(() => service.toastUndo('Deleted the note', ok));
    act(() => service.toast('REAPER is starting', { topic: 'start' }));
    act(() => service.toast('Could not save.', { tone: 'error' }));
    act(() => service.dismissUndo());
    expect(screen.queryByText('Waived 00:10')).toBeNull();
    expect(screen.queryByText('Deleted the note')).toBeNull();
    expect(screen.getByText('REAPER is starting')).toBeTruthy();
    expect(screen.getByText('Could not save.')).toBeTruthy();
  });

  it('an Undo toast raised after dismissUndo shows (the new page can raise its own)', () => {
    mount();
    act(() => service.dismissUndo());
    act(() => service.toastUndo('Waived 00:10', ok, { entry: 1 }));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
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
      close = service.open({ kind: 'dialog', dismissOnOutsidePress: false, title: 'Voice details', render: () => <p>Narrator one</p> });
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
    act(() => void service.open({ kind: 'dialog', dismissOnOutsidePress: false, title: 'Voice details', render: () => <p>x</p> }));
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

  it('a message that says what one on screen already says replaces it: thirty presses make one toast, and its timer starts again', () => {
    for (let n = 0; n < 30; n += 1) service.toast('REAPER is not answering.');
    const toasts = service.getSnapshot().toasts;
    expect(toasts.map((t) => t.text)).toEqual(['REAPER is not answering.']);
    service.toast('Something else.');
    service.toast('REAPER is not answering.');
    expect(service.getSnapshot().toasts.map((t) => t.text)).toEqual(['Something else.', 'REAPER is not answering.']);
  });

  it('the same words as an error and as information are two messages; one with an action is never merged away', () => {
    service.toast('Saved.');
    service.toast('Saved.', { tone: 'error' });
    expect(service.getSnapshot().toasts.map((t) => t.tone)).toEqual(['info', 'error']);
    const undo = () => undefined;
    service.toast('Moved.', { action: { label: 'Undo', onAction: undo } });
    service.toast('Moved.', { action: { label: 'Undo', onAction: undo } });
    expect(service.getSnapshot().toasts.filter((t) => t.text === 'Moved.')).toHaveLength(2);
  });

  it('a topic holds one message: the newest replaces the one before it, and dismissTopic takes it away', () => {
    service.toast('REAPER is starting. Record turns on here once it connects.', { topic: 'daw-start' });
    service.toast('Unrelated.');
    service.toast('REAPER could not be started: the program did not open.', { tone: 'error', topic: 'daw-start' });
    expect(service.getSnapshot().toasts.map((t) => t.text)).toEqual(['Unrelated.', 'REAPER could not be started: the program did not open.']);
    service.dismissTopic('daw-start');
    expect(service.getSnapshot().toasts.map((t) => t.text)).toEqual(['Unrelated.']);
    service.dismissTopic('daw-start');
    expect(service.getSnapshot().toasts).toHaveLength(1);
  });
});

describe('overlay.open headerless', () => {
  it('overlay-dialog-spec-passes-headerless-through: the flag mounts the headerless Dialog, its absence the headed one', () => {
    mount();
    act(() => void service.open({ kind: 'dialog', dismissOnOutsidePress: false, title: 'Bare', headerless: true, render: () => <p>x</p> }));
    expect(screen.getByRole('dialog', { name: 'Bare' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    cleanup();
    mount();
    act(() => void service.open({ kind: 'dialog', dismissOnOutsidePress: false, title: 'Headed', render: () => <p>x</p> }));
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});
