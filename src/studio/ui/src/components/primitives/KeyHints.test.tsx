// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KeyHints, PageFooterProvider } from './KeyHints';

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
    // Left-aligned: a wrapped second line starts under the first, not as a centred orphan.
    expect(cls).toContain('justify-start');
    expect(cls).not.toContain('justify-center');
  });

  it('renders extra children after the hints', () => {
    render(
      <KeyHints hints={hints}>
        <span>extra</span>
      </KeyHints>,
    );
    expect(screen.getByText('extra')).toBeTruthy();
  });

  // XED-25: a toast covered the right end of the shell's key-hint footer.
  it('in the shell footer, is not drawn below 860 px, a touch width (R3PF-17); drawn where it stands, it stays', () => {
    render(<KeyHints hints={[{ keys: ['Space'], label: 'Play' }]} />);
    expect(screen.getByRole('note').className).not.toContain('max-[860px]:hidden');
    cleanup();
    const footer = document.createElement('footer');
    document.body.append(footer);
    render(
      <PageFooterProvider value={footer}>
        <KeyHints hints={[{ keys: ['Space'], label: 'Play' }]} />
      </PageFooterProvider>,
    );
    expect(footer.querySelector('[role="note"]')?.className).toContain('max-[860px]:hidden');
    cleanup();
    footer.remove();
  });

  it("in the shell's page footer, makes the toasts keep clear of it; drawn where it stands, leaves that to its own footer", () => {
    document.documentElement.style.removeProperty('--toast-clear');
    render(<KeyHints hints={[{ keys: ['Space'], label: 'Play' }]} />);
    expect(document.documentElement.style.getPropertyValue('--toast-clear')).toBe('');
    cleanup();
    const footer = document.createElement('footer');
    document.body.append(footer);
    const view = render(
      <PageFooterProvider value={footer}>
        <KeyHints hints={[{ keys: ['Space'], label: 'Play' }]} />
      </PageFooterProvider>,
    );
    expect(document.documentElement.style.getPropertyValue('--toast-clear')).not.toBe('');
    view.unmount();
    expect(document.documentElement.style.getPropertyValue('--toast-clear')).toBe('');
    footer.remove();
  });
});
