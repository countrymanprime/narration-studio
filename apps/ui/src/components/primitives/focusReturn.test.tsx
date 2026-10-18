// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { escapeClosesPanel } from './focusReturn';

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
    inside.addEventListener('keydown', (e) => e.preventDefault());
    fireEvent.keyDown(inside, { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    const outside = document.createElement('button');
    document.body.append(outside);
    const handler = escapeClosesPanel(close, () => null);
    handler({ key: 'Escape', defaultPrevented: false, target: outside, currentTarget: screen.getByTestId('panel'), preventDefault() {}, stopPropagation() {} });
    expect(close).not.toHaveBeenCalled();
  });
});
