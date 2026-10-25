// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Dialog, DIALOG_WIDTHS } from './Dialog';
import { Popover } from './Popover';
import { SlideOver } from './SlideOver';
import { tabInsideTrap } from './tabInsideTrap';

afterEach(cleanup);

// The app renders a dialog conditionally, as `{open && <Dialog dismissOnOutsidePress={false} ... />}`, so this harness does the same: it is the shape
// every consumer has, with no trigger element inside the dialog.
function Harness({ dismissible = true, withAutofocus = false, keepOpener = true }: { dismissible?: boolean; withAutofocus?: boolean; keepOpener?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <main tabIndex={-1}>
        {(keepOpener || !open) && <button onClick={() => setOpen(true)}>Open dialog</button>}
        <button>Behind the dialog</button>
      </main>
      {open && (
        <Dialog
          dismissOnOutsidePress={false}
          title="Add note"
          onClose={dismissible ? () => setOpen(false) : undefined}
          actions={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary">Save</Button>
            </>
          }
        >
          <p>Body text</p>
          {withAutofocus && <textarea aria-label="Note text" autoFocus />}
        </Dialog>
      )}
    </div>
  );
}

async function openDialog() {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Open dialog' }));
  return { user, dialog: await screen.findByRole('dialog', { name: 'Add note' }) };
}

