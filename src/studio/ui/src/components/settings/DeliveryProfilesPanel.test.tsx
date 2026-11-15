// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { UnsavedDraftsProvider } from '../../studio/drafts/unsavedDrafts';
import { TooltipProvider } from '../primitives/Tooltip';
import { CustomProfileList, useDeliveryProfiles } from './DeliveryProfilesPanel';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function Harness({ notify }: { notify: () => void }) {
  const ctl = useDeliveryProfiles(notify);
  return <CustomProfileList ctl={ctl} />;
}

describe('the delivery profile editor over a save that never answers', () => {
  it('is free again after the save limit, with an error and the typed number kept (#3461 round 7 BR2)', async () => {
    const api = createMockApi({}, { deliveryProfile: 'custom' });
    vi.spyOn(api, 'deliverySaveProfile').mockImplementation(() => new Promise(() => {}));
    render(
      <ApiProvider api={api}>
        <UnsavedDraftsProvider>
          <TooltipProvider>
            <Harness notify={vi.fn()} />
          </TooltipProvider>
        </UnsavedDraftsProvider>
      </ApiProvider>,
    );
    const edit = await screen.findByRole('button', { name: /^Edit / });
    fireEvent.click(edit);
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Tighter peak' } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save profile' }));
    await act(async () => {});
    // While the save is out the way out is off.
    expect(within(dialog).getByRole('button', { name: 'Discard changes' })).toHaveProperty('disabled', true);
    await act(async () => void vi.advanceTimersByTime(15_001));
    vi.useRealTimers();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Discard changes' })).toHaveProperty('disabled', false));
    expect(within(dialog).getByText('The profile was not saved: The save did not finish. What you typed is still here.')).toBeTruthy();
    expect(name.value).toBe('Tighter peak');
  });
});
