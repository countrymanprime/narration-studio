// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { markDialogClosed } from './dialogClosed';
import { escapeClosesPanel, useReturnFocusTarget } from './focusReturn';

afterEach(cleanup);

function Rig({ close }: { close: () => void }) {
  const onKeyDown = escapeClosesPanel(close, () => document.getElementById('opener'));
  return (
    <>
      <button id="opener" onKeyDown={onKeyDown}>
        Opener
      </button>
      <div data-testid="panel" onKeyDown={onKeyDown}>
        <button>Inside</button>
        <button onKeyDown={(event) => event.preventDefault()}>Takes the key</button>
      </div>
    </>
  );
}

describe('escapeClosesPanel', () => {
  it('closes the panel and focuses the opener when Escape is pressed inside it', () => {
    const close = vi.fn();
    render(<Rig close={close} />);
    screen.getByText('Inside').focus();
    fireEvent.keyDown(screen.getByText('Inside'), { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByText('Opener'));
  });

  it('closes from the opener itself and keeps focus there', () => {
    const close = vi.fn();
    render(<Rig close={close} />);
    screen.getByText('Opener').focus();
    fireEvent.keyDown(screen.getByText('Opener'), { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByText('Opener'));
  });

  it('keeps the key from the page behind it, so the page does not also blur or clear', () => {
    const behind = vi.fn();
    render(
      <div onKeyDown={behind}>
        <Rig close={() => {}} />
      </div>,
    );
    fireEvent.keyDown(screen.getByText('Inside'), { key: 'Escape' });
    expect(behind).not.toHaveBeenCalled();
  });

  it('ignores other keys, a key a widget already took, and a key from a layer portaled out of the panel', () => {
    const close = vi.fn();
    render(<Rig close={close} />);
    const inside = screen.getByText('Inside');
    fireEvent.keyDown(inside, { key: 'Enter' });
    fireEvent.keyDown(screen.getByText('Takes the key'), { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    const outside = document.createElement('button');
    document.body.append(outside);
    const handler = escapeClosesPanel(close, () => null);
    handler({ key: 'Escape', defaultPrevented: false, target: outside, currentTarget: screen.getByTestId('panel'), preventDefault() {}, stopPropagation() {} });
    expect(close).not.toHaveBeenCalled();
  });
});

// A panel opened by a control inside a dialog that closes as it opens (#3416 item 59): its opener goes with the dialog, so it returns to where the dialog
// was handing focus back to, not the page's first control.
describe('useReturnFocusTarget after a dialog closed as the panel opened', () => {
  function Rig({ closedWith }: { closedWith: boolean }) {
    const [open, setOpen] = useState(false);
    const [linkThere, setLinkThere] = useState(true);
    const back = useReturnFocusTarget(open);
    return (
      <>
        <main tabIndex={-1}>
          <button id="header">Header</button>
          <button id="row">Row</button>
          {linkThere && (
            <button
              id="link"
              onClick={() => {
                if (closedWith) markDialogClosed(() => document.getElementById('row'));
                setOpen(true);
                setLinkThere(false);
              }}
            >
              Link
            </button>
          )}
        </main>
        <button onClick={() => (document.body.dataset.back = (back() as HTMLElement).id ?? 'main')}>Close</button>
      </>
    );
  }
  it('returns to where the closed dialog was handing focus, when the opener went with it', () => {
    render(<Rig closedWith />);
    screen.getByText('Link').focus();
    fireEvent.click(screen.getByText('Link'));
    fireEvent.click(screen.getByText('Close'));
    expect(document.body.dataset.back).toBe('row');
  });
  it('without a dialog that just closed, a gone opener falls to the page', () => {
    // The first test's dialog closed a moment ago by the clock; this one starts well after it.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5_000);
    render(<Rig closedWith={false} />);
    screen.getByText('Link').focus();
    fireEvent.click(screen.getByText('Link'));
    fireEvent.click(screen.getByText('Close'));
    expect(document.body.dataset.back).toBe('');
    vi.restoreAllMocks();
  });
});
