// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAW_CAPABILITIES } from '../../api/contracts/daw';
import type { DawCapabilities } from '../../api/contracts/daw';
import { DAW_SETUPS } from '../../fixtures/daw';
import { CapabilityReference } from './CapabilityReferenceDialog';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const draw = (report: DawCapabilities | undefined, loadError = '') => render(<CapabilityReference report={report} loadError={loadError} onRetry={vi.fn()} />);

/** A window `width` px wide, for the media queries the layout class follows. */
function windowOf(width: number) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: width <= Number(/(\d+)px/.exec(query)?.[1]), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

describe('CapabilityReference', () => {
  it('draws a row for every capability with four tool cells in a wide window, and the linked tool by name', () => {
    draw(DAW_SETUPS.reaper);
    const table = screen.getByRole('table', { name: 'What the recording tools can do' });
    expect(within(table).getAllByRole('row')).toHaveLength(DAW_CAPABILITIES.length + 1);
    expect(within(table).getByRole('columnheader', { name: 'Now in REAPER' })).toBeTruthy();
    expect(within(within(table).getByText('Record').closest('tr')!).getAllByRole('cell')).toHaveLength(6);
  });

  it('folds the four tools into a "Works with" line in a narrow window, so the table has two columns', () => {
    windowOf(390);
    draw(DAW_SETUPS.reaper);
    const table = screen.getByRole('table', { name: 'What the recording tools can do' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['What', 'Now']);
    const record = within(table).getByText('Record').closest('tr')!;
    expect(within(record).getByText('Works with REAPER, Built-in recorder')).toBeTruthy();
    expect(within(record).getAllByRole('cell')).toHaveLength(2);
  });

  it('draws the static columns, with Not reported, before the host has answered, and Not listed for a key this build does not know', () => {
    draw(undefined);
    expect(screen.getAllByText('Not reported').length).toBe(DAW_CAPABILITIES.length);
    cleanup();
    draw({ ...DAW_SETUPS.reaper, capabilities: { ...DAW_SETUPS.reaper.capabilities, future_thing: { level: 'supported', available: true } } });
    const row = document.querySelector<HTMLElement>('[data-capability="future_thing"]')!;
    expect(within(row).getByText('future_thing')).toBeTruthy();
    expect(within(row).getAllByText('Not listed').length).toBe(4);
    expect(within(row).getByText('Available')).toBeTruthy();
  });

  it('says the host’s own sentence for what is unavailable, in a built-in recorder report, and never words a level as Experimental', () => {
    draw(DAW_SETUPS.builtin);
    expect(screen.getByRole('columnheader', { name: 'Now in the built-in recorder' })).toBeTruthy();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/experimental/i);
  });

  it('shows the read error with Retry and still draws the table', () => {
    draw(undefined, 'bridge unreadable');
    expect(screen.getByRole('alert').textContent).toContain('bridge unreadable');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.getAllByRole('row').length).toBe(DAW_CAPABILITIES.length + 1);
  });
});
