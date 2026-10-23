// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KeyHints } from './KeyHints';

afterEach(cleanup);

const hints = [
  { keys: ['↑', '↓'], label: 'Notes' },
  { keys: ['Ctrl', 'Z'], label: 'Undo', id: 'undo' },
  { keys: ['Space'], label: 'Play' },
];

describe('KeyHints', () => {
  it('footer-is-a-note-region', () => {
    render(<KeyHints hints={hints} />);
    const foot = screen.getByRole('note', { name: 'Keyboard shortcuts' });
    expect(within(foot).getByText('Notes')).toBeTruthy();
    expect(foot.querySelectorAll('kbd')).toHaveLength(5);
    expect(foot.querySelector('kbd[data-key="ArrowUp"]')).not.toBeNull();
    expect(within(foot).getByText('Ctrl').tagName).toBe('KBD');
    expect(foot.querySelector('#undo')?.textContent).toContain('Undo');
    // each hint reads chord, then label
    const hint = foot.querySelector('#undo')!;
    expect(hint.lastChild?.textContent).toBe('Undo');
    expect(hint.firstElementChild?.querySelectorAll('kbd')).toHaveLength(2);
  });

  it('footer-has-its-own-tone-and-line', () => {
    render(<KeyHints hints={hints} />);
    const cls = screen.getByRole('note').className;
    expect(cls).toContain('border-t');
    expect(cls).toMatch(/bg-\[color-mix\(in_srgb,var\(--text\)_5%,var\(--bg\)\)\]/);
    expect(cls).toContain('justify-center');
  });

  it('renders extra children after the hints', () => {
    render(
      <KeyHints hints={hints}>
        <span>extra</span>
      </KeyHints>,
    );
    expect(screen.getByText('extra')).toBeTruthy();
  });
});
