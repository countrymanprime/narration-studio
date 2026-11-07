// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { DAW_SETUPS } from '../../fixtures/daw';
import { createMockDawClient } from '../../ports/daw';
import { PortOverrides } from '../../ports/usePort';
import { TooltipProvider } from '../primitives/Tooltip';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CreditsRow } from '../credits/useCreditsRows';
import { CreditsRowPanel } from './CreditsRowPanel';

const ROW: CreditsRow = { kind: 'opening', words: 7, estimatedSeconds: 3, unresolved: ['Title', 'Author', 'Narrator'], status: 'not_started' };

function panel(row: CreditsRow = ROW) {
  render(
    <ApiProvider api={createMockApi()}>
      <PortOverrides clients={{ daw: createMockDawClient(DAW_SETUPS.reaper, { chapterIds: [], candidateIds: [], findingIds: [] }) }}>
        <TooltipProvider>
          <MemoryRouter>
            <CreditsRowPanel open row={row} label="Opening credits" onStatus={vi.fn()} onClose={vi.fn()} />
          </MemoryRouter>
        </TooltipProvider>
      </PortOverrides>
    </ApiProvider>,
  );
}

describe('CreditsRowPanel', () => {
  it('says where the unfilled tokens are filled in, beside the warning (alignment audit R3PR1-10)', () => {
    panel();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/3 tokens not filled in: Title, Author, Narrator/);
    expect(screen.getByRole('link', { name: 'Fill in under Settings > Credits' }).getAttribute('href')).toBe('/settings#credits');
  });

  it('keeps "about 3s" on one line and puts Open in Script beside Recording check, apart from the status select (XPR1-25)', async () => {
    panel();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check recordings' }).getAttribute('aria-disabled')).toBeNull());
    expect(screen.getByText('about 3s').className).toContain('whitespace-nowrap');
    const script = screen.getByRole('link', { name: 'Open in Script' });
    // The icon button sits in its tooltip target: the row that holds the link holds the button too.
    expect(script.parentElement!.contains(screen.getByRole('button', { name: 'Check recordings' }))).toBe(true);
  });
});
