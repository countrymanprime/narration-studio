// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';
import { TooltipTarget } from './Tooltip';

afterEach(cleanup);

describe('IconButton', () => {
  it('is a button named by its label, and never submits a form by accident', () => {
    render(
      <form onSubmit={(event) => event.preventDefault()}>
        <IconButton label="Edit this entry">i</IconButton>
      </form>,
    );
    const button = screen.getByRole('button', { name: 'Edit this entry' });
    expect(button.getAttribute('type')).toBe('button');
  });

  it('reports a click and ignores one when disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <IconButton label="Remove" onClick={onClick}>
        x
      </IconButton>,
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <IconButton label="Remove" onClick={onClick} disabled>
        x
      </IconButton>,
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('forwards the ref and standard attributes so a library part can render as it', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <IconButton label="Close" ref={ref} aria-expanded="false" data-probe="yes">
        x
      </IconButton>,
    );
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Close' }));
    expect(ref.current?.getAttribute('aria-expanded')).toBe('false');
    expect(ref.current?.getAttribute('data-probe')).toBe('yes');
  });

  it('keeps the disabled reason reachable through a hint wrapper', () => {
    render(
      <TooltipTarget text="No manuscript source is available">
        <IconButton label="Jump to manuscript" disabled>
          x
        </IconButton>
      </TooltipTarget>,
    );
    // The wrapper becomes the tab stop and carries the reason, because a disabled button takes no focus.
    expect(screen.getByRole('group', { name: 'No manuscript source is available' })).toBeTruthy();
  });

  it('a disabledReason keeps the button itself focusable and hoverable, unlike disabled (D6, WCAG 1.4.13)', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <TooltipTarget text="No pronunciation exists for this name yet.">
        <IconButton label="Play preview" disabledReason="No pronunciation exists for this name yet." onClick={onClick}>
          x
        </IconButton>
      </TooltipTarget>,
    );
    const button = screen.getByRole('button', { name: 'Play preview' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    // The tooltip is on the button itself, not a wrapper - there is no separate reachable group.
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('gives each variant its own look, exclusively', () => {
    render(
      <>
        <IconButton label="a">x</IconButton>
        <IconButton label="b" variant="primary">
          x
        </IconButton>
        <IconButton label="c" variant="danger">
          x
        </IconButton>
      </>,
    );
    expect(screen.getByRole('button', { name: 'a' }).className).toContain('text-[var(--text-muted)]');
    expect(screen.getByRole('button', { name: 'a' }).className).not.toContain('bg-[var(--accent)]');
    expect(screen.getByRole('button', { name: 'b' }).className).toContain('bg-[var(--accent)]');
    expect(screen.getByRole('button', { name: 'c' }).className).toContain('text-[var(--danger-text)]');
  });

  it('icon-button-from-an-action: derives its name, icon and hint from the catalogue', async () => {
    const user = userEvent.setup();
    render(<IconButton action="markDone" />);
    const button = screen.getByRole('button', { name: 'Mark done' });
    expect(button.querySelector('svg')?.getAttribute('data-icon')).toBe('circle-check');
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveProperty('textContent', 'Mark done');
  });

  it('puts the shortcut in the hint and in aria-keyshortcuts, not in the name', async () => {
    const user = userEvent.setup();
    render(<IconButton action="undo" />);
    const button = screen.getByRole('button', { name: 'Undo' });
    expect(button.getAttribute('aria-keyshortcuts')).toBe('Ctrl+Z');
    await user.tab();
    expect((await screen.findByRole('tooltip')).textContent).toBe('Undo (Ctrl+Z)');
  });

  it('a label still works and wins when both are given; children win the icon', async () => {
    const user = userEvent.setup();
    render(
      <IconButton action="markDone" label="Keep take 2">
        <span data-probe="kid" />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Keep take 2' });
    expect(screen.queryByRole('button', { name: 'Mark done' })).toBeNull();
    expect(button.querySelector('[data-probe="kid"]')).not.toBeNull();
    await user.tab();
    expect((await screen.findByRole('tooltip')).textContent).toBe('Keep take 2');
  });

  it('a label-only button draws no hint of its own', () => {
    render(<IconButton label="Edit">x</IconButton>);
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' }).closest('span')).toBeNull();
  });

  it('an action button keeps the press, the ref and the disabled behaviour', async () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const user = userEvent.setup();
    const { rerender } = render(<IconButton action="delete" variant="danger" onClick={onClick} ref={ref} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Delete' }));
    rerender(<IconButton action="delete" disabledReason="Nothing to delete" onClick={onClick} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
