// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from './Button';
import { IconButton } from './IconButton';

afterEach(cleanup);

// `aria-disabled` is how a button stays focusable while it is off (so it can say why). The primitive must draw that state the way it draws the
// native `disabled` one: dimmed, a not-allowed cursor, and no hover change. Before this, only `IconButton` dimmed it and `Button` left each call
// site to remember, so the header Undo and "A then B" looked as live as an enabled button.
const DIM = 'not-aria-busy:aria-disabled:opacity-55';
const CURSOR = 'not-aria-busy:aria-disabled:cursor-not-allowed';

describe('aria-disabled look', () => {
  for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const) {
    it(`Button ${variant} is dimmed with a not-allowed cursor and has no hover change while aria-disabled`, () => {
      render(
        <Button variant={variant} aria-disabled="true">
          Save
        </Button>,
      );
      const classes = screen.getByRole('button', { name: 'Save' }).className.split(/\s+/);
      expect(classes).toContain(DIM);
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
});
