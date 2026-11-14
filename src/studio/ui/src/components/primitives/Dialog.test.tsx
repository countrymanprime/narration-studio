// @vitest-environment jsdom
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Dialog, DIALOG_WIDTHS } from './Dialog';
import { Popover } from './Popover';
import { SlideOver } from './SlideOver';
import { tabInsideTrap } from './tabInsideTrap';
import { outwaitEcho } from './outwaitEcho';

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
    const body = within(dialog).getByText('Body text').closest('[data-dialog-content]')!.parentElement;
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

  it('focuses <main> itself, not its first control, when the opener is gone (#2902)', async () => {
    const user = userEvent.setup();
    render(<Harness keepOpener={false} />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    await screen.findByRole('dialog', { name: 'Add note' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('main')));
  });

  it('leaves focus where the closing action put it, outside the dialog, and does not return to the opener (#2902)', async () => {
    const user = userEvent.setup();
    function Moves() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <main tabIndex={-1}>
            <button onClick={() => setOpen(true)}>Open dialog</button>
            <button id="destination">Destination</button>
          </main>
          {open && (
            <Dialog
              title="Go"
              dismissOnOutsidePress={false}
              actions={null}
              onClose={() => {
                setOpen(false);
                document.getElementById('destination')?.focus();
              }}
            >
              <p>Body</p>
            </Dialog>
          )}
        </div>
      );
    }
    render(<Moves />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    await screen.findByRole('dialog', { name: 'Go' });
    await user.keyboard('{Escape}');
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 50))));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement?.id).toBe('destination');
  });

  it('focus moved during close is kept even when the opener is still in the document (#2902)', async () => {
    const user = userEvent.setup();
    // The way the Script reader does it: the close action only sets state, and an effect focuses the destination after the commit.
    function Moves() {
      const [open, setOpen] = useState(false);
      const [go, setGo] = useState(0);
      useEffect(() => {
        if (go) document.getElementById('destination')?.focus();
      }, [go]);
      return (
        <div>
          <main tabIndex={-1}>
            <button onClick={() => setOpen(true)}>Open dialog</button>
            <button id="destination">Destination</button>
          </main>
          {open && (
            <Dialog
              title="Go"
              dismissOnOutsidePress={false}
              actions={null}
              onClose={() => {
                setOpen(false);
                setGo((n) => n + 1);
              }}
            >
              <p>Body</p>
            </Dialog>
          )}
        </div>
      );
    }
    render(<Moves />);
    const opener = screen.getByRole('button', { name: 'Open dialog' });
    for (let round = 0; round < 2; round += 1) {
      opener.focus();
      await user.keyboard(' ');
      await screen.findByRole('dialog', { name: 'Go' });
      await user.keyboard('{Escape}');
      await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 50))));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(opener.isConnected).toBe(true);
      expect(document.activeElement?.id, `round ${round}`).toBe('destination');
    }
  });

  it("a dialog a page-wide key opened from the main landmark gives focus back to the landmark, not to the page's first button (#2839)", async () => {
    const user = userEvent.setup();
    function KeyOpened() {
      const [open, setOpen] = useState(false);
      return (
        <main tabIndex={-1} onKeyDown={(event) => event.key === 'n' && setOpen(true)}>
          <button type="button">Previous chapter</button>
          {open && (
            <Dialog dismissOnOutsidePress={false} title="Who is in Num 7?" onClose={() => setOpen(false)} actions={null}>
              <input aria-label="Track name" autoFocus />
            </Dialog>
          )}
        </main>
      );
    }
    render(<KeyOpened />);
    const main = document.querySelector('main') as HTMLElement;
    main.focus();
    await user.keyboard('n');
    await screen.findByRole('dialog', { name: 'Who is in Num 7?' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(main));
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Previous chapter' }));
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

  // #3416 item 39: a press on the dim area around the popup landed on nothing focusable, so the browser moved focus to <body> while a dialog that ignores outside
  // presses stayed open, and the next Tab started from the page behind it (on the Booth's Stop recording? it reached "Stop and leave").
  it('keeps focus where it is when the dim area around the popup is pressed, and leaves a press inside the popup alone', async () => {
    await openDialog();
    const popup = screen.getByRole('dialog', { name: 'Add note' });
    const viewport = popup.parentElement as HTMLElement;
    const outside = createEvent.mouseDown(viewport, { cancelable: true, bubbles: true });
    fireEvent(viewport, outside);
    expect(outside.defaultPrevented, 'the press outside the popup does not take focus away').toBe(true);
    const inside = createEvent.mouseDown(popup, { cancelable: true, bubbles: true });
    fireEvent(popup, inside);
    expect(inside.defaultPrevented, 'a press inside the popup is the browser’s own').toBe(false);
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
    // The second click of a double click on what opened it lands on the backdrop at once: not a dismissal.
    await user.click(document.querySelector('[data-dialog-backdrop]') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    await outwaitEcho();
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
  it('defaults to the form width, capped at 80dvh tall and 4.75rem above the bottom edge', async () => {
    render(
      <Dialog dismissOnOutsidePress={false} title="Add note" onClose={() => undefined} actions={<Button variant="primary">Save</Button>}>
        <p>Body</p>
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Add note' });
    expect(dialog.className).toContain(DIALOG_WIDTHS.form);
    expect(dialog.className).not.toContain('70vw');
    expect(dialog.style.maxHeight).toMatch(/^min\(80dvh, (calc\()?92dvh - 4.75rem\)?\)$/);
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
    const body = within(dialog).getByText('Body').closest('[data-dialog-content]')!.parentElement as HTMLElement;
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
  const bodyOf = () => screen.getByText('Body text').closest('[data-dialog-content]')!.parentElement!;

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

  // Every dialog now hangs from the top, as the mock's `.scrim` does (ENX-16): a palette 12vh down, every other size 8vh down, `placement="center"` centres.
  it('hangs a palette 12vh from the top, every other size 8vh, and centres on request', async () => {
    render(
      <Dialog dismissOnOutsidePress title="Jump menu" headerless size="palette" onClose={() => undefined} actions={null}>
        <p>List</p>
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Jump menu' });
    expect(dialog.className).toContain(DIALOG_WIDTHS.palette);
    expect(dialog.parentElement!.className).toContain('pt-[12vh]');
    cleanup();
    render(
      <Dialog dismissOnOutsidePress={false} title="Add note" actions={null}>
        <p>Body</p>
      </Dialog>,
    );
    expect((await screen.findByRole('dialog', { name: 'Add note' })).parentElement!.className).toContain('pt-[8vh]');
    cleanup();
    render(
      <Dialog dismissOnOutsidePress={false} title="Add note" placement="center" actions={null}>
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
    const body = within(dialog).getByText('Body').closest('[data-dialog-content]')!.parentElement!;
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

describe("the shell's layout (ENX-13, ENX-16, ENX-23)", () => {
  it('draws its title with the overlay title token, the one a SlideOver uses', () => {
    render(
      <Dialog dismissOnOutsidePress={false} title="Link chapters" onClose={() => undefined} actions={null}>
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.getByRole('heading', { name: 'Link chapters' }).className).toContain('--font-size-overlay-title');
  });

  it('hangs from the top of the window, so its title does not move as the content changes height', () => {
    render(
      <Dialog dismissOnOutsidePress={false} title="Create regions" onClose={() => undefined} actions={null}>
        <p>Body</p>
      </Dialog>,
    );
    const viewport = screen.getByRole('dialog', { name: 'Create regions' }).parentElement!;
    expect(viewport.className).toContain('items-start');
    expect(viewport.className).toContain('pt-[8vh]');
  });

  it('pads its content inside the scroll box, so a sticky table head sticks under the header', () => {
    render(
      <Dialog dismissOnOutsidePress={false} title="Link chapters" onClose={() => undefined} actions={null}>
        <p>Body</p>
      </Dialog>,
    );
    const content = screen.getByText('Body').parentElement!;
    expect(content.hasAttribute('data-dialog-content')).toBe(true);
    expect(content.className).toContain('py-[var(--space-6)]');
    expect(content.parentElement!.className).not.toContain('py-');
  });

  describe("the shell's edges (XSC-36, XSL-16, R3GL-3)", () => {
    it("gives the header and the action row the scroll body's gutter, so their right edges meet the body's", () => {
      render(
        <Dialog dismissOnOutsidePress={false} title="Define marks" onClose={() => undefined} actions={<Button>Done</Button>}>
          <p>Body</p>
        </Dialog>,
      );
      const dialog = screen.getByRole('dialog', { name: 'Define marks' });
      expect(screen.getByRole('heading', { name: 'Define marks' }).parentElement!.className).toContain('[scrollbar-gutter:stable]');
      expect(dialog.querySelector('[data-dialog-actions]')!.className).toContain('[scrollbar-gutter:stable]');
      expect(dialog.querySelector('[data-dialog-content]')!.parentElement!.className).toContain('scroll-y-edges');
    });

    it('keeps 8 px under the last row of a headerless body', () => {
      render(
        <Dialog dismissOnOutsidePress title="Jump menu" headerless onClose={() => undefined} actions={null}>
          <p>List</p>
        </Dialog>,
      );
      expect(screen.getByText('List').closest('[data-dialog-content]')!.className).toContain('pb-2');
    });
  });
});

// #3231: at 320x300 the dialog's own padding, header and footer took about 180 px and left the body about one line. jsdom has no layout, so
// this pins the short-window rules; the real height is measured in the PR (Playwright, mock app).
describe('a-dialog-gives-its-body-the-room-in-a-short-window', () => {
  it('tightens its header, footer and padding under 400 px tall, and keeps the description visible, as a confirm asks its whole question there', () => {
    render(
      <Dialog title="Short" description="Say what this does" dismissOnOutsidePress={false} onClose={() => undefined} actions={<Button>OK</Button>}>
        body
      </Dialog>,
    );
    const short = '[@media(max-height:400px)]';
    expect(screen.getByText('Say what this does').className).not.toContain('sr-only');
    expect(screen.getByRole('button', { name: 'OK' }).parentElement!.className).toContain(`${short}:min-h-0`);
    expect(document.querySelector('h2')!.parentElement!.className).toContain(`${short}:min-h-0`);
  });
});

// #3416: a dialog that opens by itself finds the page's <main> focused, which is not where a narrator was: the opener the page names wins.
describe('Dialog returnFocus for a dialog that opened by itself', () => {
  function SelfOpened() {
    const [open, setOpen] = useState(false);
    useEffect(() => {
      document.querySelector('main')!.focus();
      setOpen(true);
    }, []);
    return (
      <div>
        <main tabIndex={-1}>
          <button>The chip</button>
        </main>
        {open && (
          <Dialog
            dismissOnOutsidePress={false}
            title="Self"
            onClose={() => setOpen(false)}
            returnFocus={() => document.querySelector('button')}
            actions={<Button>Go</Button>}
          >
            <p>Body</p>
          </Dialog>
        )}
      </div>
    );
  }
  it('returns focus to the named opener, not <main>', async () => {
    render(<SelfOpened />);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'The chip' })));
  });
});

// #3416 item 27: a dialog removed together with the thing that opened it (a link made takes away the notice, and the Booth's Record that had focus
// when the dialog came up is off until then) hands focus to <main>, not <body>.
describe('Dialog removed together with its parent', () => {
  function WithParent() {
    const [shown, setShown] = useState(false);
    const [linked, setLinked] = useState(false);
    return (
      <div>
        <main tabIndex={-1} data-testid="landmark">
          <button disabled={!linked} onClick={() => setShown(true)}>
            Record
          </button>
          <button onClick={() => setShown(true)}>Open</button>
        </main>
        {shown && (
          <section>
            <Dialog
              dismissOnOutsidePress={false}
              title="Link"
              onClose={() => setShown(false)}
              actions={
                <Button
                  onClick={() => {
                    setLinked(false);
                    setShown(false);
                  }}
                >
                  Link track
                </Button>
              }
            >
              <p>Body</p>
            </Dialog>
          </section>
        )}
      </div>
    );
  }
  it('focus lands on the page landmark when the opener is off and the whole parent goes', async () => {
    render(<WithParent />);
    // The dialog opens from a control that is off by the time it closes.
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    await userEvent.click(opener);
    opener.setAttribute('disabled', '');
    const action = await screen.findByRole('button', { name: 'Link track' });
    action.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('landmark')));
  });
});
