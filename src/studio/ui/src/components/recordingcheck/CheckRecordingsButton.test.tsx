// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../fixtures/daw';
import { createMockDawClient } from '../../ports/daw';
import { PortOverrides } from '../../ports/usePort';
import { TooltipProvider } from '../primitives/Tooltip';
import { CheckRecordingsButton } from './CheckRecordingsButton';
import * as opener from './openCheckRecordings';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(props: Partial<Parameters<typeof CheckRecordingsButton>[0]> = {}, setupId: DawSetupId = 'reaper') {
  const open = vi.spyOn(opener, 'openCheckRecordings').mockReturnValue(() => {});
  const daw = createMockDawClient(DAW_SETUPS[setupId], { chapterIds: [], candidateIds: [], findingIds: [] });
  render(
    <ApiProvider api={createMockApi()}>
      <PortOverrides clients={{ daw }}>
        <TooltipProvider>
          <CheckRecordingsButton chapterIds={['c1']} {...props} />
        </TooltipProvider>
      </PortOverrides>
    </ApiProvider>,
  );
  return { open };
}

const isOff = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled;

describe('CheckRecordingsButton (#2833): one label and one gate on every page', () => {
  it('is Check recordings, as a text button or an icon button, never "Check recordings…"', async () => {
    setup({ variant: 'text' });
    expect(await screen.findByRole('button', { name: 'Check recordings' })).toBeTruthy();
    cleanup();
    setup({ variant: 'icon' });
    expect(await screen.findByRole('button', { name: 'Check recordings' })).toBeTruthy();
  });

  it('opens the one dialog with the chapters it was given ticked', async () => {
    const t = setup({ chapterIds: ['c1', 'c2'] });
    await screen.findByRole('button', { name: 'Check recordings' });
    // The button is off until the DAW has said what it can do, and is drawn again (without its hint) when it is on.
    await waitFor(() => expect(isOff(screen.getByRole('button', { name: 'Check recordings' }))).toBe(false));
    await userEvent.click(screen.getByRole('button', { name: 'Check recordings' }));
    expect(t.open).toHaveBeenCalledWith(['c1', 'c2'], expect.anything());
  });

  it('hands the page’s onClosed to the dialog, so the page reads what the check changed', async () => {
    const onClosed = vi.fn();
    const t = setup({ onClosed });
    await screen.findByRole('button', { name: 'Check recordings' });
    await waitFor(() => expect(isOff(screen.getByRole('button', { name: 'Check recordings' }))).toBe(false));
    await userEvent.click(screen.getByRole('button', { name: 'Check recordings' }));
    expect(t.open.mock.calls[0][1]).toEqual({ onClosed });
  });

  it('a DAW that cannot review is off with its own sentence, the same on every page', async () => {
    const message = DAW_SETUPS['reaper-off'].capabilities.review?.message;
    expect(message).toBeTruthy();
    const t = setup({}, 'reaper-off');
    await screen.findByRole('button', { name: 'Check recordings' });
    await waitFor(() => expect(screen.getByText(message!, { selector: '.sr-only' })).toBeTruthy());
    const b = screen.getByRole('button', { name: 'Check recordings' });
    expect(isOff(b)).toBe(true);
    await userEvent.click(b);
    expect(t.open).not.toHaveBeenCalled();
    await userEvent.hover(b);
    expect(await screen.findByText(message!)).toBeTruthy();
  });

  it('a caller can add its own reason (already checked, no chapter to check)', async () => {
    const t = setup({ reason: 'Every chapter is checked as of the last save.' });
    const b = await screen.findByRole('button', { name: 'Check recordings' });
    expect(isOff(b)).toBe(true);
    await userEvent.click(b);
    expect(t.open).not.toHaveBeenCalled();
  });
});
