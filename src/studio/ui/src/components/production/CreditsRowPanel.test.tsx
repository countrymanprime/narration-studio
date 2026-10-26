// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CreditsRow } from '../credits/useCreditsRows';
import { CreditsRowPanel } from './CreditsRowPanel';

const ROW: CreditsRow = { kind: 'opening', words: 7, estimatedSeconds: 3, unresolved: ['Title', 'Author', 'Narrator'], status: 'not_started' };

function panel(row: CreditsRow = ROW) {
  render(
    <MemoryRouter>
      <CreditsRowPanel open row={row} label="Opening credits" onStatus={vi.fn()} onCheck={vi.fn()} onClose={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('CreditsRowPanel', () => {
  it('says where the unfilled tokens are filled in, beside the warning (alignment audit R3PR1-10)', () => {
    panel();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/3 tokens not filled in: Title, Author, Narrator/);
    expect(screen.getByRole('link', { name: 'Fill in under Settings > Credits' }).getAttribute('href')).toBe('/settings#credits');
  });

  it('keeps "about 3s" on one line and puts Open in Script beside Recording check, apart from the status select (XPR1-25)', () => {
    panel();
    expect(screen.getByText('about 3s').className).toContain('whitespace-nowrap');
    const script = screen.getByRole('link', { name: 'Open in Script' });
    expect(script.parentElement).toBe(screen.getByRole('button', { name: 'Check recordings…' }).parentElement);
  });
});
