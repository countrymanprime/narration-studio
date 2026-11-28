// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Toolbar, ToolbarButton } from './Toolbar';

afterEach(cleanup);

function Example({ onSpace = () => undefined, onRecord = () => undefined }: { onSpace?: () => void; onRecord?: () => void }) {
  return (
    <Toolbar label="Booth commands">
      <ToolbarButton render={<Button onClick={onSpace}>Play</Button>} />
      <ToolbarButton render={<Button onClick={onRecord}>Record</Button>} />
      <ToolbarButton disabled focusableWhenDisabled={false} render={<Button>Erase</Button>} />
      <ToolbarButton render={<IconButton label="Full screen">F</IconButton>} />
    </Toolbar>
  );
}

describe('Toolbar', () => {
  it('is a named toolbar of buttons', () => {
    render(<Example />);
    const toolbar = screen.getByRole('toolbar', { name: 'Booth commands' });
    expect(toolbar.getAttribute('aria-orientation')).toBe('horizontal');
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('keeps one tab stop: only the first item is in the tab order until focus moves', async () => {
    render(<Example />);
    const [play, record, erase, full] = screen.getAllByRole('button');
    expect(play.tabIndex).toBe(0);
    expect(record.tabIndex).toBe(-1);
    expect(erase.tabIndex).toBe(-1);
    expect(full.tabIndex).toBe(-1);
    await userEvent.setup().tab();
    expect(document.activeElement).toBe(play);
  });

  it('moves focus with the arrow keys, skipping a disabled item that is out of the rotation', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const [play, record, , full] = screen.getAllByRole('button');
    await user.tab();
    expect(document.activeElement).toBe(play);
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(record);
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(full);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(record);
  });

  it('Home and End jump to the first and last item', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const [play, record, , full] = screen.getAllByRole('button');
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(record);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(full);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(play);
  });

  it('moves with Up/Down instead of Left/Right when vertical', async () => {
    const user = userEvent.setup();
    render(
      <Toolbar label="Rail" orientation="vertical">
        <ToolbarButton render={<Button>One</Button>} />
        <ToolbarButton render={<Button>Two</Button>} />
      </Toolbar>,
    );
    const [one, two] = screen.getAllByRole('button');
    await user.tab();
    expect(document.activeElement).toBe(one);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(two);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(one);
  });

  it('presses reach the wrapped button and a disabled one never fires', async () => {
    const onSpace = vi.fn();
    const onRecord = vi.fn();
    render(<Example onSpace={onSpace} onRecord={onRecord} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Record' }));
    expect(onRecord).toHaveBeenCalledTimes(1);
    expect(onSpace).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Erase' }));
    expect(onRecord).toHaveBeenCalledTimes(1);
  });

  // A chord (Ctrl, Alt or Meta held) is the page's, not the button's (#4195): Base UI presses a toolbar button on the keydown of Space or Enter whatever else is
  // held, and Ctrl+Alt+Space on "Open the cleanup tools" in the engine panel opened that button's dialog although the Booth had refused the chord.
  it.each([
    ['Ctrl+Space', { key: ' ', code: 'Space', ctrlKey: true }],
    ['Alt+Space', { key: ' ', code: 'Space', altKey: true }],
    ['Meta+Space', { key: ' ', code: 'Space', metaKey: true }],
    ['Ctrl+Alt+Space', { key: ' ', code: 'Space', ctrlKey: true, altKey: true }],
    ['Ctrl+Enter', { key: 'Enter', code: 'Enter', ctrlKey: true }],
    ['Meta+NumpadEnter', { key: 'Enter', code: 'NumpadEnter', metaKey: true }],
  ])("a button takes no %s press, and the key's default is stopped", (_name, key) => {
    const onRecord = vi.fn();
    render(<Example onRecord={onRecord} />);
    const record = screen.getByRole('button', { name: 'Record' });
    record.focus();
    // `fireEvent` answers false when the keydown's default was prevented.
    expect(fireEvent.keyDown(record, key)).toBe(false);
    fireEvent.keyUp(record, key);
    expect(onRecord).not.toHaveBeenCalled();
  });

  // The page's side: the chord must still reach the router, which listens on the document.
  it('the Ctrl+Alt+Space chord still reaches the page once, prevented, and presses nothing', () => {
    const onRecord = vi.fn();
    render(<Example onRecord={onRecord} />);
    const record = screen.getByRole('button', { name: 'Record' });
    record.focus();
    const seen: boolean[] = [];
    const onKeyDown = (event: KeyboardEvent) => void seen.push(event.defaultPrevented);
    document.addEventListener('keydown', onKeyDown);
    try {
      fireEvent.keyDown(record, { key: ' ', code: 'Space', ctrlKey: true, altKey: true });
    } finally {
      document.removeEventListener('keydown', onKeyDown);
    }
    expect(seen).toEqual([true]);
    expect(onRecord).not.toHaveBeenCalled();
  });

  it('a chord of another key on a button is left alone, not prevented', () => {
    render(<Example />);
    const record = screen.getByRole('button', { name: 'Record' });
    record.focus();
    expect(fireEvent.keyDown(record, { key: '@', code: 'KeyQ', ctrlKey: true, altKey: true })).toBe(true);
    expect(fireEvent.keyDown(record, { key: 'a', code: 'KeyA', ctrlKey: true })).toBe(true);
  });

  // Enter on a native button is the browser's own press, which a jsdom keydown does not make; the real-browser case is in booth-popover-handback.spec.ts.
  it('a button still takes a plain Space press', () => {
    const onRecord = vi.fn();
    render(<Example onRecord={onRecord} />);
    const record = screen.getByRole('button', { name: 'Record' });
    record.focus();
    fireEvent.keyDown(record, { key: ' ', code: 'Space' });
    fireEvent.keyUp(record, { key: ' ', code: 'Space' });
    expect(onRecord).toHaveBeenCalledOnce();
  });

  it("a chord on a button stops the key's default, which is the browser's own Enter press of a native button", () => {
    render(<Example />);
    const record = screen.getByRole('button', { name: 'Record' });
    record.focus();
    expect(fireEvent.keyDown(record, { key: 'Enter', code: 'Enter', ctrlKey: true })).toBe(false);
    expect(fireEvent.keyDown(record, { key: 'Enter', code: 'Enter' })).toBe(true);
  });

  it('names an icon-only button by its own label, unchanged by the toolbar', () => {
    render(<Example />);
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeTruthy();
  });

  it('draws a real gap by default, and none for a segmented bar whose items share a border instead', () => {
    const { rerender } = render(
      <Toolbar label="Gapped">
        <ToolbarButton render={<Button>One</Button>} />
      </Toolbar>,
    );
    expect(screen.getByRole('toolbar').className).toContain('gap-1');
    rerender(
      <Toolbar label="Flush" gapClassName="gap-0">
        <ToolbarButton render={<Button>One</Button>} />
      </Toolbar>,
    );
    expect(screen.getByRole('toolbar').className).toContain('gap-0');
    expect(screen.getByRole('toolbar').className).not.toContain('gap-1');
  });
});