describe('Dialog is a real modal', () => {
  it('is named by its visible title and renders outside the page it covers', async () => {
    const { dialog } = await openDialog();
    expect(within(dialog).getByRole('heading', { name: 'Add note' })).toBeTruthy();
    expect(document.querySelector('main')?.contains(dialog)).toBe(false);
  });

  it('puts focus on the body region so a screen reader reads the message first', async () => {
    const { dialog } = await openDialog();
    const body = within(dialog).getByText('Body text').parentElement;
    // Base UI applies the initial focus a frame after the dialog mounts.
    await waitFor(() => expect(document.activeElement).toBe(body));
  });

  it('lets an autoFocus child win over the body region', async () => {
    const user = userEvent.setup();
    render(<Harness withAutofocus />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    await screen.findByRole('dialog', { name: 'Add note' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Note text' })));
  });

  it('hides the page behind it from assistive technology while open', async () => {
    await openDialog();
    expect(screen.queryByRole('button', { name: 'Behind the dialog' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Behind the dialog', hidden: true }).closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    await openDialog();
    const user = userEvent.setup();
    const page = screen.getByRole('button', { name: 'Behind the dialog', hidden: true });
    // Tab may stop for a moment on one of the invisible focus guards that bracket the dialog, and it wraps from there;
    // `tabInsideTrap` waits for it to settle. What must never happen is focus reaching the page behind it.
    for (let press = 0; press < 14; press += 1) {
      const focused = await tabInsideTrap(user, { shift: press % 3 === 2 });
      expect(focused, `press ${press}`).not.toBe(page);
    }
  });

  it('closes on Escape when there is an onClose and returns focus to the opener', async () => {
    const { user } = await openDialog();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open dialog' })));
  });

  it('lets Escape close a Popover inside it first, leaving the dialog open', async () => {
    const user = userEvent.setup();
    function WithPopover() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open dialog</button>
          {open && (
            <Dialog dismissOnOutsidePress={false} title="Read aloud" onClose={() => setOpen(false)} actions={null}>
              <Popover trigger={<Button>Microphone</Button>} label="Microphone">
                <button type="button">Refresh</button>
              </Popover>
            </Dialog>
          )}
        </div>
      );
    }
    render(<WithPopover />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    const dialog = await screen.findByRole('dialog', { name: 'Read aloud' });
    await user.click(within(dialog).getByRole('button', { name: 'Microphone' }));
    await screen.findByRole('dialog', { name: 'Microphone' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Microphone' })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Read aloud' })).toBeTruthy();
  });

  it('returns focus to the opener when a button closes it', async () => {
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open dialog' })));
  });

  it('falls back into the main landmark when the opener is gone', async () => {
    const user = userEvent.setup();
    render(<Harness keepOpener={false} />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    await screen.findByRole('dialog', { name: 'Add note' });
    await user.keyboard('{Escape}');
    // The opener was removed while the dialog was open, so focus goes to the landmark (or its first control), not <body>.
    await waitFor(() => expect(document.querySelector('main')?.contains(document.activeElement)).toBe(true));
  });

  it('ignores Escape when the dialog has no way to be dismissed', async () => {
    const user = userEvent.setup();
    render(<Harness dismissible={false} />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    await screen.findByRole('dialog', { name: 'Add note' });
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Add note' })).toBeTruthy();
  });

  it('does not close when the backdrop is pressed', async () => {
    const { user } = await openDialog();
    const backdrop = document.querySelector('[data-dialog-backdrop]') as HTMLElement;
    expect(backdrop).not.toBeNull();
    await user.click(backdrop);
    expect(screen.getByRole('dialog', { name: 'Add note' })).toBeTruthy();
  });

  it('closes on a backdrop press only when the dialog opts in with dismissOnOutsidePress (a palette, not a confirm)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <main>
        <Dialog title="Palette" headerless dismissOnOutsidePress actions={null} onClose={onClose}>
          <p>Body</p>
        </Dialog>
      </main>,
    );
    await screen.findByRole('dialog', { name: 'Palette' });
    await user.click(document.querySelector('[data-dialog-backdrop]') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on a press inside the popup when it opts in to outside dismissal', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog title="Palette" headerless dismissOnOutsidePress actions={null} onClose={onClose}>
        <p>Body</p>
      </Dialog>,
    );
    await user.click(await screen.findByText('Body'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reports the header Close button exactly once', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog dismissOnOutsidePress={false} title="Add note" onClose={onClose} actions={<Button variant="primary">Save</Button>}>
        <p>Body</p>
      </Dialog>,
    );
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('offers a separate Escape handler for a dialog that has no header Close button', async () => {
    const onEscape = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog dismissOnOutsidePress={false} title="Import manuscript" onEscape={onEscape} actions={<Button variant="primary">Done</Button>}>
        <p>Body</p>
      </Dialog>,
    );
    await screen.findByRole('dialog', { name: 'Import manuscript' });
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it('ignores Escape when escapeCloses is false, but the header Close button still works', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog dismissOnOutsidePress={false} title="Downloading" onClose={onClose} escapeCloses={false} actions={<Button variant="primary">Cancel</Button>}>
        <p>Body</p>
      </Dialog>,
    );
    await screen.findByRole('dialog', { name: 'Downloading' });
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps a live region reachable while a dialog hides the rest of the page', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button onClick={() => undefined}>Behind</button>
        <div role="status" aria-live="polite">
          Saved
        </div>
        <Dialog dismissOnOutsidePress={false} title="Add note" onClose={() => undefined} actions={<Button variant="primary">Save</Button>}>
          <p>Body</p>
        </Dialog>
      </div>,
    );
    await screen.findByRole('dialog', { name: 'Add note' });
    await user.tab();
    expect(screen.queryByRole('button', { name: 'Behind' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Saved');
  });

  it('is an alertdialog described by its text when it is the alert variant', async () => {
    render(
      <Dialog
        dismissOnOutsidePress={false}
        title="Delete entry"
        variant="alert"
        description="This cannot be undone."
        actions={<Button variant="primary">Delete</Button>}
      >
        <p>Extra</p>
      </Dialog>,
    );
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete entry' });
    expect(dialog.getAttribute('aria-describedby')).not.toBeNull();
    expect(within(dialog).getByText('This cannot be undone.').id).toBe(dialog.getAttribute('aria-describedby'));
  });

  it('draws no action row when it has no actions, and keeps the body as the one focus target', async () => {
    render(
      <Dialog dismissOnOutsidePress={false} title="Rebuild" actions={null}>
        <p>Working</p>
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Rebuild' });
    expect(dialog.querySelector('[data-dialog-actions]')).toBeNull();
    expect(within(dialog).queryAllByRole('button')).toHaveLength(0);
    await waitFor(() => expect(dialog.querySelector('[tabindex="0"]')).toBe(document.activeElement));
  });

  // Amending src/studio/ui/src/components/primitives/Dialog.tsx: a region between the body and `actions` that never
  // scrolls with the body, for the read-aloud dialog's control bar.
  it('draws the footer outside the scrolling body and above actions, and draws nothing when it is absent', async () => {
    render(
      <Dialog
        dismissOnOutsidePress={false}
        title="Read aloud"
        actions={<Button variant="primary">Close</Button>}
        footer={<div data-testid="bar">Reading controls</div>}
      >
        <p>Body</p>
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Read aloud' });
    const body = dialog.querySelector('[tabindex="0"]');
    const footer = screen.getByTestId('bar');
    expect(body?.contains(footer)).toBe(false);
    const actions = dialog.querySelector('[data-dialog-actions]');
    expect(footer.compareDocumentPosition(actions!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    cleanup();
    render(
      <Dialog dismissOnOutsidePress={false} title="Rebuild" actions={null}>
        <p>Working</p>
      </Dialog>,
    );
    expect(screen.queryByTestId('bar')).toBeNull();
  });
});

// `size="full"` fills the viewport with a margin and scrolls its
// body, with no change to the modal contract that every other size shares.
describe('Dialog size="full"', () => {
  it('defaults to the form width, capped at 80dvh tall', async () => {
    render(
      <Dialog dismissOnOutsidePress={false} title="Add note" onClose={() => undefined} actions={<Button variant="primary">Save</Button>}>
        <p>Body</p>
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Add note' });
    expect(dialog.className).toContain(DIALOG_WIDTHS.form);
    expect(dialog.className).not.toContain('70vw');
    expect(dialog.style.maxHeight).toBe('80dvh');
    expect(dialog.style.height).toBe('');
  });

  it('fills the viewport with a fixed margin and scrolls its body', async () => {
    render(
      <Dialog dismissOnOutsidePress={false} title="Read aloud" onClose={() => undefined} actions={<Button variant="primary">Close</Button>} size="full">
        <p>Body</p>
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Read aloud' });
    expect(dialog.className).toContain('max-w-[calc(100vw-2rem)]');
    expect(dialog.style.height).toBe('calc(100dvh - 2rem)');
    expect(dialog.style.maxHeight).toBe('calc(100dvh - 2rem)');
    const body = within(dialog).getByText('Body').parentElement as HTMLElement;
    expect(body.className).toContain('overflow-y-auto');
  });

  it('keeps the same modal contract at the full size: Tab loops inside, Escape closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <div>
        <button>Behind the dialog</button>
        <Dialog dismissOnOutsidePress={false} title="Read aloud" onClose={onClose} actions={<Button variant="primary">Close</Button>} size="full">
          <p>Body</p>
        </Dialog>
      </div>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Read aloud' });
    const page = screen.getByRole('button', { name: 'Behind the dialog', hidden: true });
    for (let press = 0; press < 6; press += 1) {
      const focused = await tabInsideTrap(user, { shift: press % 3 === 2 });
      expect(focused, `press ${press}`).not.toBe(page);
    }
    expect(within(dialog).getByRole('heading', { name: 'Read aloud' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('Dialog backdrop', () => {
  it('dims the page even when the dialog opens from inside a SlideOver (chapter-track-link-control/06)', async () => {
    function Nested() {
      const [confirming, setConfirming] = useState(false);
      return (
        <SlideOver open title="Track" onClose={() => {}}>
          <button onClick={() => setConfirming(true)}>Remove</button>
          {confirming && (
            <Dialog
              dismissOnOutsidePress={false}
              title="Remove it?"
              onClose={() => setConfirming(false)}
              actions={<Button onClick={() => setConfirming(false)}>Cancel</Button>}
            >
              Body
            </Dialog>
          )}
        </SlideOver>
      );
    }
    render(<Nested />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await screen.findByRole('dialog', { name: 'Remove it?' });
    expect(document.querySelector('[data-dialog-backdrop]')).not.toBeNull();
  });
});

describe('Dialog headerless', () => {
  function Headerless() {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <main tabIndex={-1}>
          <button onClick={() => setOpen(true)}>Open palette</button>
        </main>
        {open && (
          <Dialog dismissOnOutsidePress={false} title="Jump menu" headerless onClose={() => setOpen(false)} actions={null}>
            <input aria-label="Field" autoFocus />
          </Dialog>
        )}
      </div>
    );
  }

  it('dialog-headerless-keeps-its-name: no visible header, still named by the hidden title, focus returns to the opener', async () => {
    const user = userEvent.setup();
    render(<Headerless />);
    await user.click(screen.getByRole('button', { name: 'Open palette' }));
    const dialog = await screen.findByRole('dialog', { name: 'Jump menu' });
    expect(within(dialog).getByText('Jump menu').className).toContain('sr-only');
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('textbox')));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open palette' })));
  });

  it('dialog-headerless-has-no-close-button-and-escape-closes', async () => {
    const user = userEvent.setup();
    render(<Headerless />);
    await user.click(screen.getByRole('button', { name: 'Open palette' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Close' })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Dialog body scrolling', () => {
  const bodyOf = () => screen.getByText('Body text').parentElement!;

  it('scrolls its body, as a focusable region, by default', () => {
    render(
      <Dialog dismissOnOutsidePress={false} title="Scrolls" actions={null}>
        <p>Body text</p>
      </Dialog>,
    );
    expect(bodyOf().className).toContain('overflow-y-auto');
    expect(bodyOf().getAttribute('tabindex')).toBe('0');
  });

  it('with bodyScroll off, the body is a column that does not scroll and is not a tab stop, so its content scrolls one thing itself', () => {
    render(
      <Dialog dismissOnOutsidePress={false} title="Fixed" bodyScroll={false} actions={null}>
        <p>Body text</p>
      </Dialog>,
    );
    expect(bodyOf().className).not.toContain('overflow-y-auto');
    expect(bodyOf().className).toContain('flex-col');
    expect(bodyOf().className).toContain('overflow-y-hidden');
    expect(bodyOf().hasAttribute('tabindex')).toBe(false);
  });
});

// Alignment audit cause B: every dialog was 70vw wide whatever it held, footers had three layouts and sat 1.6 px outside the
// body's edge, and the jump menu was centred so its field moved as the list changed.
describe('Dialog widths and action row', () => {
  it('sizes an alert as a confirm, and takes an explicit size from the scale', async () => {
    render(
      <Dialog dismissOnOutsidePress={false} variant="alert" title="Delete entry?" description="It cannot be undone." actions={<Button>Delete</Button>}>
        {null}
      </Dialog>,
    );
    expect((await screen.findByRole('alertdialog', { name: 'Delete entry?' })).className).toContain(DIALOG_WIDTHS.confirm);
    cleanup();
    render(
      <Dialog dismissOnOutsidePress={false} title="Link chapters" size="wide" actions={null}>
        <p>Table</p>
      </Dialog>,
    );
    expect((await screen.findByRole('dialog', { name: 'Link chapters' })).className).toContain(DIALOG_WIDTHS.wide);
    expect(Object.values(DIALOG_WIDTHS)).toEqual(['max-w-[28rem]', 'max-w-[36rem]', 'max-w-[40rem]', 'max-w-[56rem]']);
  });

  it('hangs a palette from the top and centres every other size', async () => {
    render(
      <Dialog dismissOnOutsidePress title="Jump menu" headerless size="palette" onClose={() => undefined} actions={null}>
        <p>List</p>
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Jump menu' });
    expect(dialog.className).toContain(DIALOG_WIDTHS.palette);
    expect(dialog.parentElement!.className).toContain('items-start');
    cleanup();
    render(
      <Dialog dismissOnOutsidePress={false} title="Add note" actions={null}>
        <p>Body</p>
      </Dialog>,
    );
    expect((await screen.findByRole('dialog', { name: 'Add note' })).parentElement!.className).toContain('items-center');
  });

  it('wraps the action row, keeps a lone action at the right, and insets it like the header and body', async () => {
    render(
      <Dialog dismissOnOutsidePress={false} title="Options" onClose={() => undefined} actions={<Button>Close</Button>}>
        <p>Body</p>
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Options' });
    const row = dialog.querySelector<HTMLElement>('[data-dialog-actions]')!;
    expect(row.className).toContain('flex-wrap');
    expect(row.className).toContain('justify-end');
    expect(row.className).not.toContain('justify-between');
    // 'between' moves only the first of several actions to the left.
    expect(row.className).toContain('[&>:first-child:not(:only-child)]:mr-auto');
    const header = within(dialog).getByText('Options').parentElement!;
    const body = within(dialog).getByText('Body').parentElement!;
    for (const part of [row, header, body]) expect(part.className).toContain('px-[var(--space-6)]');
  });

  it('puts a gap under the description before the content', async () => {
    render(
      <Dialog dismissOnOutsidePress={false} title="Sync" description="Chapters become tracks." actions={null}>
        <p>Body</p>
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Sync' });
    expect(within(dialog).getByText('Chapters become tracks.').className).toContain('mb-3');
  });
});
