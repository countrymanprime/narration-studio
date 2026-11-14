// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';
import { SlideOver } from './SlideOver';
import { tabInsideTrap } from './tabInsideTrap';

afterEach(cleanup);

function Harness({ onClose = () => undefined }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <main tabIndex={-1}>
        <button onClick={() => setOpen(true)}>Open panel</button>
        <button>Behind the panel</button>
      </main>
      <SlideOver
        open={open}
        title="Entry details"
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      >
        <p>Alice is the protagonist.</p>
        <button>Inside the panel</button>
      </SlideOver>
    </div>
  );
}

async function openPanel(onClose?: () => void) {
  const user = userEvent.setup();
  render(<Harness onClose={onClose} />);
  await user.click(screen.getByRole('button', { name: 'Open panel' }));
  return { user, panel: await screen.findByRole('dialog', { name: 'Entry details' }) };
}

describe('SlideOver is a real modal panel', () => {
  it('renders nothing while closed and a named dialog while open', async () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[data-slide-over]')).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open panel' }));
    const panel = await screen.findByRole('dialog', { name: 'Entry details' });
    expect(panel.hasAttribute('data-slide-over')).toBe(true);
    expect(within(panel).getByRole('heading', { name: 'Entry details' })).toBeTruthy();
  });

  it('hides the page behind it while open', async () => {
    await openPanel();
    expect(screen.queryByRole('button', { name: 'Behind the panel' })).toBeNull();
  });

  it('closes on Escape and gives focus back to the opener', async () => {
    const onClose = vi.fn();
    const { user } = await openPanel(onClose);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open panel' })));
  });

  it('sends focus into <main> when the opener is gone by the time it closes', async () => {
    function GoneOpener() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <main tabIndex={-1}>
            {!open && <button onClick={() => setOpen(true)}>Open panel</button>}
            <button>Other control</button>
          </main>
          <SlideOver open={open} title="Entry details" onClose={() => setOpen(false)}>
            <p>Body</p>
          </SlideOver>
        </div>
      );
    }
    const user = userEvent.setup();
    render(<GoneOpener />);
    await user.click(screen.getByRole('button', { name: 'Open panel' }));
    await screen.findByRole('dialog', { name: 'Entry details' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.querySelector('main')?.contains(document.activeElement)).toBe(true));
  });

  it('closes on its Close button, with the label a caller chose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <SlideOver open title="Entry" closeLabel="Close review panel" onClose={onClose}>
        <p>Body</p>
      </SlideOver>,
    );
    await user.click(await screen.findByRole('button', { name: 'Close review panel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('dims the page behind it, like the page drawers (alignment audit cause O)', () => {
    render(
      <SlideOver open title="Voice data" onClose={() => undefined}>
        <p>Body</p>
      </SlideOver>,
    );
    expect(document.querySelector('[data-slide-over-backdrop]')!.className).toContain('bg-[var(--panel-scrim)]');
  });

  it('closes when the click-away backdrop is pressed', async () => {
    const onClose = vi.fn();
    const { user } = await openPanel(onClose);
    await new Promise((resolve) => setTimeout(resolve, 450));
    await user.click(document.querySelector('[data-slide-over-backdrop]') as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ignores a press on the backdrop in the instant after it opens: the second press of a double click on its opener', async () => {
    const onClose = vi.fn();
    const { user } = await openPanel(onClose);
    await user.click(document.querySelector('[data-slide-over-backdrop]') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  // The Link chapters dialog opens over the Audio engine panel: a double click on its Cancel closed the dialog on the first click and the panel on the second.
  it('ignores a backdrop press in the instant after a dialog opened over the panel closes: the second press of a double click on its button', async () => {
    const onClose = vi.fn();
    function Over() {
      const [dialog, setDialog] = useState(false);
      return (
        <SlideOver open title="Audio engine" onClose={onClose}>
          <button onClick={() => setDialog(true)}>Open dialog</button>
          {dialog && (
            <Dialog title="Link chapters" dismissOnOutsidePress={false} onClose={() => setDialog(false)} actions={<span />}>
              <p>Body</p>
            </Dialog>
          )}
        </SlideOver>
      );
    }
    const user = userEvent.setup();
    render(<Over />);
    await new Promise((resolve) => setTimeout(resolve, 450));
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Link chapters' })).toBeNull());

    await user.click(document.querySelector('[data-slide-over-backdrop]') as HTMLElement);

    expect(onClose).not.toHaveBeenCalled();
  });

  // #3416 item 63: a press on a layer opened over the panel is a press outside the panel too, and it closed both. One press dismisses only the top layer.
  it('ignores a backdrop press while a dialog is open over the panel', async () => {
    const onClose = vi.fn();
    render(
      <SlideOver open title="Audio engine" onClose={onClose}>
        <Dialog title="Link chapters" dismissOnOutsidePress onClose={() => undefined} actions={<span />}>
          <p>Body</p>
        </Dialog>
      </SlideOver>,
    );
    await new Promise((resolve) => setTimeout(resolve, 450));
    await screen.findByRole('dialog', { name: 'Link chapters' });
    await userEvent.setup().click(document.querySelector('[data-slide-over-backdrop]') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  // A held press: the layer closes on the press itself, so by the time the panel hears the outside press the layer has gone. It was open when the press began.
  it('ignores a press that began while a menu was open over the panel, though the menu is gone by its release', async () => {
    const onClose = vi.fn();
    render(
      <SlideOver open title="Audio engine" onClose={onClose}>
        <p>Body</p>
      </SlideOver>,
    );
    await new Promise((resolve) => setTimeout(resolve, 450));
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.append(menu);
    const backdrop = document.querySelector('[data-slide-over-backdrop]') as HTMLElement;
    const user = userEvent.setup();
    await user.pointer({ keys: '[MouseLeft>]', target: backdrop });
    menu.remove();
    await user.pointer({ keys: '[/MouseLeft]', target: backdrop });
    expect(onClose).not.toHaveBeenCalled();
    // The next press, with no layer, closes it.
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  // qa-breaker on #3478: the note was only rewritten on pointerdown, so a click with none (assistive technology's) after a layer press was ignored too.
  it('an outside click with no pointerdown closes the panel after an earlier press began over a layer', async () => {
    const onClose = vi.fn();
    render(
      <SlideOver open title="Audio engine" onClose={onClose}>
        <p>Body</p>
      </SlideOver>,
    );
    await new Promise((resolve) => setTimeout(resolve, 450));
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.append(menu);
    const backdrop = document.querySelector('[data-slide-over-backdrop]') as HTMLElement;
    const user = userEvent.setup();
    await user.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    menu.remove();
    await new Promise((resolve) => setTimeout(resolve, 20));
    backdrop.click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on a backdrop press again once the dialog over it has closed (the guard does not stay on)', async () => {
    const onClose = vi.fn();
    function Over() {
      const [dialog, setDialog] = useState(true);
      return (
        <SlideOver open title="Audio engine" onClose={onClose}>
          {dialog && (
            <Dialog title="Link chapters" dismissOnOutsidePress onClose={() => setDialog(false)} actions={<span />}>
              <p>Body</p>
            </Dialog>
          )}
        </SlideOver>
      );
    }
    const user = userEvent.setup();
    render(<Over />);
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Link chapters' })).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 450));
    await user.click(document.querySelector('[data-slide-over-backdrop]') as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
  });

  // A popover or a menu open over the panel is the same case, covered in the real app by tests/visual/dialog-over-slideover-press.spec.ts (jsdom removes the popup before the panel reads the press).

  it('keeps Tab inside the panel', async () => {
    const { user } = await openPanel();
    const behind = screen.getByRole('button', { name: 'Behind the panel', hidden: true });
    for (let press = 0; press < 8; press += 1) {
      const focused = await tabInsideTrap(user);
      expect(focused, `press ${press}`).not.toBe(behind);
    }
  });
});

describe('the header (ENX-11, ENX-13)', () => {
  it('is one height whatever the title, which keeps to one line and names itself in full on hover', () => {
    render(
      <SlideOver open title="Editing check: Chapter 1 — Down the Rabbit-Hole" onClose={() => undefined}>
        <p>Body</p>
      </SlideOver>,
    );
    const title = screen.getByRole('heading', { name: 'Editing check: Chapter 1 — Down the Rabbit-Hole' });
    expect(title.className).toContain('truncate');
    expect(title.className).toContain('flex-1');
    expect(title.getAttribute('title')).toBe('Editing check: Chapter 1 — Down the Rabbit-Hole');
    // 52 px since XSL-13 (the top bar's height), 60 px before.
    expect(title.parentElement!.className).toContain('h-13');
  });

  it('draws its title with the overlay title token, larger than a card title', () => {
    render(
      <SlideOver open title="Audio engine" onClose={() => undefined}>
        <p>Body</p>
      </SlideOver>,
    );
    expect(screen.getByRole('heading', { name: 'Audio engine' }).className).toContain('--font-size-overlay-title');
  });

  // XSL-13: the panel's rule stood 12 px under the top bar's.
  it("draws its header at the top bar's 52 px, so the two rules meet", () => {
    render(
      <SlideOver open title="Undo history" onClose={() => undefined}>
        <p>Body</p>
      </SlideOver>,
    );
    expect(screen.getByRole('heading', { name: 'Undo history' }).parentElement!.className).toContain('h-13');
  });
});
