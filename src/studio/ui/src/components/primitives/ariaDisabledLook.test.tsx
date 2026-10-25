// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from './Button';
import { IconButton } from './IconButton';

afterEach(cleanup);

// `aria-disabled` is how a button stays focusable while it is off (so it can say why). The primitive must draw that state the way it draws the
// native `disabled` one: off-looking, a not-allowed cursor, and no hover change. Before this, only `IconButton` dimmed it and `Button` left each call
// site to remember, so the header Undo and "A then B" looked as live as an enabled button. The behaviour changed for `Button`: its outlined and
// filled variants draw one grey disabled look instead of a 55% copy of themselves (alignment audit R3EN2-14, R3MS-5, R4SE2-10); `IconButton`
// and `Button inverse` keep the 55% dim.
const DIM = 'not-aria-busy:aria-disabled:opacity-55';
const OFF_LOOK = [
  'not-aria-busy:aria-disabled:bg-[var(--surface-2)]',
  'not-aria-busy:aria-disabled:text-[var(--text-muted)]',
  'disabled:bg-[var(--surface-2)]',
];
const CURSOR = 'not-aria-busy:aria-disabled:cursor-not-allowed';

describe('aria-disabled look', () => {
  for (const variant of ['primary', 'secondary', 'ghost', 'danger', 'danger-solid'] as const) {
    it(`Button ${variant} draws the one grey disabled look with a not-allowed cursor and has no hover change while aria-disabled`, () => {
      render(
        <Button variant={variant} aria-disabled="true">
          Save
        </Button>,
      );
      const classes = screen.getByRole('button', { name: 'Save' }).className.split(/\s+/);
      for (const part of OFF_LOOK) expect(classes).toContain(part);
      expect(classes).not.toContain(DIM);
      expect(classes).toContain(CURSOR);
      // Every hover colour is gated on the button being live.
      const hovers = classes.filter((c) => /(^|:)hover:/.test(c));
      expect(hovers.length).toBeGreaterThan(0);
      for (const hover of hovers) expect(hover).toMatch(/^not-aria-disabled:hover:/);
    });
  }

  it('a pending Button keeps its busy look (60%), not the disabled one', () => {
    render(<Button pending>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain('aria-busy:opacity-60');
  });

  for (const variant of ['default', 'primary', 'danger'] as const) {
    it(`IconButton ${variant} is dimmed with a not-allowed cursor and has no hover change while gated`, () => {
      render(<IconButton label="Undo" variant={variant} disabledReason="Nothing to undo" />);
      const classes = screen.getByRole('button', { name: 'Undo' }).className.split(/\s+/);
      expect(classes).toContain(DIM);
      expect(classes).toContain(CURSOR);
      const hovers = classes.filter((c) => /(^|:)hover:/.test(c));
      expect(hovers.length).toBeGreaterThan(0);
      for (const hover of hovers) expect(hover).toMatch(/^not-aria-disabled:hover:/);
    });
  }

  it('Button inverse, on an ink surface, keeps the 55% dim', () => {
    render(
      <Button variant="inverse" aria-disabled="true">
        Bookmark
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Bookmark' }).className.split(/\s+/)).toContain(DIM);
  });
});
