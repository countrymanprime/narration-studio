// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { createMockDawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { TooltipProvider } from '../../primitives/Tooltip';
import * as opener from '../../recordingcheck/openCheckRecordings';
import { EditingHeader } from './EditingHeader';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function show(checkRecording?: Parameters<typeof EditingHeader>[0]['checkRecording'], checkReason?: string) {
  const daw = createMockDawClient(DAW_SETUPS.reaper, { chapterIds: [], candidateIds: [], findingIds: [] });
  render(
    <ApiProvider api={createMockApi()}>
      <PortOverrides clients={{ daw }}>
        <TooltipProvider>
          <EditingHeader
            stepper={null}
            legend={null}
            strip={{ open: false, toggle: () => {} }}
            stripFits={false}
            drawerOpen={false}
            onDrawer={() => {}}
            checkRecording={checkRecording}
            checkReason={checkReason}
          />
        </TooltipProvider>
      </PortOverrides>
    </ApiProvider>,
  );
}

// #4042: the check used to sit only in the "Not transcribed yet" strip, so a chapter that had been heard once had no way to be checked again from Editing.
describe('the Editing header re-check', () => {
  it('offers Check recordings for the chapter on every state of the page, and a press opens the shared dialog', async () => {
    const open = vi.spyOn(opener, 'openCheckRecordings').mockReturnValue(() => {});
    const onClosed = vi.fn();
    show({ chapterIds: ['c1'], onClosed });
    const button = await screen.findByRole('button', { name: 'Check recordings' });
    await waitFor(() => expect(button.getAttribute('aria-disabled')).toBeNull());
    fireEvent.click(button);
    expect(open).toHaveBeenCalledWith(['c1'], { onClosed });
  });

  it('is off, with its reason, for a chapter with no audio, and a press opens nothing', async () => {
    const open = vi.spyOn(opener, 'openCheckRecordings').mockReturnValue(() => {});
    show({ chapterIds: ['c1'], onClosed: vi.fn() }, 'This chapter has no audio to check yet.');
    const button = await screen.findByRole('button', { name: 'Check recordings' });
    await waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('true'));
    fireEvent.click(button);
    expect(open).not.toHaveBeenCalled();
  });

  it('offers none while the page has no chapter record to check', () => {
    show(undefined);
    expect(screen.queryByRole('button', { name: 'Check recordings' })).toBeNull();
  });
});
