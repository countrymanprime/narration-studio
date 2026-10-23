// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CardFinding } from './cardSelectors';
import { FindingRow } from './FindingRow';

afterEach(cleanup);

const said: CardFinding = {
  id: 'extra:p-1:5',
  source: 'gap',
  count: 'extra',
  type: 'Said twice',
  seconds: 6.3,
  text: '“the end”',
  suggested: 'Fix in edit',
  status: 'todo',
  paragraphId: 'p-1',
};
const row = (finding: CardFinding, editing?: string, routed = true) => {
  const ui = (
    <ul>
      <FindingRow finding={finding} busy={false} onAccept={vi.fn()} onIgnore={vi.fn()} {...(editing ? { editing } : {})} />
    </ul>
  );
  return render(routed ? <MemoryRouter>{ui}</MemoryRouter> : ui);
};

// Issue #2251 item 30: a line said twice is fixed on Editing, so its row links there.
describe('a said-twice row', () => {
  it('links to the line on Editing', () => {
    row(said, '/editing/c-1?passage=p-1');
    const link = screen.getByRole('link', { name: 'Open in Editing: Said twice at 0:06' });
    expect(link.getAttribute('href')).toBe('/editing/c-1?passage=p-1');
    expect(link.textContent).toBe('Open in Editing');
  });

  it('draws no link without one, or outside a router (a story, a unit test)', () => {
    row({ ...said, paragraphId: undefined });
    expect(screen.queryByRole('link')).toBeNull();
    cleanup();
    row(said, '/editing/c-1?passage=p-1', false);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
